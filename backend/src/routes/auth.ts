import { Router } from 'express'
import {
    getCurrentUser,
    getCurrentUserRoles,
    login,
    logout,
    refreshAccessToken,
    register,
    updateCurrentUser,
} from '../controllers/auth'
import auth from '../middlewares/auth'
import { loginLimiter, registrationLimiter } from '../middlewares/rateLimiter'

const authRouter = Router()

authRouter.get('/user', auth, getCurrentUser)
authRouter.patch('/me', auth, updateCurrentUser)
authRouter.get('/user/roles', auth, getCurrentUserRoles)
authRouter.post('/login', loginLimiter, login)
authRouter.get('/token', refreshAccessToken)
authRouter.post('/logout', logout)
authRouter.post('/register', registrationLimiter, register)

export default authRouter