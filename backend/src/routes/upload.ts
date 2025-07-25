import { Router } from 'express'
import { uploadFile } from '../controllers/upload'
import fileMiddleware, { postProcessFile } from '../middlewares/file'

const uploadRouter = Router()

// ✅ Правильное использование middleware
uploadRouter.post('/', 
    fileMiddleware.single('file'),  // Обработка файла
    postProcessFile,                // Пост-обработка (санитизация SVG)
    uploadFile                      // Основной контроллер
)

export default uploadRouter