# FCM (Firebase Cloud Messaging) for Live Order Updates

This repo already supports real-time updates via **Socket.IO** (namespace `/orders`).  
FCM is for **push notifications** when the app is in the background / killed, or when you want reliable alerting (order status changes, delivery updates).

This guide covers:
- Firebase project + keys
- Backend (NestJS) configuration
- Flutter app configuration
- Recommended data model for device tokens
- When/how to send notifications for `order.updated`

---

## 1) Firebase setup (one-time)

### 1.1 Create Firebase project
- Go to Firebase Console → create a project for AquaFliq / Fliq Water.
- Enable **Cloud Messaging** (it’s usually enabled by default).

### 1.2 Add Android app (Flutter)
- Add app → Android
- Package name must match your Flutter app (e.g. `com.fliq.water`).
- Download `google-services.json`
- Place it in Flutter: `android/app/google-services.json`

### 1.3 Add iOS app (Flutter)
- Add app → iOS
- Bundle ID must match your iOS target (e.g. `com.fliq.water`).
- Download `GoogleService-Info.plist`
- Place it in Flutter: `ios/Runner/GoogleService-Info.plist`
- In Apple Developer portal:
  - Enable **Push Notifications** capability
  - Enable **Background Modes** → “Remote notifications”

### 1.4 Create a Service Account for backend (Admin SDK)
- Firebase Console → Project settings → Service accounts
- Generate a new private key → downloads a JSON file
- **Do not commit** this JSON to git.

You will use this JSON in the backend via either:
- a JSON string env var, or
- base64 env var, or
- mount a file in the runtime (Docker/K8s/etc.)

If you downloaded a file like `neerbottle-39767-firebase-adminsdk-....json`, that is the one.

---

## 2) Backend approach (NestJS)

### 2.1 What we need in the backend
- Store each user’s FCM device tokens (usually multiple devices per user)
- Send notification when:
  - Order is created (optional)
  - Order status changes (RECEIVED → CONFIRMED → PACKED → DISPATCHED → DELIVERED / CANCELLED)
  - Delivery partner assigned (optional)
- Remove invalid tokens automatically (when FCM says token is invalid)

### 2.2 Recommended data model

Create a table like `PushToken` (name can vary):

- `id` (uuid)
- `userId` (FK to `User`)
- `token` (unique)
- `platform` (`android` | `ios` | `web`)
- `deviceId` (optional)
- `createdAt`, `updatedAt`
- `lastSeenAt` (optional)

Rules:
- One user can have many tokens.
- Tokens must be unique.
- Update `lastSeenAt` whenever the app sends token refresh or “register token”.

### 2.3 Endpoints to implement

Add a small controller under customer-authenticated routes:

- `POST /api/push/register`
  - body: `{ token: string, platform: "android" | "ios" | "web" }`
  - requires JWT (`JwtAuthGuard`)
  - upsert token for `req.user.id`

- `POST /api/push/unregister`
  - body: `{ token: string }`
  - requires JWT
  - delete token row

Notes:
- The app must call **register** after login and whenever FCM token changes.
- Token changes can happen any time (reinstall, OS update, Firebase refresh).

### 2.4 Firebase Admin SDK setup (backend)

Install dependency:

```bash
npm i firebase-admin
```

Environment variables (recommended):
- `FCM_PROJECT_ID` (optional; can be derived from credentials)
- `FCM_CLIENT_EMAIL` (optional if using full JSON)
- `FCM_PRIVATE_KEY` (optional if using full JSON)
- **Preferred single var**: `FCM_SERVICE_ACCOUNT_JSON` (stringified JSON)

Example `.env`:

```env
# Put the *full JSON* as a single line string (escape newlines properly).
FCM_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"..."}'
```

Implementation notes:
- `private_key` contains `\n` newlines; you must preserve them.
- Never commit credentials.

#### Convert your downloaded JSON file into env vars (macOS / zsh)

From the repo root (where your downloaded JSON exists):

**Option A (recommended): `FCM_SERVICE_ACCOUNT_JSON`**

```bash
export FCM_SERVICE_ACCOUNT_JSON="$(node -e "process.stdout.write(JSON.stringify(require('./neerbottle-39767-firebase-adminsdk-fbsvc-efd81fa26a.json')))")"
```

Then run the API (example):

```bash
npm run start:dev
```

**Option B: base64 env var (helps when secret UIs don’t like newlines/quotes)**

```bash
export FCM_SERVICE_ACCOUNT_JSON_B64="$(base64 -i "./neerbottle-39767-firebase-adminsdk-fbsvc-efd81fa26a.json" | tr -d '\n')"
```

If you use base64, your backend should decode it at startup and feed the decoded JSON into Firebase Admin (implementation step).

### 2.5 Sending push notifications

Send to tokens:
- For a customer order update, fetch tokens for `order.userId`.
- Build an FCM message with:
  - `notification`: `{ title, body }` (for OS-level display)
  - `data`: `{ orderId, status, type: "order.updated" }` (for navigation in app)

On delivery partner updates (if you later build partner app notifications):
- Fetch tokens for `deliveryPartner.userId`.
- Send a different payload type: `type: "delivery.assignment"` etc.

Token cleanup:
- When sending, if FCM returns errors like “registration-token-not-registered”, delete those tokens from DB.

### 2.6 When to trigger sends (recommended)

This repo already emits Socket.IO events like `order.updated`.

Recommended pattern:
- Keep Socket.IO for foreground “live updates”.
- Send FCM when the order changes and the customer may not be connected.

Trigger points (typical):
- After `OrdersService.create(...)` succeeds → optional “Order placed”
- After admin updates order status → “Your order is PACKED”
- After partner marks delivered → “Delivered”

Keep the push logic in a single service (e.g. `PushService`) and call it from the service methods that change order state.

---

## 3) Flutter app setup

### 3.1 Dependencies
Add:
- `firebase_core`
- `firebase_messaging`

Then:
- `flutterfire configure` (recommended) or manual config using the downloaded files

### 3.2 Request notification permissions
- iOS requires explicit permission prompt.
- Android 13+ requires runtime permission for notifications.

### 3.3 Get the FCM token and register it to backend
Flow:
- After successful login (you have JWT), call:
  - `FirebaseMessaging.instance.getToken()`
  - `POST /api/push/register` with token + platform

Handle token refresh:
- Listen to `FirebaseMessaging.instance.onTokenRefresh`
- Call `POST /api/push/register` again with the new token.

### 3.4 Handling messages
- **Foreground**: use `FirebaseMessaging.onMessage.listen(...)` to show an in-app banner or local notification.
- **Background/killed**: use `FirebaseMessaging.onBackgroundMessage(...)` and handle navigation by reading the `data` payload.

Recommended `data` payload keys:
- `type = "order.updated"`
- `orderId = "<uuid>"`
- `status = "<enum>"`

---

## 4) Deployment configuration (secrets)

### 4.1 Local development
Put `FCM_SERVICE_ACCOUNT_JSON` in `.env.local` (not committed).

### 4.2 Docker
If using `docker compose`, pass env var to API container:
- Either add to a private env file (not committed)
- Or provide at runtime

### 4.3 Cloudflare Containers (Wrangler)
Set as a secret:

```bash
npx wrangler secret put FCM_SERVICE_ACCOUNT_JSON
```

If your JSON is too large for copy/paste, consider base64 encoding and using:
- `FCM_SERVICE_ACCOUNT_JSON_B64`
Then decode inside the container on startup (implementation choice).

---

## 5) Minimal checklist (copy/paste)

- [ ] Firebase project created
- [ ] Android app added → `google-services.json` placed
- [ ] iOS app added → `GoogleService-Info.plist` placed + capabilities enabled
- [ ] Service account key created (backend)
- [ ] Backend env var `FCM_SERVICE_ACCOUNT_JSON` set as secret in each environment
- [ ] Backend endpoints implemented: `POST /api/push/register`, `POST /api/push/unregister`
- [ ] Flutter registers FCM token after login + on refresh
- [ ] Order status update code triggers push send

