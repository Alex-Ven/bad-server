import { Router } from 'express'
import {
    csrfProtection,
    generateCsrfToken,
    getCsrfToken,
} from '../middlewares/csrf'
import { createOrder, updateProfile, changePassword } from '../controllers/web'

const webRouter = Router()

// ✅ Применяем CSRF защиту ко всем веб-формам
webRouter.use(csrfProtection)
webRouter.use(generateCsrfToken)

// ✅ API endpoint для получения CSRF токена
webRouter.get('/csrf-token', getCsrfToken)

// ✅ Защищенные формы
webRouter.post('/orders', createOrder)
webRouter.post('/profile', updateProfile)
webRouter.post('/password', changePassword)

export default webRouter
