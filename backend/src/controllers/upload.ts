import { NextFunction, Request, Response } from 'express';
import { constants } from 'http2';
import { unlinkSync, renameSync } from 'fs';
import path from 'path';
import BadRequestError from '../errors/bad-request-error';
import { MIN_FILE_SIZE_BYTES } from '../middlewares/file';

// Тип для ответа API
interface UploadResponse {
    fileName: string;     // Путь к файлу
    originalName: string; // Оригинальное имя
    size: number;        // Размер файла
    mimeType: string;    // MIME-тип
}

export const uploadFile = async (
    req: Request,
    res: Response<UploadResponse>,
    next: NextFunction
) => {
    // 1. Проверка наличия файла
    if (!req.file) {
        return next(new BadRequestError('Файл не загружен'));
    }

    try {
        // 2. Проверка минимального размера
        if (req.file.size < MIN_FILE_SIZE_BYTES) {
            throw new BadRequestError(
                `Размер файла должен быть не менее ${MIN_FILE_SIZE_BYTES / 1024}KB`
            );
        }

        // 3. Генерация безопасного имени файла
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 9);
        const safeExtension = path.extname(req.file.originalname).toLowerCase();
        const newFilename = `${timestamp}-${randomString}${safeExtension}`;

        // 4. Определение путей
        const uploadDir = process.env.UPLOAD_PATH || 'uploads';
        const newPath = path.join(uploadDir, newFilename);
        const publicPath = `/${uploadDir}/${newFilename}`;

        // 5. Проверка безопасности путей
        if (!path.isAbsolute(uploadDir)) {
            throw new BadRequestError('Некорректный путь загрузки');
        }

        // 6. Переименование файла
        renameSync(req.file.path, newPath);

        // 7. Отправка ответа
        return res.status(constants.HTTP_STATUS_CREATED).json({
            fileName: publicPath,
            originalName: req.file.originalname,
            size: req.file.size,
            mimeType: req.file.mimetype
        });

    } catch (error) {
        // Удаление файла в случае ошибки
        if (req.file?.path) {
            try {
                unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error('Ошибка при удалении файла:', unlinkError);
            }
        }

        // Обработка ошибок
        if (error instanceof BadRequestError) {
            return next(error);
        }

        const message = error instanceof Error ? error.message : 'Ошибка загрузки файла';
        return next(new BadRequestError(message));
    }
};

export default uploadFile;