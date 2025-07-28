import { Router } from 'express'
import { uploadFile } from '../controllers/upload'
import fileMiddleware, {
    handleMulterError,
    postProcessFile,
    validateFileType,
} from '../middlewares/file'
import { uploadLimiter } from '../middlewares/rateLimiter'

const uploadRouter = Router()

uploadRouter.post(
    '/',
    uploadLimiter,
    fileMiddleware.single('file'),
    handleMulterError,
    validateFileType,
    postProcessFile,
    uploadFile
)

export default uploadRouter
