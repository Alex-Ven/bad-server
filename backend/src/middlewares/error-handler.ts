import { ErrorRequestHandler } from 'express'
import TooManyRequestsError from '../errors/too-many-requests-error'

const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
    const statusCode = err.statusCode || 500
    const message =
        statusCode === 500 ? 'На сервере произошла ошибка' : err.message

    // Обработка TooManyRequestsError (429)
    if (err instanceof TooManyRequestsError) {
        res.setHeader('Retry-After', String(err.retryAfter))
        return res.status(429).json({
            message,
            retryAfter: err.retryAfter,
        })
    }

    // Стандартная обработка остальных ошибок
    res.status(statusCode).json({ message })

    next()
}

export default errorHandler
