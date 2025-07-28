import Tokens from 'csrf'
import { Request, Response, NextFunction } from 'express'
import BadRequestError from '../errors/bad-request-error'
import ForbiddenError from '../errors/forbidden-error'

// Декларация расширения типа Session для добавления кастомных полей
declare module 'express-session' {
    interface Session {
        csrfSecret?: string
    }
}

const tokens = new Tokens()
const CSRF_SECRET_SESSION_KEY = 'csrfSecret'

export const csrfProtection = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (!req.session) {
        return next(
            new Error(
                'Сессия не инициализирована. Убедитесь, что express-session настроен и используется до этого middleware.'
            )
        )
    }

    let secret = req.session[CSRF_SECRET_SESSION_KEY]

    if (!secret) {
        secret = tokens.secretSync()
        req.session[CSRF_SECRET_SESSION_KEY] = secret
    }

    const token = tokens.create(secret)

    if (!res.locals) {
        res.locals = {}
    }
    res.locals.csrfToken = token

    next()
}

export const generateCsrfToken = (
    _req: Request,
    _res: Response,
    next: NextFunction
) => {
    next()
}

export const csrfTokenApi = (
    _req: Request,
    res: Response,
    next: NextFunction
) => {
    if (res.locals.csrfToken) {
        res.setHeader('X-CSRF-Token', res.locals.csrfToken)
    } else {
        console.warn(
            'CSRF token not found in res.locals. Was csrfProtection middleware called?'
        )
    }
    next()
}

export const getCsrfToken = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        if (res.locals.csrfToken) {
            return res.json({
                csrfToken: res.locals.csrfToken,
                success: true,
                timestamp: new Date().toISOString(),
            })
        }
        if (!req.session) {
            return next(
                new Error('Сессия не инициализирована для генерации токена.')
            )
        }
        const secret = tokens.secretSync()
        const token = tokens.create(secret)
        return res.json({
            csrfToken: token,
            success: true,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        next(new BadRequestError('Ошибка генерации CSRF токена для API'))
    }
}

export const validateCsrfToken = (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    try {
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            return next()
        }

        if (!req.session) {
            return next(
                new ForbiddenError(
                    'Сессия не инициализирована. Требуется CSRF токен.'
                )
            )
        }

        const secret = req.session[CSRF_SECRET_SESSION_KEY]

        if (!secret) {
            return next(
                new ForbiddenError(
                    'CSRF токен отсутствует или истек. Возможно, сессия завершена или страница устарела. Пожалуйста, обновите страницу.'
                )
            )
        }

        const headerToken =
            (req.headers['x-csrf-token'] as string) ||
            (req.headers['x-xsrf-token'] as string)
        const bodyToken = req.body.csrf || req.body.csrfToken
        const requestToken = headerToken || bodyToken

        if (!requestToken) {
            return next(
                new BadRequestError('CSRF токен не предоставлен в запросе')
            )
        }

        const isValid = tokens.verify(secret, requestToken)

        if (!isValid) {
            return next(new ForbiddenError('Неверный CSRF токен'))
        }

        next()
    } catch (error) {
        next(new BadRequestError('Ошибка проверки CSRF токена'))
    }
}

export const validateCsrfHeader = (
    _req: Request,
    _res: Response,
    next: NextFunction
) => {
    next()
}

export const handleCsrfError = (
    error: any,
    _req: Request,
    res: Response,
    next: NextFunction
) => {
    if (error instanceof ForbiddenError) {
        return res.status(403).json({
            success: false,
            error: error.message,
            code: 'FORBIDDEN',
        })
    }

    if (error instanceof BadRequestError) {
        return res.status(error.statusCode).json({
            success: false,
            error: error.message,
            code: 'CSRF_VALIDATION_ERROR',
        })
    }

    next(error)
}
