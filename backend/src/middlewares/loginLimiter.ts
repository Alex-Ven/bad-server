import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { Request } from 'express'
import Redis from 'ioredis'
import TooManyRequestsError from '../errors/too-many-requests-error'

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
        return ipKeyGenerator(req as unknown as string )
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
