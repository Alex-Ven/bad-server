import { Request, Express } from 'express'
import multer, { FileFilterCallback } from 'multer'
import { join } from 'path'
import { randomUUID } from 'crypto'
import sanitize from 'sanitize-filename'
import fs from 'fs'
import xss from 'xss'

type DestinationCallback = (error: Error | null, destination: string) => void
type FileNameCallback = (error: Error | null, filename: string) => void

// ✅ Безопасная валидация пути загрузки
const getSafeUploadPath = () => {
    const basePath = join(__dirname, '../public')
    const uploadPath = process.env.UPLOAD_PATH_TEMP || 'uploads'
    const fullPath = join(basePath, uploadPath)

    // Проверка, что путь находится внутри разрешенной директории
    const normalizedBase = basePath.split('\\').join('/').toLowerCase()
    const normalizedPath = fullPath.split('\\').join('/').toLowerCase()

    if (!normalizedPath.startsWith(normalizedBase)) {
        throw new Error('Недопустимый путь загрузки')
    }

    // Создать директорию если не существует
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
            cb(error as Error, '') // Исправлено: передаем Error первым параметром
        }
    },

    filename: (
        _req: Request,
        file: Express.Multer.File,
        cb: FileNameCallback
    ) => {
        // ✅ Безопасное имя файла
        const sanitizedOriginalName = sanitize(file.originalname)
        const fileExtension = sanitizedOriginalName.split('.').pop()
        const timestamp = Date.now()
        const uniqueFileName = `${timestamp}-${randomUUID()}.${fileExtension}`
        cb(null, uniqueFileName)
    },
})

const allowedTypes = [
    'image/png',
    'image/jpg',
    'image/jpeg',
    'image/gif',
    'image/svg+xml',
]

// ✅ Дополнительная санитизация SVG
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

const fileFilter = (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
) => {
    // Проверка MIME типа
    if (!allowedTypes.includes(file.mimetype)) {
        return cb(null, false) // Первый параметр null для ошибок, второй false для отклонения
    }

    // Дополнительная проверка расширения файла
    const fileExtension = file.originalname.split('.').pop()?.toLowerCase()
    const allowedExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg']

    if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
        return cb(null, false)
    }

    cb(null, true)
}

// ✅ Middleware для пост-обработки файлов
const postProcessFile = async (req: Request, _res: any, next: Function) => {
    if (req.file && req.file.mimetype === 'image/svg+xml') {
        try {
            await sanitizeSVG(req.file.path)
        } catch (error) {
            // Удалить опасный файл
            if (req.file?.path) {
                fs.unlinkSync(req.file.path)
            }
            return next(new Error('Ошибка обработки SVG файла'))
        }
    }
    next()
}

// ✅ Основной middleware с ограничениями
const fileMiddleware = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 1, // Ограничение количества файлов
    },
})

export default fileMiddleware
export { postProcessFile }
