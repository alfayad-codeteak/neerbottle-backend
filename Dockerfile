## Multi-stage build for NestJS + Prisma
## - Builder: installs deps, generates Prisma client, builds dist/
## - Runtime: installs production deps, runs migrations, starts server

FROM node:20-alpine AS builder

WORKDIR /app

# bcrypt needs native build when prebuilt binaries are missing (e.g. linux-arm64 + musl)
RUN apk add --no-cache --virtual .build-deps python3 make g++

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci && apk del .build-deps

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate

RUN npm run build


FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache --virtual .build-deps python3 make g++

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && apk del .build-deps
RUN npx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE 3000

## Start API process directly.
## Run migrations separately in CI/CD or manually to avoid startup crash loops.
CMD ["node", "dist/main"]
