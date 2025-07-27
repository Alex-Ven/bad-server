import { NextFunction, Request, Response } from 'express'
import { constants } from 'http2'
import BadRequestError from '../errors/bad-request-error'

export const uploadFile = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (!req.file) {
        return next(new BadRequestError('Файл не загружен'))
    }
    try {
        // Формируем путь для ответа
        const uploadPath = process.env.UPLOAD_PATH || '';
        const fileName = uploadPath
            ? `/${uploadPath}/${req.file.filename}`
            : `/${req.file.filename}`;

        return res.status(constants.HTTP_STATUS_CREATED).send({
            fileName,
            originalName: req.file.originalname,
        });
    } catch (error) {
        return next(error);
    }
};

export default {}
