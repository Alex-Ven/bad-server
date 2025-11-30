# frontend/Dockerfile
FROM node:22-alpine

WORKDIR /app/frontend

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# Вот эта строчка — ключ к жизни
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]