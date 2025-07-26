import { errors } from 'celebrate'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import 'dotenv/config'
import express, { json, urlencoded } from 'express'
import mongoose from 'mongoose'
import path from 'path'
import session from 'express-session';
import { DB_ADDRESS } from './config'
import errorHandler from './middlewares/error-handler'
import serveStatic from './middlewares/serverStatic'
import routes from './routes'
import { handleCsrfError } from './middlewares/csrf'

const { PORT = 3000 } = process.env
const { ORIGIN_ALLOW } = process.env
const SESSION_SECRET = process.env.SESSION_SECRET || 'your_very_secret_key_here_at_least_32_characters_long';
const app = express()

app.use(
    session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            sameSite: 'strict',
            maxAge: 1000 * 60 * 60 * 24 * 7
        },
    })
);

app.use(cookieParser())

// app.use(cors())
app.use(
    cors({
        origin: ORIGIN_ALLOW,
        credentials: true,
        exposedHeaders: ['set-cookie'],
    })
)
app.use(express.static(path.join(__dirname, 'public')))

app.use(serveStatic(path.join(__dirname, 'public')))

app.use(urlencoded({ extended: true }))
app.use(json())

// ✅ Добавляем обработчик ошибок CSRF (до основных роутов)
app.use(handleCsrfError)

app.options('*', cors())
app.use(routes)
app.use(errors())
app.use(errorHandler)

// eslint-disable-next-line no-console

const bootstrap = async () => {
    try {
        await mongoose.connect(DB_ADDRESS)
        await app.listen(PORT, () => console.log(`ok, server running on port ${PORT}`))
    } catch (error) {
        console.error(error)
    }
}

bootstrap()
