# Cloudflare deployment checklist

1. Verify auth:
   - `npx wrangler whoami`
2. Set secrets:
   - `npx wrangler secret put DATABASE_URL`
   - `npx wrangler secret put JWT_ACCESS_SECRET`
   - `npx wrangler secret put JWT_REFRESH_SECRET`
   - `npx wrangler secret put CORS_ORIGINS` — must list **every browser origin** that calls the API (e.g. `https://www.neerbottle.in,https://neerbottle.in`). Apex and `www` are different origins; omitting one causes CORS preflight failures in the browser.
   - (SMS OTP) `npx wrangler secret put MSG91_AUTH_KEY` — optional vars: `MSG91_TEMPLATE_ID`, `MSG91_OTP_SHOP_NAME` (see `.env.example`)
3. Deploy:
   - `npm run cf:deploy` (uses `keep_vars` in `wrangler.jsonc` and `--keep-vars` / `--containers-rollout=immediate` on the CLI)
4. Validate:
   - `npx wrangler containers list`
   - `curl -sS https://<your-worker-domain>/api/health/ping`
# Hosting `fliq-water-backend` on Cloudflare Containers (2026)

## Git-connected deploy: bindings disappearing / “Database is not available”

Wrangler treats **`wrangler.jsonc` as the source of truth for plaintext `vars`**. On **`wrangler deploy`**, any **plaintext** variable you set only in the dashboard is **removed** unless you set **`keep_vars: true`** (this repo does) or pass **`--keep-vars`**.

- **Secrets** (`wrangler secret put` / dashboard “Secret”) are **not** supposed to be deleted on deploy unless you run `wrangler secret delete` or you add a **`vars` entry with the same name** as the secret (even an empty string) — that **replaces** the secret with the var value. **Never** add `DATABASE_URL`, `JWT_*`, etc. under `vars` in git.

- **`npx wrangler versions upload`** (Workers “Version command” in the dashboard) has had **bugs where bindings are cleared** or `keep_vars` is ignored for preview uploads. If secrets or vars vanish after pushes, try: use **`npx wrangler deploy` only** for the deploy step (this repo’s `npm run cf:deploy`), or upgrade Wrangler to a release that includes fixes for `versions upload` + `keep_vars`. After a bad upload, re-add secrets once in the dashboard or via `wrangler secret put`.

This repo sets **`"keep_vars": true`** in `wrangler.jsonc` so dashboard-managed plaintext vars survive Git deploys. The Nest error *Database is not available…* means **`DATABASE_URL` is missing or empty inside the container** (Worker → `ApiContainer` `envVars`), not a Prisma bug.

---

This repo is a **NestJS (TypeScript) + Prisma + PostgreSQL (Supabase)** backend with **Socket.IO** real-time features (namespace **`/orders`**). It listens on `process.env.PORT ?? 3000`.

This document is a **detailed, sequential task checklist** for hosting it on **Cloudflare Containers** (best way to run a full NestJS app on Cloudflare without heavy refactoring).

### Why Containers (and not Workers Free)?

- **Workers is an edge-function runtime**, great for small handlers and “edge-native” apps. A full NestJS + Prisma + Socket.IO server is **not a drop-in** on Workers and typically requires refactoring.
- **Workers Free is not suitable** for this backend as-is.
- **Cloudflare Containers** runs your **Dockerized server** and is the realistic Cloudflare-native hosting approach for this repo.

### Reference links

- **Cloudflare plans**: `https://www.cloudflare.com/plans/`
- **Developer Platform pricing** (Workers + Containers): `https://workers.cloudflare.com/pricing/`
- **Containers getting started** (example config): `https://developers.cloudflare.com/containers/get-started/`
- **WebSocket forwarding to Containers**: `https://developers.cloudflare.com/containers/examples/websocket`
- **DB connectivity overview** (Supabase/Hyperdrive): `https://developers.cloudflare.com/workers/databases/connecting-to-databases/`

---

## 1) Prerequisites

- [ ] **Cloudflare account** with access to **Workers & Pages → Containers**
- [ ] **Billing enabled** for Developer Platform features as required (plan depends on usage)
- [ ] **Docker** installed and running
- [ ] **Node 20+**
- [ ] **Supabase Postgres DATABASE_URL** (direct/session connection on **port 5432**)
- [ ] (Recommended) a domain in Cloudflare, e.g. `fliqwater.com`

### 1.1 Create a Cloudflare account (step-by-step)

- [ ] **Step 1 — Sign up**
  - Go to Cloudflare sign up: `https://dash.cloudflare.com/sign-up`
  - Enter **email** and **password**
  - Verify your email (Cloudflare will send a verification message)

- [ ] **Step 2 — Log in to the dashboard**
  - Go to: `https://dash.cloudflare.com/`
  - Confirm you can see the Cloudflare dashboard home

- [ ] **Step 3 — Add your domain (recommended for production API)**
  - In Cloudflare dashboard → **Websites** (or “Add a site”)
  - Click **Add a site**
  - Enter your domain (example: `fliqwater.com`)
  - Choose a plan for the domain (**Free** is fine to start; Pro/Business are optional upgrades)
  - Cloudflare will scan DNS records → review/confirm
  - Cloudflare will show **nameservers**
  - Go to your domain registrar (GoDaddy/Namecheap/etc.) → replace existing nameservers with Cloudflare’s
  - Wait for activation (can take minutes to a few hours). Cloudflare will show the status as **Active**.

- [ ] **Step 4 — Ensure Workers/Containers area is visible**
  - In Cloudflare dashboard sidebar, look for **Workers & Pages**
  - Open it and confirm you can see **Workers** and (if available for your account) **Containers**

### 1.2 Enable billing (required for Containers usage)

Cloudflare Containers is part of the Developer Platform and may require billing to be enabled for usage-based compute.

- [ ] In Cloudflare dashboard → **Billing**
- [ ] Add a **payment method** (card / supported method)
- [ ] Confirm billing status is active for your account

### 1.3 Verify access from your machine (Wrangler)

After you install Wrangler and login, verify you can see your account resources:

```bash
npx wrangler whoami
npx wrangler containers list
```

If `wrangler containers list` fails, check the **error type**:

- [ ] **If you see 401 Unauthorized (common)**  
  This usually means **your Cloudflare account is not enabled/enrolled for Containers** yet (Containers is still beta for some accounts) *or* billing is not enabled for the Developer Platform on that account.
  - Cloudflare dashboard → **Workers & Pages** → look for **Containers** in the sidebar.
    - If it is missing, your account likely does not have Containers enabled yet.
  - Cloudflare dashboard → **Billing** → ensure a **payment method** is added and billing is active.
  - If you are using an organisation account: confirm your user is an **admin** or has permissions for Workers/Developer Platform.

- [ ] **If you see “permission” / “not allowed”**  
  - Confirm you are logged into the correct Cloudflare account (`npx wrangler whoami`)
  - Confirm your token scopes include `containers:write` (Wrangler prints token permissions)

- [ ] **Quick sanity check: try a template deploy**  
  Sometimes creating your first Containers project is the fastest way to validate account eligibility end-to-end.
  In a temporary folder:

```bash
mkdir -p /tmp/cf-containers-test && cd /tmp/cf-containers-test
npm create cloudflare@latest -- --template=cloudflare/templates/containers-template
npx wrangler deploy
npx wrangler containers list
```

If the template deploy also fails with 401, you need to enable Containers on the Cloudflare account (dashboard/billing/support).

Commands:

```bash
docker info
node -v
npm -v
```

Install Wrangler:

```bash
npm i -D wrangler
npx wrangler --version
npx wrangler login
```

---

## 2) Prepare the Project

### 2.1 Dockerfile

- [ ] Ensure `Dockerfile` builds `dist/` and runs Nest with `node dist/main`
- [ ] Ensure it listens on `PORT` (Render/Cloudflare will inject it; locally use `PORT=3000`)

Local smoke test:

```bash
docker build -t fliq-water-backend .
#
# NOTE: this repo’s Dockerfile runs `npx prisma migrate deploy` on startup.
# That requires DATABASE_URL. If you just want to smoke-test the HTTP server
# (confirm it binds to PORT and /api/health works), you can skip migrations:
#
docker run --rm -p 3000:3000 -e PORT=3000 -e NODE_ENV=production fliq-water-backend sh -c "node dist/main"
curl -sS http://localhost:3000/api/health
```

### 2.2 Add `.dockerignore` (recommended)

Create `.dockerignore`:

```dockerignore
node_modules
dist
.git
.cursor
coverage
*.log
.env
.env.*
```

### 2.3 Environment variables you’ll need

These must be set as **secrets/vars** (do not commit):

- [ ] `DATABASE_URL` (Supabase, **port 5432**, often needs `sslmode=require`)
- [ ] `JWT_ACCESS_SECRET`
- [ ] `JWT_REFRESH_SECRET`
- [ ] `CORS_ORIGINS` (comma-separated web origins)
- [ ] `NODE_ENV=production`

---

## 3) Set up Cloudflare (Account + domain plan)

Cloudflare “zone” plans are **per domain**:

- **Free:** $0 / month
- **Pro:** $20 / month / domain
- **Business:** $200 / month / domain
- **Enterprise:** custom

Compute (Workers + Containers) is **usage-based** (see pricing page).

Recommended starting choice:
- [ ] **Zone plan:** Free (upgrade to Pro if you need WAF/rules/support)
- [ ] **Compute:** Containers (usage-based)

---

## 4) Create Wrangler Configuration (Worker + Container)

Cloudflare Containers are invoked via a **Worker** + a **container-backed Durable Object**.

Create `wrangler.jsonc` at repo root:

```jsonc
{
  "name": "neerbottle-backend",
  "main": "src/cf/index.ts",
  "compatibility_date": "2026-04-01",

  "observability": { "enabled": true },

  "containers": [
    {
      "class_name": "ApiContainer",
      "image": "./Dockerfile",
      "max_instances": 3
    }
  ],

  "durable_objects": {
    "bindings": [
      { "name": "API_CONTAINER", "class_name": "ApiContainer" }
    ]
  },

  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["ApiContainer"] }
  ],

  "vars": {
    "NODE_ENV": "production"
  }
}
```

Watch outs:
- `class_name` must match the Durable Object class name in your Worker code.
- Use `new_sqlite_classes` (Containers docs use this, not `new_classes`).

---

## 5) Implement the Gateway Worker (HTTP + WebSocket → Container)

Create `src/cf/index.ts`:

```ts
import { Container, getContainer } from "@cloudflare/containers";

export class ApiContainer extends Container {
  // Your NestJS app listens on PORT (default 3000)
  defaultPort = 3000;

  // Tune for cost vs latency
  sleepAfter = "30s";

  // NOTE: You must ensure secrets like DATABASE_URL/JWT_* reach the container.
  // Use Wrangler secrets/vars and pass them into container env vars using
  // the Containers API supported by your @cloudflare/containers version.
}

export default {
  async fetch(request: Request, env: any) {
    // WebSocket requests are automatically forwarded when using container.fetch(...)
    // Source: Containers WebSocket example docs.
    const container = getContainer(env.API_CONTAINER);
    return container.fetch(request);
  },
};
```

Notes:
- **REST** is still under `/api/*` as your Nest global prefix.
- **Socket.IO** namespace is `/orders`, so clients should connect to:
  - `wss://api.fliqwater.com/orders`

✅ **Status in this repo:** Implemented at `src/cf/index.ts` and wired in `wrangler.jsonc`.

---

## 6) Local Development & Testing

### 6.1 Set secrets for local dev

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put JWT_ACCESS_SECRET
npx wrangler secret put JWT_REFRESH_SECRET
npx wrangler secret put CORS_ORIGINS
```

### 6.2 Run locally

```bash
# If Wrangler cannot write its default log file path on your machine,
# set WRANGLER_LOG_PATH to a writable folder inside the repo:
WRANGLER_LOG_PATH=".wrangler-logs" npx wrangler dev --local
```

Test:
- [ ] `GET /api/health`
- [ ] `GET /api/docs`
- [ ] Socket.IO connects to `/orders`

✅ **Status validated:** `GET http://localhost:8787/api/health/ping` returns `{ "pong": true }`.

---

## 7) Deployment Steps (Wrangler)

Deploy:

```bash
npx wrangler deploy
```

For **Containers**, default rollout can leave some instances on an older image for a while. This repo’s `npm run cf:deploy` uses `--containers-rollout=immediate` so every instance picks up the new image in one step (matches typical CI expectations).

What happens (per Cloudflare Containers docs):
- Docker image builds locally
- image is pushed to Cloudflare-managed registry
- Worker is deployed and Containers are provisioned

Check status:

```bash
npx wrangler containers list
npx wrangler containers images list
```

Watch out:
- First provisioning can take **several minutes**; container calls may fail until ready.

### 7.1 If deploy fails with `Unauthorized`

If `wrangler deploy` (or `wrangler containers list`) fails with **Unauthorized/401**, it usually means:
- Containers is **not enabled** for the account yet (beta eligibility), and/or
- billing is not enabled for the Developer Platform on that account.

✅ **Current status for this account:** `wrangler deploy` fails with **Unauthorized** when attempting to deploy Containers.
To unblock:
- Cloudflare dashboard → **Billing** → confirm payment method is added
- Cloudflare dashboard → **Workers & Pages** → confirm **Containers** exists and is enabled for the account
- If Containers is missing or still 401, contact Cloudflare support / enable Containers beta for the account

---

## 8) Supabase Database Connection (Prisma)

### 8.1 Use the correct Supabase URL

- [ ] Use Supabase **direct/session** URL on **port 5432**
- [ ] Avoid pooler on **6543** for Prisma migrations / startup
- [ ] Add `sslmode=require` if needed

Example:

```text
postgresql://USER:PASSWORD@HOST:5432/postgres?schema=public&sslmode=require
```

### 8.2 Prisma migrate strategy (important)

This repo’s container start currently runs:

```bash
npx prisma migrate deploy && node dist/main
```

Best practice for Containers:
- [ ] Run `prisma migrate deploy` as a **separate release step** (CI) to avoid multiple instances racing migrations
- [ ] Keep containers focused on serving traffic

If you keep migrations on container startup:
- [ ] start with `max_instances` small (even 1) until stable

---

## 9) Socket.IO / WebSocket Configuration

Cloudflare Containers forwards WebSocket upgrades when you proxy with:

```ts
return container.fetch(request);
```

Checklist:
- [ ] Client uses `wss://` in production
- [ ] Client connects to namespace `/orders`
- [ ] `CORS_ORIGINS` includes the web frontend origins

---

## 10) Custom Domain & SSL

### 10.1 Domain setup

- [ ] Add domain to Cloudflare
- [ ] Create DNS record for `api` (or use Workers route directly)

### 10.2 Route traffic to the Worker

In Cloudflare dashboard (Workers & Pages):
- [ ] Add a **route** like `api.example.com/*` to `neerbottle-backend` (or your `wrangler.jsonc` `name`)

### 10.3 TLS mode

Cloudflare zone → SSL/TLS:
- [ ] set to **Full (strict)**

---

## 11) Environment Variables & Secrets

Use Wrangler secrets for sensitive values:

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put JWT_ACCESS_SECRET
npx wrangler secret put JWT_REFRESH_SECRET
```

Use Wrangler vars for non-sensitive values:
- `NODE_ENV=production`

You must ensure these become `process.env.*` inside the container runtime (NestJS expects them there).

---

## 12) Monitoring, Logs & Scaling

- [ ] Enable observability (`observability.enabled = true`)
- [ ] Use Cloudflare dashboard logs for the Worker and Container
- [ ] Tune:
  - `max_instances`
  - `sleepAfter`
  - rate limiting for auth endpoints

---

## 13) Cost estimation & optimization tips

Pricing sources:
- Zone plans: `https://www.cloudflare.com/plans/`
- Compute pricing (Workers + Containers): `https://workers.cloudflare.com/pricing/`

Practical tips for this app (moderate traffic + realtime):
- [ ] Keep `sleepAfter` low to reduce idle spend
- [ ] Avoid excessive `max_instances` until metrics justify it
- [ ] Run DB migrations outside request path

---

## 14) Troubleshooting

- **404 on a new Nest route (e.g. `/api/auth/send-login-otp`) after dashboard changes**
  - Adding **secrets/vars only** in the Cloudflare dashboard does **not** rebuild the **container image**. The Nest app lives inside the image built from `./Dockerfile`.
  - Fix: deploy from CI or locally with `npx wrangler deploy` after merging the code change so Wrangler **builds and pushes a new image** that includes the new routes.
- **Browser `503` on `/api/*` right after a deploy, or logs show `Network connection lost` / `Durable Object reset because its code was updated`**
  - Usually **transient**: the container or DO is restarting while traffic still hits the old connection. The Worker retries proxying; wait a few seconds and retry the request. Avoid load-testing the API during active deploys.
  - If **503 persists for minutes**, inspect container logs for Nest crashes (DB URL, JWT secrets, etc.) or use **`npm run cf:deploy`** with `--containers-rollout=immediate` so all instances move to the new image together.
- **`JwtStrategy requires a secret or key` / container exits before listening on port 3000**
  - `JWT_ACCESS_SECRET` (and `JWT_REFRESH_SECRET`) must be **non-empty** in the Worker bindings that are passed into the container. An **empty plain text variable** in the dashboard counts as set but blank — passport-jwt rejects `secretOrKey: ""`. Use **`wrangler secret put JWT_ACCESS_SECRET`** (and refresh) with real values, or remove empty vars so secrets are not injected as `""`.
- **`DURABLE_OBJECT_ALREADY_HAS_APPLICATION` / `name fliq-water-backend-apicontainer` on deploy**
  - The **container application id** is tied to your account’s first deploy. If you **rename the Worker** in `wrangler.jsonc`, Wrangler defaults to a **new** container name (`<new-worker>-apicontainer`), which conflicts with the existing Durable Object binding.
  - Fix: set an explicit stable `"name"` on the `containers[]` entry (this repo uses `"fliq-water-backend-apicontainer"`) so the Worker can be renamed while updates still target the same container app. See Cloudflare Wrangler docs: optional `name` under **Containers**.
- **Provisioning delay after first deploy**
  - Wait a few minutes; containers are provisioned after Worker deploy
- **Prisma issues**
  - Verify Supabase URL uses **5432** and `sslmode=require` if needed
- **Socket.IO disconnect**
  - Confirm `wss://` and correct `/orders` namespace + CORS origins

---

## Optional: simpler starter approach

If you want a lower-risk first production step:
- host the backend on a standard Node host
- use Cloudflare only for DNS + TLS + security proxy

This is often the fastest way to go live, then migrate to Containers later.

