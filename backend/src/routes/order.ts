import { Router } from 'express'
import {
    createOrder,
    deleteOrder,
    getOrderByNumber,
    getOrderCurrentUserByNumber,
    getOrders,
    getOrdersCurrentUser,
    updateOrder,
} from '../controllers/order'
import auth, { roleGuardMiddleware } from '../middlewares/auth'
import { validateOrderBody } from '../middlewares/validations'
import { Role } from '../models/user'
import { orderCreationLimiter, sensitiveOperationLimiter } from '../middlewares/rateLimiter'

const orderRouter = Router()

orderRouter.post('/', auth, orderCreationLimiter, validateOrderBody, createOrder)
orderRouter.get('/all', auth, getOrders)
orderRouter.get('/all/me', auth, getOrdersCurrentUser)
orderRouter.get(
    '/:orderNumber',
    auth,
    roleGuardMiddleware(Role.Admin),
    sensitiveOperationLimiter,
    getOrderByNumber
)
orderRouter.get('/me/:orderNumber', auth, getOrderCurrentUserByNumber)
orderRouter.patch(
    '/:orderNumber',
    auth,
    roleGuardMiddleware(Role.Admin),
    updateOrder
)

orderRouter.delete('/:id', auth, roleGuardMiddleware(Role.Admin), deleteOrder)

export default orderRouter
