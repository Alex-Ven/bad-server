import { Request, Response } from 'express'
import Order from '../models/order'
import User, { IUser } from '../models/user'
import BadRequestError from '../errors/bad-request-error'

interface UserWithMethods extends IUser {
    comparePassword: (password: string) => Promise<boolean>
}

export const createOrder = async (req: Request, res: Response) => {
    try {
        // ✅ Здесь CSRF токен уже проверен middleware
        const { items, payment, email, phone, address } = req.body

        const order = await Order.create({
            items,
            payment,
            email,
            phone,
            address,
            user: (req as any).user._id,
        })

        res.status(201).json({
            success: true,
            data: order,
            message: 'Заказ успешно создан',
        })
    } catch (error) {
        throw new BadRequestError('Ошибка создания заказа')
    }
}

export const updateProfile = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id
        const { name, email } = req.body

        // ✅ CSRF защита уже проверена
        const user = await User.findByIdAndUpdate(
            userId,
            { name, email },
            { new: true }
        )

        if (!user) {
            throw new BadRequestError('Пользователь не найден')
        }

        res.json({
            success: true,
            data: user,
            message: 'Профиль успешно обновлен',
        })
    } catch (error) {
        throw new BadRequestError('Ошибка обновления профиля')
    }
}

export const changePassword = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id
        const { currentPassword, newPassword } = req.body

        // ✅ Получаем пользователя с паролем
        const user = (await User.findById(userId).select(
            '+password'
        )) as UserWithMethods | null

        if (!user) {
            throw new BadRequestError('Пользователь не найден')
        }

        // ✅ Проверяем текущий пароль
        const isMatch = await user.comparePassword(currentPassword)
        if (!isMatch) {
            throw new BadRequestError('Неверный текущий пароль')
        }

        // ✅ Обновляем пароль
        user.password = newPassword
        await user.save()

        res.json({
            success: true,
            message: 'Пароль успешно изменен',
        })
    } catch (error) {
        if (error instanceof BadRequestError) {
            throw error
        }
        throw new BadRequestError('Ошибка изменения пароля')
    }
}

export const deleteAccount = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id

        // ✅ Удаляем пользователя
        const user = await User.findByIdAndDelete(userId)

        if (!user) {
            throw new BadRequestError('Пользователь не найден')
        }

        res.json({
            success: true,
            message: 'Аккаунт успешно удален',
        })
    } catch (error) {
        throw new BadRequestError('Ошибка удаления аккаунта')
    }
}
