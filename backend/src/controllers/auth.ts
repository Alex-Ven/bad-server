import crypto from 'crypto'
import { NextFunction, Request, Response } from 'express'
import { constants } from 'http2'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { Error as MongooseError } from 'mongoose'
import { REFRESH_TOKEN } from '../config'
import BadRequestError from '../errors/bad-request-error'
import ConflictError from '../errors/conflict-error'
import NotFoundError from '../errors/not-found-error'
import UnauthorizedError from '../errors/unauthorized-error'
import User from '../models/user'

// POST /auth/login
const login = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password } = req.body
        const user = await User.findUserByCredentials(email, password)
        const accessToken = user.generateAccessToken()
        const refreshToken = await user.generateRefreshToken()
        res.cookie(
            REFRESH_TOKEN.cookie.name,
            refreshToken,
            REFRESH_TOKEN.cookie.options
        )
        return res.json({
            success: true,
            user,
            accessToken,
        })
    } catch (err) {
        return next(err)
    }
}

// POST /auth/register
const register = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password, name } = req.body
        const newUser = new User({ email, password, name })
        await newUser.save()
        const accessToken = newUser.generateAccessToken()
        const refreshToken = await newUser.generateRefreshToken()

        res.cookie(
            REFRESH_TOKEN.cookie.name,
            refreshToken,
            REFRESH_TOKEN.cookie.options
        )
        return res.status(constants.HTTP_STATUS_CREATED).json({
            success: true,
            user: newUser,
            accessToken,
        })
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message))
        }
        if (error instanceof Error && error.message.includes('E11000')) {
            return next(
                new ConflictError('Пользователь с таким email уже существует')
            )
        }
        return next(error)
    }
}

// GET /auth/user
const getCurrentUser = async (
    _req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = res.locals.user._id
        const user = await User.findById(userId).orFail(
            () =>
                new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
        )
        res.json({ user, success: true })
    } catch (error) {
        next(error)
    }
}

// Можно лучше: вынести общую логику получения данных из refresh токена
const deleteRefreshTokenInUser = async (
    req: Request,
    _res: Response,
    _next: NextFunction
) => {
    const { cookies } = req
    const rfTkn = cookies[REFRESH_TOKEN.cookie.name]

    if (!rfTkn) {
        console.error('Refresh token missing in cookies')
        throw new UnauthorizedError('Не валидный токен')
    }

    try {
        // Верификация JWT токена
        const decodedRefreshTkn = jwt.verify(
            rfTkn,
            REFRESH_TOKEN.secret
        ) as JwtPayload

        console.log(`Processing token for user ${decodedRefreshTkn._id}`)

        // Поиск пользователя
        const user = await User.findOne({
            _id: decodedRefreshTkn._id,
        }).orFail(() => {
            console.error(`User ${decodedRefreshTkn._id} not found`)
            return new UnauthorizedError('Пользователь не найден в базе')
        })

        // Хеширование токена для сравнения
        const rTknHash = crypto
            .createHmac('sha256', REFRESH_TOKEN.secret)
            .update(rfTkn)
            .digest('hex')

        console.log(`Generated token hash: ${rTknHash.substring(0, 10)}...`)
        console.log(`User has ${user.tokens?.length || 0} stored tokens`)

        // Поиск совпадающего токена
        const tokenIndex =
            user.tokens?.findIndex((t) => t.token === rTknHash) ?? -1

        if (tokenIndex === -1) {
            console.error('No matching token found in database')
            console.error(
                'Stored tokens:',
                user.tokens?.map((t) => t.token.substring(0, 10))
            )
            throw new UnauthorizedError('Не валидный токен')
        }

        // Удаление токена
        user.tokens?.splice(tokenIndex, 1)
        await user.save()
        console.log('Token successfully removed')

        return user
    } catch (err) {
        console.error('Error in deleteRefreshTokenInUser:', err)

        if (err instanceof jwt.TokenExpiredError) {
            throw new UnauthorizedError('Срок действия токена истек')
        }

        if (err instanceof jwt.JsonWebTokenError) {
            throw new UnauthorizedError('Не валидный токен')
        }

        throw new UnauthorizedError('Ошибка аутентификации')
    }
}

// Реализация удаления токена из базы может отличаться
// GET  /auth/logout
const logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await deleteRefreshTokenInUser(req, res, next)
        res.clearCookie(REFRESH_TOKEN.cookie.name, {
            path: '/',
            domain: process.env.COOKIE_DOMAIN || undefined,
        })
        res.status(200).json({ success: true })
    } catch (error) {
        next(error)
    }
}

// GET  /auth/token
const refreshAccessToken = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = await deleteRefreshTokenInUser(req, res, next)
        const accessToken = user.generateAccessToken()
        const refreshToken = await user.generateRefreshToken()

        res.cookie(
            REFRESH_TOKEN.cookie.name,
            refreshToken,
            REFRESH_TOKEN.cookie.options
        )

        res.json({
            success: true,
            user,
            accessToken,
        })
    } catch (error) {
        next(error)
    }
}

const getCurrentUserRoles = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = res.locals.user._id
    try {
        await User.findById(userId, req.body, {
            new: true,
        }).orFail(
            () =>
                new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
        )
        res.status(200).json(res.locals.user.roles)
    } catch (error) {
        next(error)
    }
}

const updateCurrentUser = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = res.locals.user._id
    try {
        const updatedUser = await User.findByIdAndUpdate(userId, req.body, {
            new: true,
        }).orFail(
            () =>
                new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
        )
        res.status(200).json(updatedUser)
    } catch (error) {
        next(error)
    }
}

export {
    getCurrentUser,
    getCurrentUserRoles,
    login,
    logout,
    refreshAccessToken,
    register,
    updateCurrentUser,
}
