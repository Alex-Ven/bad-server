import { NextFunction, Request, Response } from 'express';
import fs, { unlinkSync } from 'fs';
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

        // Генерация безопасного имени файла (без использования оригинального)
        const fileExt = req.file.mimetype.split('/')[1] || 'bin';
        const safeFilename = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const uploadDir = path.resolve(process.env.UPLOAD_PATH || 'uploads');
        const filePath = path.join(uploadDir, safeFilename);

        // Перемещение файла
        await fs.promises.rename(req.file.path, filePath);

        // Формирование безопасного URL
        const publicUrl = `/uploads/${safeFilename}`;

        // Отправка JSON-ответа
        return res.status(201).json({
            fileName: publicUrl,
            size: req.file.size,
            mimeType: req.file.mimetype,
            originalName: ''
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