# Kashio Backend

NestJS + Prisma + PostgreSQL backend for the Kashio delivery platform.

**Phase 1 scope:** Auth (admin/rider) + the **Courier (parcel)** module. Food and
Pharmacy modules are planned but not yet implemented.

## Stack

- NestJS 10 (REST, global prefix `v1`)
- Prisma 5 ORM
- PostgreSQL
- JWT auth (Passport) with role-based access (`ADMIN`, `RIDER`, `CUSTOMER`)

## Setup

```bash
cd backend
cp .env.example .env          # then edit DATABASE_URL / JWT_SECRET
npm install
npm run prisma:generate
npm run prisma:migrate        # creates tables (dev migration)
npm run db:seed               # seeds admin + riders + sample couriers
npm run start:dev             # http://localhost:3000/v1
```

Make sure PostgreSQL is running and the `kashio` database exists, e.g.:

```bash
createdb kashio
```

### Seeded credentials

- Admin: `admin@kashio.app` / `admin123`
- Riders: `arshid@kashio.app`, `usman@kashio.app`, ... / `rider123`

## API (all prefixed with `/v1`)

### Auth
| Method | Path            | Role     | Notes |
|--------|-----------------|----------|-------|
| POST   | `/auth/login`   | any      | `{ email, password }` (admin/rider) → `{ token, refresh_token, user }` |
| POST   | `/auth/google`  | customer | `{ googleId, email, name, avatarUrl? }` → `{ token, refresh_token, user }` |
| POST   | `/auth/refresh` | any      | `{ refreshToken }` → `{ token, refresh_token }` (rotates) |
| POST   | `/auth/logout`  | any      | `{ refreshToken }` → revokes that token |
| GET    | `/auth/me`      | auth     | current user profile |

**Tokens.** `token` is a short-lived (15 min) access JWT sent as
`Authorization: Bearer <token>`. `refresh_token` is an opaque, long-lived
(60 day) token stored hashed server-side. On app launch — or whenever a request
returns 401 — call `/auth/refresh` to silently get a fresh access token. Each
refresh **rotates** the refresh token (the old one is revoked), so store the new
one every time. Response uses snake_case to match the Flutter `UserModel`/`AuthModel`.

**Google sign-in (MVP — direct save).** The mobile app signs in with
`google_sign_in`, then posts the resulting profile
(`{ googleId, email, name, avatarUrl }`) to `/auth/google`. The backend upserts a
`CUSTOMER` (matched by `googleId`, then `email`, so repeat logins don't duplicate)
and issues our tokens. No Google client ID is required for this path.

> **Hardening later:** to stop a client from posting an arbitrary identity, switch
> to verifying a Google **ID token** server-side. `GoogleVerifierService` is already
> wired for this — set `GOOGLE_CLIENT_ID` (the OAuth **Web client ID**, also used as
> the Flutter `GoogleSignIn(serverClientId: ...)`), have the app send `{ idToken }`,
> and feed the verified payload into the same upsert.

#### Mobile wiring still needed (Flutter side)
- Swap the placeholder `token: 'google_${id}'` in `auth_viewmodel.dart` for a real
  `POST /auth/google` call sending `{ googleId, email, name, avatarUrl }`; persist
  `token` + `refresh_token` in `UserManager`.
- Add a network interceptor: attach Bearer token; on 401, call `/auth/refresh`
  once and retry; if that fails, log out.

### Riders
| Method | Path                   | Role  | Notes |
|--------|------------------------|-------|-------|
| POST   | `/riders`              | ADMIN | create rider (provisions login) |
| GET    | `/riders`              | ADMIN | list riders + active ride counts |
| GET    | `/riders/:id`          | ADMIN | rider detail |
| GET    | `/riders/:id/couriers` | ADMIN | a rider's past orders |
| GET    | `/riders/me/couriers`  | RIDER | logged-in rider's past orders |
| GET    | `/riders/me/active`    | RIDER | logged-in rider's active jobs |

### Couriers
| Method | Path                    | Role            | Notes |
|--------|-------------------------|-----------------|-------|
| POST   | `/couriers`             | ADMIN, CUSTOMER | create a booking |
| GET    | `/couriers`             | ADMIN           | list + `?status= &riderId= &search=` |
| GET    | `/couriers/:id`         | ADMIN, RIDER    | booking detail |
| GET    | `/couriers/:id/track`   | any auth        | status timeline |
| POST   | `/couriers/:id/assign`  | ADMIN           | `{ riderId }` → status ASSIGNED |
| POST   | `/couriers/:id/accept`  | RIDER           | accept assignment → ACCEPTED |
| POST   | `/couriers/:id/decline` | RIDER           | decline → back to PENDING |
| PATCH  | `/couriers/:id/status`  | ADMIN, RIDER    | `{ status, note? }` advance status |
| POST   | `/couriers/:id/cancel`  | ADMIN           | `{ reason? }` → CANCELLED |

### Courier status lifecycle

```
PENDING → ASSIGNED → ACCEPTED → PICKED_UP → ON_THE_WAY → DELIVERED
   │          │          │           │           │
   └──────────┴──────────┴───────────┴───────────┴──────→ CANCELLED
ASSIGNED → PENDING (rider declined / un-assign)
```

Every status change is recorded as a `CourierEvent` for the tracking timeline.
