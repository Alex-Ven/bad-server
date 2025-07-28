import { Router } from 'express'
import {
    deleteCustomer,
    getCustomerById,
    getCustomers,
    updateCustomer,
} from '../controllers/customers'
import auth from '../middlewares/auth'
import { adminGuard } from '../middlewares/adminGuard'
import { apiRateLimiter } from '../middlewares/rateLimiter'

const customerRouter = Router()

customerRouter.get('/', apiRateLimiter, auth, adminGuard, getCustomers)
customerRouter.get('/:id', apiRateLimiter, auth, adminGuard, getCustomerById)
customerRouter.patch('/:id', apiRateLimiter, auth, adminGuard, updateCustomer)
customerRouter.delete('/:id', apiRateLimiter, auth, adminGuard, deleteCustomer)

export default customerRouter
