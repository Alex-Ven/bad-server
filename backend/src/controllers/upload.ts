import { NextFunction, Request, Response } from 'express'
import { constants } from 'http2'
import { unlinkSync } from 'fs'
// import path from 'path'
// import { randomUUID } from 'crypto';
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

        // Используем имя файла из middleware (уже безопасное)
        const uploadDir = process.env.UPLOAD_PATH || 'uploads'
        const fileName = `/${uploadDir}/${req.file.filename}`
        const filePath = `/${uploadDir}/${fileName}`;

        // Проверка безопасности пути
        if (filePath.includes('..') || filePath.includes('//')) {
            throw new BadRequestError('Некорректный путь к файлу')
        }

        // Формирование полного ответа
        return res.status(constants.HTTP_STATUS_CREATED).json({
            success: true,
            data: {
                fileName,
                originalName: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype,
                downloadUrl: `${process.env.BASE_URL || ''}${fileName}`,
            },
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
