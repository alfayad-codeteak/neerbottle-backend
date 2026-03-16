# AquaFliq Water Ordering System – Backend

NestJS backend for the AquaFliq water booking system (customer site, admin panel, future apps).

## Tech stack

- **NestJS** (v11+) – API, modules, DI
- **TypeScript** – Strict mode
- **Prisma** – PostgreSQL ORM
- **class-validator / class-transformer** – DTO validation
- **Swagger** – API docs at `/api/docs`

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Environment**

   Copy `.env.example` to `.env` and set at least:

   - `PORT` – server port (default `3000`)
   - `DATABASE_URL` – PostgreSQL connection string (required for auth). For Supabase use **Session mode (port 5432)** or migrations will hang.
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` – JWT secrets (see `.env.example`)

3. **Database (Supabase or any PostgreSQL)**

   **Using Supabase:**

   - Create a project at [supabase.com](https://supabase.com). Go to **Project Settings → Database**.
   - Copy the **Session mode** URI (port **5432**). Using port 6543 will cause `prisma migrate dev` to hang.
   - Set `DATABASE_URL` in `.env` and replace `[YOUR-PASSWORD]` with your database password.

   **Using local PostgreSQL:**

   - Set `DATABASE_URL="postgresql://user:password@localhost:5432/aquafliq?schema=public"` in `.env`.

   **Apply schema (Supabase or local):**

   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

4. **Run**

   ```bash
   npm start
   ```

   This runs the server with **watch mode**: it restarts automatically when you change files under `src/`.  
   For a single run without auto-restart: `npm run start:once`. For production: `npm run start:prod`.

   - API base: **http://localhost:3000/api**
   - Swagger: **http://localhost:3000/api/docs**
   - Health: **http://localhost:3000/api/health**

## APIs

**Health**

- `GET /api/health` – JSON with status, service name, version, uptime
- `GET /api/health/ping` – `{ "pong": true }` for load balancers

**Authentication** (see `backend.md`)

- `POST /api/auth/register` – Register with phone; send OTP then submit OTP (+ optional password) to create account
- `POST /api/auth/login` – Login with phone + password or phone + OTP → returns access & refresh tokens
- `POST /api/auth/refresh` – Body `{ "refreshToken": "..." }` → new access & refresh tokens

## Project structure

```
src/
├── common/              # Shared filters, guards, decorators, constants
├── config/              # App configuration (env, validation)
├── modules/             # Feature modules
│   ├── health/          # Health check (test API)
│   ├── auth/            # Register, login, refresh (JWT + OTP)
│   ├── products/        # (TODO) Water products
│   ├── orders/          # (TODO) Orders
│   ├── addresses/       # (TODO) Addresses
│   ├── payments/        # (TODO) Razorpay
│   └── admin/           # (TODO) Dashboard, reports
├── prisma/              # Prisma service and module
├── app.module.ts
└── main.ts
prisma/
├── schema.prisma
└── migrations/
test/                    # E2E and unit tests
```

## Scripts

| Script            | Description                |
|-------------------|----------------------------|
| `npm run start`   | Start app                  |
| `npm run start:dev` | Start with watch         |
| `npm run build`   | Build for production       |
| `npm run start:prod` | Run built app           |
| `npm run test`    | Unit tests                 |
| `npm run test:e2e`| E2E tests                  |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate`  | Run migrations        |

## Using Supabase

This backend stores data in **PostgreSQL**. You can use **Supabase** as the database:

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (free tier is enough).
2. **Project Settings → Database** → **Connection string** → **URI** → choose **Session mode** (port **5432**). Do not use Transaction mode (6543) or `prisma migrate dev` will hang.
3. **Set in `.env`:**
   ```env
   DATABASE_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-1-[REGION].pooler.supabase.com:5432/postgres?schema=public"
   ```
   Replace `[PASSWORD]` with your database password.
4. **Run migrations:** `npx prisma migrate dev --name init`
5. **Start the app:** `npm run start:dev`

You can inspect data in the Supabase dashboard under **Table Editor**.

## API overview

See **backend.md** for full API sections: Auth, Products, Orders, Addresses, Payment, Dashboard & Reports.
