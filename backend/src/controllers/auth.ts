import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { constants } from 'http2';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { Error as MongooseError } from 'mongoose';
import { REFRESH_TOKEN } from '../config';
import BadRequestError from '../errors/bad-request-error';
import ConflictError from '../errors/conflict-error';
import NotFoundError from '../errors/not-found-error';
import UnauthorizedError from '../errors/unauthorized-error';
import User from '../models/user';
import { sanitizeInput } from '../utils/sanitize';

const sanitizeUserForOutput = (userDoc: any) => {
    const userObj = userDoc.toObject ? userDoc.toObject() : { ...userDoc };

    if (userObj.name && typeof userObj.name === 'string') {
        userObj.name = sanitizeInput(userObj.name);
    }

    return userObj;
};

const login = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password } = req.body;
        const user = await User.findUserByCredentials(email, password);
        const accessToken = user.generateAccessToken();
        const refreshToken = await user.generateRefreshToken();
        res.cookie(
            REFRESH_TOKEN.cookie.name,
            refreshToken,
            REFRESH_TOKEN.cookie.options
        );
        const sanitizedUser = sanitizeUserForOutput(user);
        return res.json({
            success: true,
            user: sanitizedUser,
            accessToken,
        });
    } catch (err) {
        return next(err);
    }
};

const register = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password, name } = req.body;
        const newUser = new User({ email, password, name });

        await newUser.save();
        const accessToken = newUser.generateAccessToken();
        const refreshToken = await newUser.generateRefreshToken();
        res.cookie(
            REFRESH_TOKEN.cookie.name,
            refreshToken,
            REFRESH_TOKEN.cookie.options
        );
        const sanitizedNewUser = sanitizeUserForOutput(newUser);
        return res.status(constants.HTTP_STATUS_CREATED).json({
            success: true,
            user: sanitizedNewUser,
            accessToken,
        });
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message));
        }
        if (error instanceof Error && error.message.includes('E11000')) {
            return next(
                new ConflictError('Пользователь с таким email уже существует')
            );
        }
        return next(error);
    }
};

const getCurrentUser = async (
    _req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = res.locals.user._id;
        const user = await User.findById(userId).orFail(
            () =>
                new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
        );
        const sanitizedUser = sanitizeUserForOutput(user);
        res.json({ user: sanitizedUser, success: true });
    } catch (error) {
        next(error);
    }
};

const deleteRefreshTokenInUser = async (
    req: Request,
    _res: Response,
    _next: NextFunction
) => {
    const { cookies } = req;
    const rfTkn = cookies[REFRESH_TOKEN.cookie.name];

    if (!rfTkn) {
        console.error('Refresh token missing in cookies');
        throw new UnauthorizedError('Не валидный токен');
    }

    try {
        const decodedRefreshTkn = jwt.verify(
            rfTkn,
            REFRESH_TOKEN.secret
        ) as JwtPayload;

        console.log(`Processing token for user ${decodedRefreshTkn._id}`);

        const user = await User.findOne({
            _id: decodedRefreshTkn._id,
        }).orFail(() => {
            console.error(`User ${decodedRefreshTkn._id} not found`);
            return new UnauthorizedError('Пользователь не найден в базе');
        });

        const rTknHash = crypto
            .createHmac('sha256', REFRESH_TOKEN.secret)
            .update(rfTkn)
            .digest('hex');

        console.log(`Generated token hash: ${rTknHash.substring(0, 10)}...`);
        console.log(`User has ${user.tokens?.length || 0} stored tokens`);

        const tokenIndex =
            user.tokens?.findIndex((t) => t.token === rTknHash) ?? -1;

        if (tokenIndex === -1) {
            console.error('No matching token found in database');
            console.error(
                'Stored tokens:',
                user.tokens?.map((t) => t.token.substring(0, 10))
            );
            throw new UnauthorizedError('Не валидный токен');
        }

        user.tokens?.splice(tokenIndex, 1);
        await user.save();
        console.log('Token successfully removed');

        return user;
    } catch (err) {
        console.error('Error in deleteRefreshTokenInUser:', err);

        if (err instanceof jwt.TokenExpiredError) {
            throw new UnauthorizedError('Срок действия токена истек');
        }

        if (err instanceof jwt.JsonWebTokenError) {
            throw new UnauthorizedError('Не валидный токен');
        }

        throw new UnauthorizedError('Ошибка аутентификации');
    }
};

const logout = async (req: Request, res: Response) => {
  const { cookies } = req;
  const refreshToken = cookies[REFRESH_TOKEN.cookie.name];

  // Попробуем удалить из базы, но если не получится — всё равно выйдем
  if (refreshToken) {
    try {
      await deleteRefreshTokenInUser(req, res, () => {}); // next не используем
    } catch (err) {
      // Игнорируем ошибки — токен мог истечь, быть невалидным и т.д.
      console.log('Logout: не удалось удалить токен из БД, но это ОК');
    }
  }

  // В любом случае — очищаем куку
  res.clearCookie(REFRESH_TOKEN.cookie.name, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });

  return res.json({ success: true, message: 'Logout successful' });
};

const refreshAccessToken = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = await deleteRefreshTokenInUser(req, res, next);
        const accessToken = user.generateAccessToken();
        const refreshToken = await user.generateRefreshToken();

        res.cookie(
            REFRESH_TOKEN.cookie.name,
            refreshToken,
            REFRESH_TOKEN.cookie.options
        );
        const sanitizedUser = sanitizeUserForOutput(user);
        res.json({
            success: true,
            user: sanitizedUser,
            accessToken,
        });
    } catch (error) {
        next(error);
    }
};

const getCurrentUserRoles = async (
    _req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = res.locals.user._id;
    try {
        const userWithRoles = await User.findById(userId, 'roles').orFail(
            () =>
                new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
        );
        res.status(200).json(userWithRoles.roles);
    } catch (error) {
        next(error);
    }
};

const updateCurrentUser = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = res.locals.user._id;
    try {
        const updatedUser = await User.findByIdAndUpdate(userId, req.body, {
            new: true,
            runValidators: true,
        }).orFail(
            () =>
                new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
        );
        const sanitizedUpdatedUser = sanitizeUserForOutput(updatedUser);
        res.status(200).json(sanitizedUpdatedUser);
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message));
        }
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Неверный формат ID пользователя'));
        }
        next(error);
    }
};

export {
    getCurrentUser,
    getCurrentUserRoles,
    login,
    logout,
    refreshAccessToken,
    register,
    updateCurrentUser,
};