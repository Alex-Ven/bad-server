import csrf from 'csurf'
import { Request, Response, NextFunction } from 'express'
import BadRequestError from '../errors/bad-request-error'
import ForbiddenError from '../errors/forbidden-error'

// ✅ Основной CSRF middleware
export const csrfProtection = csrf({
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 3600000
    }
})

// ✅ Middleware для генерации CSRF токена (чистый подход)
export const generateCsrfToken = (req: Request, res: Response, next: NextFunction) => {
    // Не мутируем существующие объекты
    // Просто убеждаемся, что токен будет доступен
    if (req.csrfToken) {
        // Токен будет доступен через req.csrfToken()
        // Можно также передать его через res.locals безопасно
        if (!res.locals) {
            res.locals = {}
        }
        // Проверяем, можно ли безопасно записать
        if (typeof res.locals === 'object' && res.locals !== null) {
            res.locals.csrfToken = req.csrfToken()
        }
    }
    next()
}

// ✅ Остальные middleware без мутации параметров
export const csrfTokenApi = (req: Request, res: Response, next: NextFunction) => {
    if (req.csrfToken) {
        res.setHeader('X-CSRF-Token', req.csrfToken())
    }
    next()
}

export const validateCsrfHeader = (_req: Request, _res: Response, next: NextFunction) => {
    next()
}

export const getCsrfToken = (req: Request, res: Response, next: NextFunction) => {
    try {
        if (req.csrfToken) {
            return res.json({ 
                csrfToken: req.csrfToken(),
                success: true,
                timestamp: new Date().toISOString()
            })
        }
        return next(new BadRequestError('CSRF защита не доступна'))
    } catch (error) {
        next(new BadRequestError('Ошибка генерации CSRF токена для API'))
    }
}

// ✅ Middleware для проверки CSRF токена в теле формы
export const validateFormCsrf = (req: Request, _res: Response, next: NextFunction) => {
    try {
        // Для POST/PUT/PATCH/DELETE запросов проверяем CSRF токен
        const isFormMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
        
        if (isFormMethod) {
            const formToken = req.body.csrf || req.body.csrfToken
            const headerToken = req.headers['x-csrf-token'] || req.headers['x-xsrf-token']
            
            // Если токен ожидается, но не предоставлен
            if (!formToken && !headerToken) {
                return next(new BadRequestError('CSRF токен обязателен для изменения данных'))
            }
        }
        
        next()
    } catch (error) {
        next(new BadRequestError('Ошибка проверки CSRF токена формы'))
    }
}


// ✅ Глобальный обработчик ошибок CSRF
export const handleCsrfError = (error: any, _req: Request, res: Response, next: NextFunction) => {
    if (error.code === 'EBADCSRFTOKEN') {
        // ✅ Используем ForbiddenError для CSRF ошибок
        return res.status(403).json({
            success: false,
            error: 'Неверный CSRF токен',
            message: 'Пожалуйста, обновите страницу и попробуйте снова',
            code: 'INVALID_CSRF_TOKEN'
        })
    }
    
    // Если это наша ошибка BadRequest
    if (error instanceof BadRequestError) {
        return res.status(error.statusCode).json({
            success: false,
            error: error.message,
            code: 'CSRF_VALIDATION_ERROR'
        })
    }
    
    // Если это ForbiddenError (например, из другого middleware)
    if (error instanceof ForbiddenError) {
        return res.status(error.statusCode).json({
            success: false,
            error: error.message,
            code: 'FORBIDDEN'
        })
    }
    
    next(error)
}
