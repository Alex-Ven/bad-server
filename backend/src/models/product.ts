import { unlink } from 'fs'
import mongoose, { Document } from 'mongoose'
import { join, resolve } from 'path'

export interface IFile {
    fileName: string
    originalName: string
}

export interface IProduct extends Document {
    title: string
    image: IFile
    category: string
    description: string
    price: number | null
}

const PUBLIC_DIR = join(__dirname, '../public')
const ALLOWED_IMAGE_DIR = process.env.UPLOAD_PATH || 'uploads'

const cardsSchema = new mongoose.Schema<IProduct>(
    {
        title: {
            type: String,
            unique: true,
            required: [true, 'Поле "title" должно быть заполнено'],
            minlength: [2, 'Минимальная длина поля "title" - 2'],
            maxlength: [100, 'Максимальная длина поля "title" - 100'],
        },
        image: {
            fileName: {
                type: String,
                required: [true, 'Поле "image.fileName" должно быть заполнено'],
                validate: {
                    validator(v: string) {
                        if (!v) return false
                        const isValidFormat = /^[a-zA-Z0-9._-]+$/.test(v)
                        if (!isValidFormat) return false

                        try {
                            const fullPath = join(
                                PUBLIC_DIR,
                                ALLOWED_IMAGE_DIR,
                                v
                            )
                            const resolvedPath = resolve(fullPath)
                            const resolvedPublicDir = resolve(
                                join(PUBLIC_DIR, ALLOWED_IMAGE_DIR)
                            )
                            return resolvedPath.startsWith(resolvedPublicDir)
                        } catch (err) {
                            console.error(
                                `Error validating image path for fileName: ${v}`,
                                err
                            )
                            return false
                        }
                    },
                    message: (props) =>
                        `Имя файла "${props.value}" недопустимо или содержит запрещённые символы/пути.`,
                },
            },
            originalName: {
                type: String,
                maxlength: [255, 'Имя оригинального файла слишком длинное'],
            },
        },
        category: {
            type: String,
            required: [true, 'Поле "category" должно быть заполнено'],
            maxlength: [50, 'Категория слишком длинная'],
        },
        description: {
            type: String,
            maxlength: [2000, 'Описание слишком длинное'],
        },
        price: {
            type: Number,
            min: [0, 'Цена не может быть отрицательной'],
            default: null,
        },
    },
    { versionKey: false, timestamps: true }
)

cardsSchema.index({ title: 'text' })

cardsSchema.pre('findOneAndUpdate', async function deleteOldImage() {
    const update = this.getUpdate()
    let updateImage: IFile | undefined

    if (update && typeof update === 'object' && !Array.isArray(update)) {
        if (
            '$set' in update &&
            update.$set &&
            typeof update.$set === 'object' &&
            'image' in update.$set
        ) {
            updateImage = (update.$set as { image?: IFile }).image
        }
    }

    const query = this.getQuery()
    let docToUpdate = null
    if (query && typeof query === 'object') {
        docToUpdate = await this.model.findOne(query)
    }

    if (updateImage && docToUpdate?.image?.fileName) {
        try {
            const oldFileName = docToUpdate.image.fileName
            const fullPath = join(PUBLIC_DIR, ALLOWED_IMAGE_DIR, oldFileName)
            const resolvedPath = resolve(fullPath)
            const resolvedPublicDir = resolve(
                join(PUBLIC_DIR, ALLOWED_IMAGE_DIR)
            )

            if (resolvedPath.startsWith(resolvedPublicDir)) {
                unlink(fullPath, (err) => {
                    if (err) {
                        console.error(
                            `Failed to delete old image file: ${fullPath}`,
                            err
                        )
                    } else {
                        console.log(
                            `Successfully deleted old image file: ${fullPath}`
                        )
                    }
                })
            } else {
                console.error(
                    `Attempted to delete file outside allowed directory: ${fullPath}`
                )
            }
        } catch (err) {
            console.error(
                'Error in pre-update hook for deleting old image:',
                err
            )
        }
    }
})

cardsSchema.post('findOneAndDelete', async (doc: IProduct) => {
    if (doc?.image?.fileName) {
        try {
            const { fileName } = doc.image
            const fullPath = join(PUBLIC_DIR, ALLOWED_IMAGE_DIR, fileName)
            const resolvedPath = resolve(fullPath)
            const resolvedPublicDir = resolve(
                join(PUBLIC_DIR, ALLOWED_IMAGE_DIR)
            )

            if (resolvedPath.startsWith(resolvedPublicDir)) {
                unlink(fullPath, (err) => {
                    if (err) {
                        console.error(
                            `Failed to delete image file on product delete: ${fullPath}`,
                            err
                        )
                    } else {
                        console.log(
                            `Successfully deleted image file on product delete: ${fullPath}`
                        )
                    }
                })
            } else {
                console.error(
                    `Attempted to delete file outside allowed directory on product delete: ${fullPath}`
                )
            }
        } catch (err) {
            console.error('Error in post-delete hook for deleting image:', err)
        }
    }
})

export default mongoose.model<IProduct>('product', cardsSchema)
