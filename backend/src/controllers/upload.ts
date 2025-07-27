import { NextFunction, Request, Response } from 'express';
import { constants } from 'http2';
import { unlinkSync } from 'fs';
import BadRequestError from '../errors/bad-request-error';
import { MIN_FILE_SIZE_BYTES } from '../middlewares/file';

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


        // Генерируем новое имя файла (без использования оригинального)
        const timestamp = Date.now();
        const fileExtension = req.file.originalname.split('.').pop() || '';
        const newFilename = `${timestamp}-${Math.random().toString(36).substring(2, 9)}.${fileExtension}`;

        // Формируем путь для ответа
        const uploadDir = process.env.UPLOAD_PATH || 'uploads';
        const filePath = `/${uploadDir}/${newFilename}`;

        // Проверка безопасности пути
        if (filePath.includes('..') || filePath.includes('//')) {
            throw new BadRequestError('Некорректный путь к файлу');
        }

        // Формирование полного ответа
        return res.status(constants.HTTP_STATUS_CREATED).json({
            success: true,
            data: {
                newFilename,
                originalName: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype,
                downloadUrl: `${process.env.BASE_URL || ''}${newFilename}`,
            },
        })

    } catch (error: unknown) {
        if (req.file?.path) {
            try {
                unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error('Ошибка при удалении файла:', unlinkError);
            }
        }

        if (error instanceof BadRequestError) {
            return next(error);
        }
        
        return next(new BadRequestError(
            error instanceof Error ? error.message : 'Ошибка загрузки файла'
        ));
    }
};

export default uploadFile;