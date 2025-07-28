import { Router } from 'express'
import { uploadFile } from '../controllers/upload'
import fileMiddleware, { handleMulterError, postProcessFile, validateFileType } from '../middlewares/file'
import { uploadLimiter } from '../middlewares/rateLimiter'

const uploadRouter = Router()

// ✅ Правильное использование middleware
uploadRouter.post(
    '/',
    uploadLimiter,
    fileMiddleware.single('file'),
    handleMulterError, // Обработка файла
    validateFileType,
    postProcessFile, // Пост-обработка (санитизация SVG)
    uploadFile // Основной контроллер
)

export default uploadRouter
