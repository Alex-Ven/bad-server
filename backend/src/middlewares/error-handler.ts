import { ErrorRequestHandler } from 'express'
import TooManyRequestsError from '../errors/too-many-requests-error' // Импортируем кастомную ошибку

const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
    const statusCode = err.statusCode || 500
    const message =
        statusCode === 500 ? 'На сервере произошла ошибка' : err.message

    console.log(err) // Логируем ошибку для дебага

    // Обработка TooManyRequestsError (429)
    if (err instanceof TooManyRequestsError) {
        res.setHeader('Retry-After', String(err.retryAfter)) // Устанавливаем заголовок
        return res.status(429).send({
            message,
            retryAfter: err.retryAfter, // Опционально: отправляем время в теле ответа
        })
    }

    // Стандартная обработка остальных ошибок
    res.status(statusCode).send({ message })

    next()
}

export default errorHandler
