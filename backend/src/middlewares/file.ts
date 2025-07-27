import { Request, Response, NextFunction, Express } from 'express'
import multer, { FileFilterCallback } from 'multer'
import { join } from 'path'
import { randomUUID } from 'crypto'
import fs from 'fs'
import xss from 'xss'
import BadRequestError from '../errors/bad-request-error'

type DestinationCallback = (error: Error | null, destination: string) => void
type FileNameCallback = (error: Error | null, filename: string) => void

export const MIN_FILE_SIZE_BYTES = 2 * 1024 // 2KB
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

const getSafeUploadPath = () => {
    const basePath = join(__dirname, '../../public') // Изменено для правильного пути
    const uploadPath = 'uploads' // Используем фиксированную папку вместо env
    const fullPath = join(basePath, uploadPath)

    const normalizedBase = basePath.split('\\').join('/').toLowerCase()
    const normalizedPath = fullPath.split('\\').join('/').toLowerCase()

    if (!normalizedPath.startsWith(normalizedBase)) {
        throw new Error('Недопустимый путь загрузки')
    }

    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true })
    }

    return fullPath
}

const storage = multer.diskStorage({
    destination: (
        _req: Request,
        _file: Express.Multer.File,
        cb: DestinationCallback
    ) => {
        try {
            const safePath = getSafeUploadPath()
            cb(null, safePath)
        } catch (error) {
            cb(error as Error, '')
        }
    },

    filename: (
        _req: Request,
        file: Express.Multer.File,
        cb: FileNameCallback
    ) => {
        try {
            // Генерируем полностью новое имя файла без использования оригинального
            const timestamp = Date.now()
            const uniqueFileName = `${timestamp}-${randomUUID()}`

            // Получаем расширение файла из mimetype
            let extension = ''
            if (file.mimetype.includes('png')) extension = 'png'
            else if (
                file.mimetype.includes('jpeg') ||
                file.mimetype.includes('jpg')
            )
                extension = 'jpg'
            else if (file.mimetype.includes('gif')) extension = 'gif'
            else if (file.mimetype.includes('svg')) extension = 'svg'
            else if (file.mimetype.includes('plain')) extension = 'txt'

            cb(
                null,
                extension ? `${uniqueFileName}.${extension}` : uniqueFileName
            )
        } catch (error) {
            cb(error as Error, '')
        }
    },
})

const allowedTypes = [
    'image/png',
    'image/jpg',
    'image/jpeg',
    'image/gif',
    // 'image/svg+xml',
    // 'text/plain',
]

const sanitizeSVG = (filePath: string): Promise<void> =>
    new Promise((resolvePromise, reject) => {
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) return reject(err)

            const sanitizedContent = xss(data, {
                whiteList: {
                    svg: ['width', 'height', 'viewBox', 'xmlns'],
                    path: ['d', 'fill', 'stroke'],
                    circle: ['cx', 'cy', 'r', 'fill'],
                    rect: ['x', 'y', 'width', 'height', 'fill'],
                    g: [],
                    title: [],
                },
                stripIgnoreTag: true,
                stripIgnoreTagBody: ['script', 'iframe', 'object', 'embed'],
            })

            fs.writeFile(filePath, sanitizedContent, (writeErr) => {
                if (writeErr) return reject(writeErr)
                resolvePromise()
            })
        })
    })

const fileFilter: (
    req: Request,
    file: Express.Multer.File,
    callback: FileFilterCallback
) => void = (_req, file, callback) => {
    // Проверка MIME-типа
    if (!allowedTypes.includes(file.mimetype)) {
        return callback(new Error('Недопустимый тип файла')); // Multer ожидает только Error
    }

    // Проверка расширения файла
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (!ext || !['png', 'jpg', 'jpeg', 'gif'].includes(ext)) {
        return callback(new Error('Недопустимое расширение файла'));
    }

    // Успешный случай
    return callback(null, true);
};

const postProcessFile = async (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    if (req.file && req.file.mimetype === 'image/svg+xml') {
        try {
            await sanitizeSVG(req.file.path)
        } catch (error) {
            if (req.file?.path) {
                try {
                    fs.unlinkSync(req.file.path)
                } catch (unlinkErr) {
                    console.error(
                        'Failed to delete SVG file after sanitization error:',
                        unlinkErr
                    )
                }
            }
            return next(new BadRequestError('Ошибка обработки SVG файла'))
        }
    }
    next()
}

const handleMulterError = (
    err: any,
    _req: Request,
    _res: Response,
    next: NextFunction
) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            if (err.message.includes('small')) {
                return next(
                    new BadRequestError(
                        `Размер файла должен быть больше ${MIN_FILE_SIZE_BYTES / 1024} KB`
                    )
                )
            }
            return next(
                new BadRequestError(
                    `Размер файла должен быть меньше ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`
                )
            )
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return next(
                new BadRequestError('Превышено максимальное количество файлов.')
            )
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return next(new BadRequestError('Неожиданный файл.'))
        }
        return next(
            new BadRequestError(
                `Ошибка загрузки файла (multer): ${err.message}`
            )
        )
    }
    if (err instanceof Error) {
        return next(
            new BadRequestError(`Ошибка загрузки файла: ${err.message}`)
        )
    }
    next(err)
}

const fileMiddleware = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE_BYTES,
        files: 1,
    },
})

export { handleMulterError }
export default fileMiddleware
export { postProcessFile }
