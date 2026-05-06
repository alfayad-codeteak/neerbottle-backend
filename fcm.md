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

## 6) Current Flutter FCM implementation (what’s in the app now)

This section documents the current delivery partner Flutter app behavior so backend changes can be validated against real client expectations.

### 6.1 Initialization + background handler

- **Firebase init (Android/iOS only)**: `lib/main.dart`
  - `Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)`
- **Background/killed handler**: `lib/main.dart`
  - `FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler)`
  - Handler logs: `type`, `orderId`, `title`, `body`, and raw `data`

### 6.2 Permission + token register/unregister (partner JWT)

- **Permission + token flow**: `lib/src/features/push/push_token_manager.dart`
  - `FirebaseMessaging.instance.requestPermission()`
  - `FirebaseMessaging.instance.getToken()` → backend `POST /push/register`
  - `FirebaseMessaging.instance.onTokenRefresh` → re-register token
  - On logout: gets token again → backend `POST /push/unregister`
- **Backend API calls**: `lib/src/features/push/data/push_repository.dart`
  - `POST /push/register` body: `{ token, platform: "android"|"ios", deviceId? }`
  - `POST /push/unregister` body: `{ token }`

### 6.3 When registration happens

- Wired into session lifecycle: `lib/src/app/app_session/app_session_bloc.dart`
  - On boot with cached session → starts token manager (register)
  - On login → starts token manager (register)
  - On logout → unregister (while JWT still available) → `/auth/logout` → unauthenticated

### 6.4 Message listeners + navigation

- Listeners: `lib/src/app/app.dart`
  - Foreground: `FirebaseMessaging.onMessage`
  - Opened from background: `FirebaseMessaging.onMessageOpenedApp`
  - Launched from killed: `FirebaseMessaging.instance.getInitialMessage()`
- Handled event types:
  - `order.updated`
  - `order.assigned`
  - With `audience == deliveryPartner` (also accepts missing `audience`)
- Navigation:
  - Routes to `/partner?tab=orders&orderId=<uuid>`
  - Orders tab auto-opens the order details sheet if that `orderId` exists in the fetched assigned-orders list.

### 6.5 Android permissions

`android/app/src/main/AndroidManifest.xml`:

- `INTERNET`
- `POST_NOTIFICATIONS` (Android 13+)

---

## 7) Backend checklist to verify FCM is configured correctly

### 7.1 Token registration path works end-to-end

- Call `POST /api/push/register` with a real **partner JWT** + real FCM token.
- Verify DB: token row is saved and linked to the correct **userId** (partner user id), not `deliveryPartnerId` (DeliveryPartner row id).
- Return code: should be 200/201 (anything else should be logged + surfaced).

### 7.2 Send a test push using a stored token (no app logic)

- Pick one token from DB and send a direct test.
- Confirm device receives it when:
  - App foreground (should hit `onMessage` in logs; OS may not show banner)
  - App background/killed (OS should show notification UI if `notification` payload present)

### 7.3 Payload must include both `notification` and `data`

For the current approach (OS shows banner automatically in background), backend must send:

- `notification: { title, body }`
- `data`: **string map** with keys:
  - `type` (`order.assigned` or `order.updated`)
  - `audience` (`deliveryPartner`)
  - `orderId`
  - `status`
  - `deliveryStatus`

Important: in FCM, **data values should be strings**. If the backend sends numbers/objects, some SDKs behave inconsistently.

### 7.4 Correct `type` rules

Partner receives:

- `type=order.assigned` only when `deliveryStatus == ASSIGNED`
- otherwise `type=order.updated`

### 7.5 Token cleanup logic

If FCM send returns `NotRegistered` / `InvalidRegistration`, backend should delete that token.

### 7.6 Android vs iOS configuration

- **Android**: sending via FCM should work once tokens are registered.
- **iOS** requires extra readiness:
  - APNs key/cert uploaded to Firebase
  - correct iOS bundle id matches Firebase app
  - if missing, iOS tokens may exist but delivery fails

---

## 8) Potential backend flaws to double-check (high probability)

- **Saving token against wrong id**: using `deliveryPartnerId` (DeliveryPartner row) instead of partner `userId` (JWT `sub`).
- **Missing `notification` block**: background/killed won’t show UI; you’d only see data handling if you implement local notifications.
- **Wrong key names**: Flutter expects `type`, `audience`, `orderId`.
- **Non-string `data` values**: some platforms drop/alter non-string values.
- **Wrong Firebase project**: tokens from Project A won’t receive messages sent from Project B.
- **Not actually sending to device tokens**: FCM requires actual tokens (or properly managed topics).

---

## 9) Socket.IO real-time (Delivery partner Flutter)

This backend already exposes a Socket.IO namespace for real-time order events:

- **Namespace**: `/orders`
- **Auth**: JWT access token (same one used for REST)
- **Rooms**:
  - `user:<userId>` is auto-joined on connect
  - `order:<orderId>` can be joined via an event (optional)

### 9.1 Events emitted by backend

- `order.updated`  
  Emitted for any order change to:
  - customer room `user:<customerUserId>`
  - partner room `user:<partnerUserId>` (when assigned)
  - order room `order:<orderId>` (if anyone joined)

- `order.assigned`  
  Emitted **only to the delivery partner’s user room** when `deliveryStatus === "ASSIGNED"`.

### 9.2 Events Flutter can emit (optional)

- `order.join` with `{ "orderId": "<uuid>" }` → joins `order:<orderId>`
- `order.leave` with `{ "orderId": "<uuid>" }` → leaves `order:<orderId>`

### 9.3 Flutter Socket.IO configuration (partner app)

Use `socket_io_client` (example). Connect with the JWT:

```dart
final socket = io(
  '$baseUrl/orders',
  OptionBuilder()
    .setTransports(['websocket'])
    .disableAutoConnect()
    .setAuth({'token': accessToken})
    .build(),
);

socket.onConnect((_) => print('connected'));
socket.onDisconnect((_) => print('disconnected'));

socket.on('order.updated', (payload) {
  // payload includes orderId, userId, deliveryPartnerUserId, deliveryStatus, status, etc.
});

socket.on('order.assigned', (payload) {
  // same payload shape as order.updated, but only on assignment
  // Navigate to orders tab and open orderId
});

socket.connect();
```

### 9.4 Aligning WS + FCM “type”

Recommended mapping on Flutter:

- **WS**:
  - on `order.assigned` → treat as `type="order.assigned"`
  - on `order.updated` with `deliveryStatus=="ASSIGNED"` → also treat as assignment (fallback)
- **FCM**:
  - read `data.type` (`order.assigned` / `order.updated`)
  - navigate using `data.orderId`

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

