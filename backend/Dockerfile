# Etapa 1: dependencias.
# better-sqlite3 es un módulo nativo y necesita compilarse, así que las
# herramientas de compilación (python3, make, g++) viven solo en esta etapa.
FROM node:22-alpine AS deps

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Etapa 2: imagen final, sin compiladores.
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV APP_TIMEZONE=America/Bogota

COPY --from=deps /app/node_modules ./node_modules
COPY backend/ ./
COPY frontend/ ./frontend/

RUN mkdir -p data

EXPOSE 3000

CMD ["node", "server.js"]
