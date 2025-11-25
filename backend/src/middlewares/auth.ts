import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { Model, Types } from 'mongoose';
import { REFRESH_TOKEN, ACCESS_TOKEN } from '../config';
import UserModel, { Role } from '../models/user';
import UnauthorizedError from '../errors/unauthorized-error';
import ForbiddenError from '../errors/forbidden-error';
import NotFoundError from '../errors/not-found-error';

// === ОСНОВНОЙ UNIVERSAL AUTH MIDDLEWARE ===
const auth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Пробуем access-токен из заголовка
    const authHeader = req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const payload = jwt.verify(token, ACCESS_TOKEN.secret) as JwtPayload;
        const user = await UserModel.findById(payload.sub).select('-password -salt');
        if (user) {
          res.locals.user = user;
          return next();
        }
      } catch {
        // Access-токен невалидный — идём дальше
      }
    }

    // 2. Если access нет — пробуем refresh из куки
    const refreshToken = req.cookies[REFRESH_TOKEN.cookie.name];
    if (!refreshToken) {
      return next(new UnauthorizedError('Токен не предоставлен'));
    }

    const payload = jwt.verify(refreshToken, REFRESH_TOKEN.secret) as JwtPayload;
    const user = await UserModel.findById(payload.sub).select('-password -salt');
    if (!user) {
      return next(new UnauthorizedError('Пользователь не найден'));
    }

    res.locals.user = user;
    return next();
  } catch (err) {
    return next(new UnauthorizedError('Не валидный токен'));
  }
};

// === ROLE GUARD ===
export function roleGuardMiddleware(...roles: Role[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (!res.locals.user) {
      return next(new UnauthorizedError('Необходима авторизация'));
    }

    const hasAccess = roles.some((role) =>
      res.locals.user.roles.includes(role)
    );

    if (!hasAccess) {
      return next(new ForbiddenError('Доступ запрещен'));
    }

    return next();
  };
}

// === CURRENT USER ACCESS (для заказов и т.д.) ===
export function currentUserAccessMiddleware<T>(
  model: Model<T>,
  idProperty: string,
  userProperty: keyof T
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id = req.params[idProperty];

    if (!res.locals.user) {
      return next(new UnauthorizedError('Необходима авторизация'));
    }

    if (res.locals.user.roles.includes(Role.Admin)) {
      return next();
    }

    const entity = await model.findById(id);

    if (!entity) {
      return next(new NotFoundError('Не найдено'));
    }

    const userEntityId = entity[userProperty] as Types.ObjectId;
    const hasAccess = new Types.ObjectId(res.locals.user._id).equals(userEntityId);

    if (!hasAccess) {
      return next(new ForbiddenError('Доступ запрещен'));
   }

    return next();
  };
}

export default auth;