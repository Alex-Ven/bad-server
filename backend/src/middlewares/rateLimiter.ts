import rateLimit from 'express-rate-limit'
import { Request } from 'express'
import TooManyRequestsError from '../errors/too-many-requests-error'

// Хелпер-функции
const getUserId = (req: Request): string | undefined =>
    (req as any).user?._id || (req as any).user?.id

const getClientIdentifier = (req: Request): string => {
    try {
        if (req.ip) return req.ip;
        if (req.connection?.remoteAddress) return req.connection.remoteAddress;
        if (req.socket?.remoteAddress) return req.socket.remoteAddress;
        
        if (req.headers['x-forwarded-for']) {
            const forwardedIps = (req.headers['x-forwarded-for'] as string).split(',');
            return forwardedIps[0]?.trim() || 'unknown';
        }
        if (req.headers['x-real-ip']) {
            return (req.headers['x-real-ip'] as string).trim() || 'unknown';
        }
        
        console.warn('Could not determine client IP address');
        return 'unknown';
    } catch (error) {
        console.warn('Failed to generate IP key:', error);
        return 'unknown';
    }
};

const createLimiter = (options: {
    windowMs: number
    max: number
    keyPrefix: string
    errorMessage: string
    errorTimeout: number
    useUserId?: boolean
    useEmail?: boolean
}) => rateLimit({
        windowMs: options.windowMs,
        max: options.max,
        keyGenerator: (req: Request) => {
            if (options.useEmail && req.body?.email) {
                return `${options.keyPrefix}:email:${req.body.email.toLowerCase().trim()}`
            }
            if (options.useUserId) {
                const userId = getUserId(req)
                if (userId) return `${options.keyPrefix}:user:${userId}`
            }
            return `${options.keyPrefix}:ip:${getClientIdentifier(req)}`
        },
        handler: (_req: Request, _res, next) => {
            next(new TooManyRequestsError(options.errorMessage, options.errorTimeout))
        },
        standardHeaders: true,
        legacyHeaders: false,
        // ✅ Убрана зависимость от Redis - используем встроенный memory store
    })

// Лимитеры
export const loginLimiter = createLimiter({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 5,
    keyPrefix: 'login',
    errorMessage: 'Слишком много попыток входа. Попробуйте позже',
    errorTimeout: 900,
    useEmail: true,
})

export const sensitiveOperationLimiter = createLimiter({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 3,
    keyPrefix: 'sensitive',
    errorMessage: 'Слишком много критических операций. Попробуйте позже',
    errorTimeout: 900,
})

export const orderCreationLimiter = createLimiter({
    windowMs: 60 * 60 * 1000, // 1 час
    max: 10,
    keyPrefix: 'order',
    errorMessage: 'Превышен лимит создания заказов. Попробуйте позже',
    errorTimeout: 3600,
    useUserId: true,
})

export const registrationLimiter = createLimiter({
    windowMs: 60 * 60 * 1000, // 1 час
    max: 3,
    keyPrefix: 'register',
    errorMessage: 'Превышен лимит регистраций. Попробуйте позже',
    errorTimeout: 3600,
    useEmail: true,
})

export const uploadLimiter = createLimiter({
    windowMs: 60 * 60 * 1000, // 1 час
    max: 20,
    keyPrefix: 'upload',
    errorMessage: 'Превышен лимит загрузок файлов. Попробуйте позже',
    errorTimeout: 3600,
    useUserId: true,
})

export const apiRateLimiter = createLimiter({
    windowMs: 1 * 60 * 1000, // 1 минута
    max: 5, // Или ваше значение
    keyPrefix: 'api',
    errorMessage: 'Слишком много запросов к API. Попробуйте позже',
    errorTimeout: 60,
})

// ✅ Экспортируем функцию getClientIdentifier, если она нужна в других местах
export { getClientIdentifier };