import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { REFRESH_TOKEN, ACCESS_TOKEN } from '../config';
import UserModel from '../models/user';
import UnauthorizedError from '../errors/unauthorized-error';

const auth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Сначала ищем access-токен в заголовке
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
      } catch (err) {
        // Access-токен невалидный или истёк — идём дальше
      }
    }

    // 2. Если access-токена нет или он просрочен — ищем refresh в куке
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

export default auth;