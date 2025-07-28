import { NextFunction, Request, Response } from 'express'
import { constants } from 'http2'
import { unlinkSync } from 'fs'
import BadRequestError from '../errors/bad-request-error'
import { MIN_FILE_SIZE_BYTES } from '../middlewares/file'

export const uploadFile = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (!req.file) {
        return next(new BadRequestError('Файл не загружен'))
    }

    try {
        // Проверка размера файла
        if (req.file.size < MIN_FILE_SIZE_BYTES) {
            throw new BadRequestError(
                `Размер файла должен быть не менее ${MIN_FILE_SIZE_BYTES / 1024}KB`
            )
        }

        // Формируем безопасный путь
        const uploadDir = 'uploads' // Фиксированное значение вместо process.env
        const fileName = `/${uploadDir}/${req.file.filename}`

        // Проверка безопасности пути
        if (fileName.includes('..') || fileName.includes('//')) {
            throw new BadRequestError('Некорректный путь к файлу')
        }
        // Формирование ответа
        return res.status(constants.HTTP_STATUS_CREATED).json({
            fileName: `/uploads/${req.file.filename}`,
            originalName: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
        })
    } catch (error) {
        if (req.file?.path) {
            try {
                unlinkSync(req.file.path)
            } catch (err) {
                console.error('Ошибка удаления файла:', err)
            }
        }

        if (error instanceof BadRequestError) {
            return next(error)
        }

        const message =
            error instanceof Error ? error.message : 'Ошибка загрузки файла'
        return next(new BadRequestError(message))
    }
}

export default uploadFile
