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
    try {
        // Проверка наличия файла
        if (!req.file) {
            throw new BadRequestError('Файл не загружен')
        }
        // 2. Проверка минимального размера
        if (req.file.size < MIN_FILE_SIZE_BYTES) {
            throw new BadRequestError(
                `Размер файла должен быть не менее ${MIN_FILE_SIZE_BYTES / 1024}KB`
            )
        }
        // Нормализация пути загрузки
        const uploadPath = (process.env.UPLOAD_PATH || 'uploads').replace(
            /^\/|\/$/g,
            ''
        ) // Удаляем слеши в начале/конце

        // Безопасное формирование пути
        const fileName = `/${uploadPath}/${req.file.filename}`

        // Проверка безопасности пути
        if (fileName.includes('..') || fileName.includes('//')) {
            throw new BadRequestError('Некорректный путь к файлу')
        }

        // Формирование ответа
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
        // Удаляем временный файл при ошибке
        if (req.file?.path) {
            try {
                unlinkSync(req.file.path)
            } catch (unlinkError) {
                console.error(
                    'Ошибка при удалении временного файла:',
                    unlinkError
                )
            }
        }

        if (error instanceof BadRequestError) {
            return next(error)
        }

        if (error instanceof Error) {
            return next(new BadRequestError(error.message))
        }

        // Для неизвестных ошибок
        return next(
            new BadRequestError('Неизвестная ошибка при загрузке файла')
        )
    }
}

export default uploadFile
