import { Request, Response, NextFunction, Express } from 'express'
import multer, { FileFilterCallback } from 'multer'
import { join } from 'path'
import { randomUUID } from 'crypto'
import fs from 'fs'
import xss from 'xss'
import { fileTypeFromBuffer } from 'file-type'
import BadRequestError from '../errors/bad-request-error'

type DestinationCallback = (error: Error | null, destination: string) => void
type FileNameCallback = (error: Error | null, filename: string) => void

export const MIN_FILE_SIZE_BYTES = 2 * 1024 // 2KB
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

const getSafeUploadPath = () => {
    const basePath = join(__dirname, '../../public')
    const uploadPath = 'uploads'
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

interface AllowedFileType {
    mime: string
    extensions: string[]
}

const allowedTypes: AllowedFileType[] = [
    { mime: 'image/png', extensions: ['png'] },
    { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'] },
    { mime: 'image/gif', extensions: ['gif'] },
    { mime: 'image/svg+xml', extensions: ['svg'] },
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
    _req: Request,
    _file: Express.Multer.File,
    callback: FileFilterCallback
) => void = (
    _req: any,
    _file: any,
    callback: (arg0: null, arg1: boolean) => void
) => {
    callback(null, true)
}

const validateFileType = async (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    if (req.file) {
        try {
            // Читаем первые несколько байтов файла для определения типа
            const buffer = Buffer.alloc(4100)
            const fd = fs.openSync(req.file.path, 'r')
            fs.readSync(fd, buffer, 0, buffer.length, 0)
            fs.closeSync(fd)

            const detectedType = await fileTypeFromBuffer(buffer)

            if (!detectedType) {
                fs.unlinkSync(req.file.path)
                return next(
                    new BadRequestError(
                        'Не удалось определить тип файла. Файл поврежден или недопустим.'
                    )
                )
            }

            // Проверяем, соответствует ли определенный тип разрешенному
            const isTypeAllowed = allowedTypes.some(
                (type) => type.mime === detectedType.mime
            )

            if (!isTypeAllowed) {
                fs.unlinkSync(req.file.path)
                return next(
                    new BadRequestError(
                        `Недопустимый тип файла: ${detectedType.mime}. Ожидался один из: ${allowedTypes.map((t) => t.mime).join(', ')}`
                    )
                )
            }
        } catch (error) {
            try {
                if (req.file?.path && fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path)
                }
            } catch (unlinkError) {
                console.error(
                    'Ошибка при удалении файла после ошибки валидации типа:',
                    unlinkError
                )
            }
            console.error('Ошибка валидации типа файла:', error)
            return next(
                new BadRequestError(
                    'Ошибка проверки содержимого загруженного файла'
                )
            )
        }
    }
    next()
}

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

export { handleMulterError, validateFileType, postProcessFile }
export default fileMiddleware
