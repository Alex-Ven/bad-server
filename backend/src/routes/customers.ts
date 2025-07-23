import { Router } from 'express'
import {
    deleteCustomer,
    getCustomerById,
    getCustomers,
    updateCustomer,
} from '../controllers/customers'
import auth from '../middlewares/auth'
import { adminGuard } from '../middlewares/adminGuard'

const customerRouter = Router()

customerRouter.get('/', auth, adminGuard, getCustomers)
customerRouter.get('/:id', auth, adminGuard, getCustomerById)
customerRouter.patch('/:id', auth, adminGuard, updateCustomer)
customerRouter.delete('/:id', auth, adminGuard, deleteCustomer)

export default customerRouter
