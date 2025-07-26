import { NextFunction, Request, Response } from 'express';
import { FilterQuery, Error as MongooseError, Types } from 'mongoose';
import escapeRegExp from '../utils/escapeRegExp';
import BadRequestError from '../errors/bad-request-error';
import NotFoundError from '../errors/not-found-error';
import Order, { IOrder } from '../models/order';
import Product from '../models/product';
import User from '../models/user';
import { sanitizeInput } from '../utils/sanitize';

const MAX_LIMIT = 10;
const VALID_ORDER_STATUSES = new Set([
    'cancelled',
    'completed',
    'new',
    'delivering',
]);

export const getOrders = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        let limitValue = Number(req.query.limit) || 10;
        if (Number.isNaN(limitValue) || limitValue <= 0) {
            limitValue = 10;
        }
        const limit = Math.min(limitValue, MAX_LIMIT);

        let pageValue = Number(req.query.page) || 1;
        if (Number.isNaN(pageValue) || pageValue < 1) {
            pageValue = 1;
        }
        const page = pageValue;

        const {
            sortField = 'createdAt',
            sortOrder = 'desc',
            status,
            totalAmountFrom,
            totalAmountTo,
            orderDateFrom,
            orderDateTo,
            search,
        } = req.query;

        const filters: FilterQuery<Partial<IOrder>> = {};

        if (status && typeof status === 'string' && VALID_ORDER_STATUSES.has(status)) {
            filters.status = status;
        }

        if (totalAmountFrom) {
            const amount = Number(totalAmountFrom);
            if (Number.isNaN(amount)) {
                throw new BadRequestError('Неверный формат totalAmountFrom');
            }
            filters.totalAmount = { ...filters.totalAmount, $gte: amount };
        }

        if (totalAmountTo) {
            const amount = Number(totalAmountTo);
            if (Number.isNaN(amount)) {
                throw new BadRequestError('Неверный формат totalAmountTo');
            }
            filters.totalAmount = { ...filters.totalAmount, $lte: amount };
        }

        if (orderDateFrom) {
            const date = new Date(orderDateFrom as string);
            if (Number.isNaN(date.getTime())) {
                throw new BadRequestError('Неверный формат orderDateFrom');
            }
            filters.createdAt = { ...filters.createdAt, $gte: date };
        }

        if (orderDateTo) {
            const date = new Date(orderDateTo as string);
            if (Number.isNaN(date.getTime())) {
                throw new BadRequestError('Неверный формат orderDateTo');
            }
            date.setHours(23, 59, 59, 999);
            filters.createdAt = { ...filters.createdAt, $lte: date };
        }

        const aggregatePipeline: any[] = [
            { $match: filters },
            {
                $lookup: {
                    from: 'products',
                    localField: 'products',
                    foreignField: '_id',
                    as: 'products',
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'customer',
                    foreignField: '_id',
                    as: 'customer',
                },
            },
            { $unwind: '$customer' },
            { $unwind: '$products' },
        ];

        if (search) {
            const searchStr = search as string;
            if (searchStr.length > 100) {
                throw new BadRequestError('Поисковый запрос слишком длинный');
            }
            const safeSearch = escapeRegExp(searchStr);
            const searchRegex = new RegExp(safeSearch, 'i');
            const searchNumber = Number(searchStr);
            const searchConditions: any[] = [{ 'products.title': searchRegex }];
            if (!Number.isNaN(searchNumber)) {
                searchConditions.push({ orderNumber: searchNumber });
            }
            aggregatePipeline.push({
                $match: {
                    $or: searchConditions,
                },
            });
        }

        const sort: { [key: string]: any } = {};
        if (sortField && sortOrder) {
            const allowedSortFields = ['createdAt', 'totalAmount', 'orderNumber', 'status'];
            if (allowedSortFields.includes(sortField as string)) {
                sort[sortField as string] = sortOrder === 'desc' ? -1 : 1;
            } else {
                sort.createdAt = -1;
            }
        } else {
            sort.createdAt = -1;
        }

        aggregatePipeline.push(
            { $sort: sort },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
                $group: {
                    _id: '$_id',
                    orderNumber: { $first: '$orderNumber' },
                    status: { $first: '$status' },
                    totalAmount: { $first: '$totalAmount' },
                    products: { $push: '$products' },
                    customer: { $first: '$customer' },
                    createdAt: { $first: '$createdAt' },
                },
            }
        );

        const orders = await Order.aggregate(aggregatePipeline, { maxTimeMS: 5000 });
        const totalOrders = await Order.countDocuments(filters, { maxTimeMS: 5000 });
        const totalPages = Math.ceil(totalOrders / limit);

        res.status(200).json({
            orders,
            pagination: {
                totalOrders,
                totalPages,
                currentPage: page,
                pageSize: limit,
            },
        });
    } catch (error) {
        next(error);
    }
};

export const getOrdersCurrentUser = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = res.locals.user._id;

        let limitValue = Number(req.query.limit) || 5;
        if (Number.isNaN(limitValue) || limitValue <= 0) {
            limitValue = 5;
        }
        const limit = Math.min(limitValue, MAX_LIMIT);

        let pageValue = Number(req.query.page) || 1;
        if (Number.isNaN(pageValue) || pageValue < 1) {
            pageValue = 1;
        }
        const page = pageValue;

        const { search } = req.query;

        const user = await User.findById(userId)
            .populate({
                path: 'orders',
                populate: [
                    {
                        path: 'products',
                    },
                    {
                        path: 'customer',
                    },
                ],
            })
            .orFail(
                () =>
                    new NotFoundError(
                        'Пользователь по заданному id отсутствует в базе'
                    )
            );

        let orders = user.orders as unknown as IOrder[];

        if (search) {
            const searchStr = String(search);
            if (searchStr.length > 100) {
                throw new BadRequestError('Поисковый запрос слишком длинный');
            }
            const searchRegex = new RegExp(escapeRegExp(searchStr), 'i');
            const searchNumber = Number(searchStr);

            const productsDoc = await Product.find({ title: searchRegex })
                .lean()
                .exec();
            const productIds = productsDoc.map((p) => p._id as Types.ObjectId);

            orders = orders.filter((order) => {
                const matchesProductTitle = order.products.some((product) =>
                    productIds.some(
                        (id: Types.ObjectId) => id.equals(product._id)
                    )
                );
                const matchesOrderNumber =
                    !Number.isNaN(searchNumber) &&
                    order.orderNumber === searchNumber;
                return matchesOrderNumber || matchesProductTitle;
            });
        }

        const totalOrders = orders.length;
        const totalPages = Math.ceil(totalOrders / limit);

        const startIndex = (page - 1) * limit;
        orders = orders.slice(startIndex, startIndex + limit);

        return res.send({
            orders,
            pagination: {
                totalOrders,
                totalPages,
                currentPage: page,
                pageSize: limit,
            },
        });
    } catch (error) {
        next(error);
    }
};

export const getOrderByNumber = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const order = await Order.findOne({
            orderNumber: req.params.orderNumber,
        })
            .populate(['customer', 'products'])
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному номеру отсутствует в базе'
                    )
            );
        return res.status(200).json(order);
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный номер заказа'));
        }
        return next(error);
    }
};

export const getOrderCurrentUserByNumber = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = res.locals.user._id;
    try {
        const order = await Order.findOne({
            orderNumber: req.params.orderNumber,
        })
            .populate(['customer', 'products'])
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному номеру отсутствует в базе'
                    )
            );
        if (!order.customer._id.equals(userId)) {
            return next(
                new NotFoundError('Заказ по заданному номеру отсутствует в базе')
            );
        }
        return res.status(200).json(order);
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный номер заказа'));
        }
        return next(error);
    }
};

export const createOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = res.locals.user._id;
        await User.findById(userId).orFail(
            () => new NotFoundError('Пользователь не найден')
        );

        const { address, payment, phone, total, email, comment } = req.body;

        const productIds = Array.isArray(req.body.items)
            ? req.body.items.map((id: unknown) => {
                  if (
                      typeof id !== 'string' &&
                      !(id instanceof Types.ObjectId)
                  ) {
                      throw new BadRequestError('Неверный формат ID товара');
                  }
                  try {
                      return new Types.ObjectId(id.toString());
                  } catch (error) {
                      throw new BadRequestError(`Невалидный ID товара: ${id}`);
                  }
              })
            : [];

        const products = await Product.find({ _id: { $in: productIds } });
        if (products.length !== productIds.length) {
            return next(
                new BadRequestError('Один или несколько товаров не найдены')
            );
        }

        const basket = products.filter((p) => p.price !== null);
        if (basket.length !== products.length) {
            return next(new BadRequestError('Один из товаров не продаётся'));
        }

        const totalBasket = basket.reduce((sum, p) => sum + (p.price || 0), 0);
        if (totalBasket !== total) {
            return next(new BadRequestError('Неверная сумма заказа'));
        }

        let sanitizedComment: string | undefined;
        if (comment !== undefined) {
            if (typeof comment !== 'string') {
                return next(new BadRequestError('Комментарий должен быть строкой'));
            }
            sanitizedComment = sanitizeInput(comment);
        }

        const newOrder = new Order({
            totalAmount: total,
            products: productIds,
            payment,
            phone,
            email,
            comment: sanitizedComment,
            customer: userId,
            deliveryAddress: address,
        });

        const savedOrder = await newOrder.populate(['customer', 'products']);
        await savedOrder.save();
        return res.status(200).json(savedOrder);
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message));
        }
        return next(error);
    }
};

export const updateOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { status } = req.body;

        if (status && (!VALID_ORDER_STATUSES.has(status) || typeof status !== 'string')) {
            return next(new BadRequestError('Недопустимый статус заказа'));
        }

        const updatedOrder = await Order.findOneAndUpdate(
            { orderNumber: req.params.orderNumber },
            { status },
            { new: true, runValidators: true }
        )
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному номеру отсутствует в базе'
                    )
            )
            .populate(['customer', 'products']);

        return res.status(200).json(updatedOrder);
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message));
        }
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный номер заказа'));
        }
        return next(error);
    }
};

export const deleteOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const deletedOrder = await Order.findOneAndDelete({ orderNumber: req.params.id })
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному номеру отсутствует в базе'
                    )
            )
            .populate(['customer', 'products']);
        return res.status(200).json(deletedOrder);
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный номер заказа'));
        }
        return next(error);
    }
};
