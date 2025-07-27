import { NextFunction, Request, Response } from 'express';
import { constants } from 'http2';
import { unlinkSync } from 'fs';
import BadRequestError from '../errors/bad-request-error';

export const uploadFile = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        if (!req.file) {
            throw new BadRequestError('Файл не загружен');
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

        // Возвращаем ответ с новым именем файла
        return res.status(constants.HTTP_STATUS_CREATED).json({
            fileName: filePath,
            originalName: req.file.originalname
        });

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