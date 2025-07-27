FROM node:22-alpine

RUN apk add --no-cache curl

# Создаем пользователя node и рабочие директории
RUN mkdir -p /app/public/uploads && \
    chown -R node:node /app

WORKDIR /app

# Устанавливаем зависимости
COPY --chown=node:node package*.json ./
RUN npm ci

# Копируем исходный код
COPY --chown=node:node . .

# Убедимся, что папка uploads существует и доступна
RUN mkdir -p /app/public/uploads && \
    chown -R node:node /app/public/uploads && \
    chmod -R 755 /app/public/uploads

USER node

CMD ["npm", "run", "dev"]