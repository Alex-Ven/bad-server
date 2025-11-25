import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { constants } from 'http2';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { Error as MongooseError } from 'mongoose';
import { REFRESH_TOKEN } from '../config';
import BadRequestError from '../errors/bad-request-error';
import ConflictError from '../errors/conflict-error';
import NotFoundError from '../errors/not-found-error';
// import UnauthorizedError from '../errors/unauthorized-error';
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

const deleteRefreshTokenInUser = async (req: Request,
    _res: Response,
    _next: NextFunction
) => {
  const refreshToken = req.cookies[REFRESH_TOKEN.cookie.name];
  if (!refreshToken) return; // просто выходим, если куки нет

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN.secret) as JwtPayload;
    const user = await User.findById(decoded._id);
    if (!user) return;

    const tokenHash = crypto
      .createHmac('sha256', REFRESH_TOKEN.secret)
      .update(refreshToken)
      .digest('hex');

    user.tokens = user.tokens?.filter(t => t.token !== tokenHash) || [];
    await user.save();
  } catch (err) {
    // Игнорируем любые ошибки — токен мог истечь, быть невалидным и т.д.
    // Главное — не падать!
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
    sameSite: 'none',
    path: '/',
  });

  return res.json({ success: true, message: 'Logout successful' });
};

const refreshAccessToken = async (req: Request, res: Response) => {
  const refreshToken = req.cookies[REFRESH_TOKEN.cookie.name];

  if (!refreshToken) {
    return res.status(401).json({ message: 'Токен не предоставлен' });
  }

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN.secret) as JwtPayload;
    const user = await User.findById(decoded._id);

    if (!user) {
      return res.status(401).json({ message: 'Пользователь не найден' });
    }

    // Удаляем старый токен (без падения)
    await deleteRefreshTokenInUser(req, res, () => {});

    // Создаём новые токены
    const accessToken = user.generateAccessToken();
    const newRefreshToken = await user.generateRefreshToken();

    // Ставим новую куку
    res.cookie(REFRESH_TOKEN.cookie.name, newRefreshToken, REFRESH_TOKEN.cookie.options);

    const sanitizedUser = sanitizeUserForOutput(user);
    return res.json({
      success: true,
      user: sanitizedUser,
      accessToken,
    });
  } catch (err) {
    return res.status(401).json({ message: 'Не валидный или истёкший токен' });
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