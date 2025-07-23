import { Request, Response, NextFunction } from 'express'
import ForbiddenError from '../errors/forbidden-error'
import { Role } from '../models/user'

// Расширяем тип Response из Express, чтобы включить locals.user
declare global {
    namespace Express {
        interface Response {
            locals: {
                user?: {
                    roles?: Role[]
                }
            }
        }
    }
}

export const adminGuard = (
    _req: Request,
    res: Response,
    next: NextFunction
) => {
    if (!res.locals.user?.roles?.includes(Role.Admin)) {
        return next(new ForbiddenError('Требуются права администратора'))
    }
    next()
}
