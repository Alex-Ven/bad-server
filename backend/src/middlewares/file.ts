// middlewares/file.ts
import { Request, Response, NextFunction, Express } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { join } from 'path';
import { randomUUID } from 'crypto';
import fs from 'fs';
import xss from 'xss';
import BadRequestError from '../errors/bad-request-error';

type DestinationCallback = (error: Error | null, destination: string) => void;
type FileNameCallback = (error: Error | null, filename: string) => void;

// Определяем размеры файлов для тестов
const MIN_FILE_SIZE_BYTES = 2 * 1024; // 2KB
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// ✅ Безопасная валидация пути загрузки
const getSafeUploadPath = () => {
    const basePath = join(__dirname, '../public');
    const uploadPath = process.env.UPLOAD_PATH || 'uploads';
    const fullPath = join(basePath, uploadPath);

    const normalizedBase = basePath.split('\\').join('/').toLowerCase();
    const normalizedPath = fullPath.split('\\').join('/').toLowerCase();

    if (!normalizedPath.startsWith(normalizedBase)) {
        throw new Error('Недопустимый путь загрузки');
    }

    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }

    return fullPath;
};

const storage = multer.diskStorage({
    destination: (
        _req: Request,
        _file: Express.Multer.File,
        cb: DestinationCallback
    ) => {
        try {
            const safePath = getSafeUploadPath();
            cb(null, safePath);
        } catch (error) {
            cb(error as Error, '');
        }
    },

    filename: (
        _req: Request,
        file: any, // Express.Multer.File,
        cb: FileNameCallback
    ) => {
        try {
            // Генерируем уникальное имя файла, игнорируя оригинальное имя
            const timestamp = Date.now();
            const uniqueId = randomUUID();
            
            // Получаем расширение файла из mimetype
            let extension = '';
            const mimeType = file.mimetype.toLowerCase();
            if (mimeType.includes('png')) extension = 'png';
            else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) extension = 'jpg';
            else if (mimeType.includes('gif')) extension = 'gif';
            else if (mimeType.includes('svg')) extension = 'svg';
            else if (mimeType.includes('plain')) extension = 'txt';

            const uniqueFileName = extension 
                ? `${timestamp}-${uniqueId}.${extension}` 
                : `${timestamp}-${uniqueId}`;
                
            cb(null, uniqueFileName);
        } catch (error) {
             cb(error as Error, '');
        }
    },
});

const allowedTypes = [
    'image/png',
    'image/jpg',
    'image/jpeg',
    'image/gif',
    'image/svg+xml',
    'text/plain',
];

// ✅ Дополнительная санитизация SVG
const sanitizeSVG = (filePath: string): Promise<void> =>
    new Promise((resolvePromise, reject) => {
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) return reject(err);

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
            });

            fs.writeFile(filePath, sanitizedContent, (writeErr) => {
                if (writeErr) return reject(writeErr);
                resolvePromise();
            });
        });
    });

const fileFilter = (
    _req: Request,
    file: any, // Express.Multer.File,
    cb: FileFilterCallback
) => {
    try {
        // Проверка MIME типа
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new BadRequestError('Недопустимый тип файла'));
        }

        if (file.originalname.includes('..') || file.originalname.includes('/')) {
            return cb(new BadRequestError('Имя файла содержит недопустимые символы'));
        }

        cb(null, true);
    } catch (error) {
        cb(error as Error);
    }
};

// ✅ Middleware для пост-обработки файлов
const postProcessFile = async (req: Request, _res: Response, next: NextFunction) => {
    if (req.file && req.file.path && req.file.mimetype === 'image/svg+xml') {
        try {
            await sanitizeSVG(req.file.path);
        } catch (error) {
            if (req.file?.path) {
                try {
                    fs.unlinkSync(req.file.path);
                } catch (unlinkErr) {
                    console.error('Failed to delete SVG file after sanitization error:', unlinkErr);
                }
            }
            return next(new BadRequestError('Ошибка обработки SVG файла'));
        }
    }
    next();
};

// Обработчик ошибок multer для интеграции с вашей системой ошибок
const handleMulterError = (err: any, _req: Request, _res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return next(new BadRequestError(`Размер файла превышает допустимый лимит ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} МБ.`));
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return next(new BadRequestError('Превышено максимальное количество файлов.'));
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return next(new BadRequestError('Неожиданный файл.'));
        }
        return next(new BadRequestError(`Ошибка загрузки файла (multer): ${err.message}`));
    }
    if (err instanceof BadRequestError) {
         return next(err);
    }
    if (err instanceof Error) {
        return next(new BadRequestError(`Ошибка загрузки файла: ${err.message}`));
    }
    next(err);
};

// ✅ Основной middleware с ограничениями
const fileMiddleware = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE_BYTES,
        files: 1,
    },
});

// Экспортируем константы для использования в контроллерах
export { handleMulterError, postProcessFile, MIN_FILE_SIZE_BYTES, MAX_FILE_SIZE_BYTES };
export default fileMiddleware;