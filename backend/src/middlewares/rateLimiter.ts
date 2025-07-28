import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { Request } from 'express'
import Redis from 'ioredis'
import TooManyRequestsError from '../errors/too-many-requests-error'

// ✅ Хелпер функция для безопасного получения user ID
const getUserId = (req: Request): string | undefined => (req as any).user?._id || (req as any).user?.id;

// ✅ Хелпер функция для получения email
// const getUserEmail = (req: Request): string | undefined => (req as any).user?.email;

const redis = new Redis({
    host: process.env.REDIS_HOST || 'redis',
    port: 6379,
    retryStrategy: (times) => Math.min(times * 50, 2000),
})

redis.on('error', (err) => {
    console.error('Redis error:', err)
})

export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 5, // максимум 5 попыток
    keyGenerator: (req: Request) => {
        // Явная проверка на наличие email в body
        if (req.body?.email && typeof req.body.email === 'string') {
            return req.body.email
        }
        // Используем встроенный обработчик IP для IPv6/IPv4
        return ipKeyGenerator(req as unknown as string)
    },
    handler: (req: Request, _res, next) => {
        const { email } = req.body
        if (email && typeof email === 'string') {
            redis
                .setex(`login:block:${email}`, 15 * 60, '1')
                .catch((err) => console.error('Redis setex error:', err))
        }
        next(new TooManyRequestsError('Попробуйте позже', 900))
    },
})

/// ✅ Rate limiter для критических операций
export const sensitiveOperationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 3, // максимум 3 попытки
    keyGenerator: (req: Request) => ipKeyGenerator(req as unknown as string),
    handler: (_req: Request, _res, next) => {
        next(new TooManyRequestsError('Слишком много критических операций. Попробуйте позже', 900))
    },
    standardHeaders: true,
    legacyHeaders: false
})


// ✅ Rate limiter для создания заказов
export const orderCreationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 час
    max: 10, // максимум 10 заказов в час
    keyGenerator: (req: Request) => {
        // Используем user ID если доступен
        const userId = getUserId(req);
        if (userId) {
            return `order:user:${userId}`
        }
        return `order:ip:${ipKeyGenerator(req as unknown as string)}`
    },
    handler: (_req: Request, _res, next) => {
        next(new TooManyRequestsError('Превышен лимит создания заказов. Попробуйте позже', 3600))
    },
    standardHeaders: true,
    legacyHeaders: false
})

// ✅ Rate limiter для регистрации
export const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 час
    max: 3, // максимум 3 регистрации в час
    keyGenerator: (req: Request) => {
        // Используем email или IP для регистрации
        if (req.body?.email && typeof req.body.email === 'string') {
            const sanitizedEmail = req.body.email.toLowerCase().trim()
            return `register:email:${sanitizedEmail}`
        }
        return `register:ip:${ipKeyGenerator(req as unknown as string)}`
    },
    handler: (_req: Request, _res, next) => {
        next(new TooManyRequestsError('Превышен лимит регистраций. Попробуйте позже', 3600))
    },
    standardHeaders: true,
    legacyHeaders: false
})

// ✅ Rate limiter для загрузки файлов
export const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 час
    max: 20, // максимум 20 загрузок в час
    keyGenerator: (req: Request) => {
        const userId = getUserId(req);
        if (userId) {
            return `upload:user:${userId}`
        }
        return `upload:ip:${ipKeyGenerator(req as unknown as string)}`
    },
    handler: (_req: Request, _res, next) => {
        next(new TooManyRequestsError('Превышен лимит загрузок файлов. Попробуйте позже', 3600))
    },
    standardHeaders: true,
    legacyHeaders: false
})

// ✅ Rate limiter для общих API запросов (например, для /customers)
export const apiRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 минута
    max: 20, // максимум 20 запросов в минуту с одного IP
    keyGenerator: (req: Request) => ipKeyGenerator(req as unknown as string),
    handler: (_req: Request, _res, next) => {
        next(new TooManyRequestsError('Слишком много запросов к API. Попробуйте позже.', 60));
    },
    standardHeaders: true,
    legacyHeaders: false,
});
