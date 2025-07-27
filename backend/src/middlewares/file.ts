import { Request, Response, NextFunction, Express } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { join } from 'path';
import { randomUUID } from 'crypto';
import sanitize from 'sanitize-filename';
import fs from 'fs';
import xss from 'xss';
import BadRequestError from '../errors/bad-request-error';

type DestinationCallback = (error: Error | null, destination: string) => void;
type FileNameCallback = (error: Error | null, filename: string) => void;

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const getSafeUploadPath = () => {
    const basePath = join(__dirname, '../public');
    const uploadPath = process.env.UPLOAD_PATH_TEMP || 'uploads';
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
        file: Express.Multer.File,
        cb: FileNameCallback
    ) => {
        try {
            const originalName = file.originalname;
            if (
                originalName.includes('..') ||
                originalName.startsWith('/') ||
                originalName.includes('\\') ||
                originalName.startsWith('.')
            ) {
                return cb(new Error('Имя файла содержит запрещенные символы.'), '');
            }

            const sanitizedOriginalName = sanitize(originalName);
            if (!sanitizedOriginalName) {
                 return cb(new Error('Имя файла некорректно после санитизации.'), '');
            }
            const fileExtension = sanitizedOriginalName.split('.').pop();
            const timestamp = Date.now();
            const uniqueFileName = `${timestamp}-${randomUUID()}.${fileExtension}`;
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
    file: Express.Multer.File,
    cb: FileFilterCallback
) => {
    try {
        const originalName = file.originalname;
        if (
            originalName.includes('..') ||
            originalName.startsWith('/') ||
            originalName.includes('\\') ||
            originalName.startsWith('.')
        ) {
            return cb(new Error('Имя файла содержит запрещенные символы.'));
        }

        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Недопустимый тип файла'));
        }

        const fileExtension = originalName.split('.').pop()?.toLowerCase();
        const allowedExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'txt'];

        if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
            return cb(new Error('Недопустимое расширение файла'));
        }

        cb(null, true);
    } catch (error) {
        cb(error as Error);
    }
};

const postProcessFile = async (req: Request, _res: Response, next: NextFunction) => {
    if (req.file && req.file.mimetype === 'image/svg+xml') {
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
    if (err instanceof Error) {
        return next(new BadRequestError(`Ошибка загрузки файла: ${err.message}`));
    }
    next(err);
};

const fileMiddleware = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE_BYTES,
        files: 1,
    },
});

export { handleMulterError };
export default fileMiddleware;
export { postProcessFile };