# Kashio Backend — Architecture & Conventions

A complete walkthrough of how this NestJS backend is built: the folder
structure, every API endpoint, how authentication works, how access is
restricted by role, and how requests are validated and read inside controllers.

> **Stack:** NestJS 10 · Prisma 5 · PostgreSQL · Passport-JWT · class-validator
> **Phase 1 scope:** Auth + the **Courier (parcel)** module. Food & Pharmacy modules come later.

---

## 1. Folder structure

The project is organised by **feature module**. Each module owns its controller
(routing), service (business logic), and DTOs (request shapes). Cross-cutting
pieces (Prisma, auth primitives) live in their own folders.

```
backend/
├── prisma/
│   ├── schema.prisma              # data model (tables, enums, relations)
│   ├── seed.ts                    # seeds admin + riders + sample couriers
│   └── migrations/                # generated SQL migrations (version history)
│
├── src/
│   ├── main.ts                    # bootstrap: global prefix, CORS, validation pipe
│   ├── app.module.ts              # root module — imports every feature module
│   │
│   ├── prisma/                    # database access (shared, @Global)
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts      # PrismaClient wrapper w/ connect lifecycle
│   │
│   ├── common/                    # reusable auth/permission building blocks
│   │   ├── decorators/
│   │   │   ├── roles.decorator.ts        # @Roles(Role.ADMIN, ...)
│   │   │   └── current-user.decorator.ts # @CurrentUser() -> the JWT user
│   │   └── guards/
│   │       ├── jwt-auth.guard.ts         # "must be logged in"
│   │       └── roles.guard.ts            # "must have one of these roles"
│   │
│   ├── auth/                      # authentication module
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts     # /auth/login, /google, /refresh, /logout, /me
│   │   ├── auth.service.ts        # login + google upsert + profile
│   │   ├── token.service.ts       # issue/rotate/revoke access + refresh tokens
│   │   ├── jwt.strategy.ts        # how a Bearer token is validated per request
│   │   ├── google-verifier.service.ts  # (ready for hardening) verify Google idToken
│   │   └── dto/
│   │       ├── login.dto.ts
│   │       └── auth-tokens.dto.ts        # GoogleLoginDto, RefreshTokenDto
│   │
│   ├── riders/                    # rider management module
│   │   ├── riders.module.ts
│   │   ├── riders.controller.ts
│   │   ├── riders.service.ts
│   │   └── dto/create-rider.dto.ts
│   │
│   └── couriers/                  # courier (parcel) module — the core
│       ├── couriers.module.ts
│       ├── couriers.controller.ts
│       ├── couriers.service.ts    # booking lifecycle + status state machine
│       └── dto/
│           ├── create-courier.dto.ts
│           ├── courier-query.dto.ts
│           ├── assign-rider.dto.ts
│           └── update-status.dto.ts
│
├── .env / .env.example           # DATABASE_URL, JWT secret, token TTLs, GOOGLE_CLIENT_ID
├── README.md                     # quick start + API table
└── ARCHITECTURE.md               # this file
```

### The request flow (every endpoint follows this)

```
HTTP request
   │
   ▼
main.ts ──► global prefix "v1" + global ValidationPipe (validates the DTO)
   │
   ▼
Controller ──► @UseGuards(JwtAuthGuard, RolesGuard)   ← auth + role check
   │            @Roles(...) + @CurrentUser() + @Body()/@Query()/@Param()
   ▼
Service ──► business logic + state-machine rules
   │
   ▼
PrismaService ──► PostgreSQL
   │
   ▼
JSON response
```

### Layer responsibilities

| Layer | Responsibility | Must NOT do |
|-------|----------------|-------------|
| **Controller** | Routing, read request (DTO/params), apply guards | Business logic, DB queries |
| **Service** | Business rules, transitions, DB via Prisma | Know about HTTP/req/res |
| **DTO** | Declare + validate the request shape | Logic |
| **Guard** | Decide *can this request proceed?* | Mutate data |
| **PrismaService** | DB access | Business rules |

---

## 2. Bootstrap (`main.ts`)

Three global settings are applied once for the whole app:

```ts
app.setGlobalPrefix('v1');           // every route becomes /v1/...
app.enableCors({ origin: true });    // mobile app + admin dashboard can call it
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,                   // strip unknown fields from the body
  transform: true,                   // coerce types (e.g. "5" -> 5) to match the DTO
}));
```

`whitelist: true` is important: any property a client sends that isn't declared
in the DTO is silently dropped, so clients can never inject extra fields.

---

## 3. Data model (`prisma/schema.prisma`)

Four tables and a few enums.

| Model | Purpose |
|-------|---------|
| `User` | Every human: ADMIN, RIDER, or CUSTOMER. Password is nullable (Google users have none). |
| `Rider` | Rider profile (location, vehicle), 1-to-1 with a `User`. |
| `Courier` | A parcel booking — pickup/drop, parcel info, status, assigned rider. |
| `CourierEvent` | Append-only status history for a courier (the tracking timeline). |
| `RefreshToken` | Hashed, rotating refresh tokens for silent re-login. |

**Enums:** `Role` (ADMIN/RIDER/CUSTOMER), `AuthProvider` (PASSWORD/GOOGLE),
`CourierStatus`, `ParcelWeight`.

```
User 1───1 Rider
User 1───* Courier   (as customer)
Rider 1──* Courier   (as assigned rider)
Courier 1─* CourierEvent
User 1───* RefreshToken
```

Migrations are versioned in `prisma/migrations/`. Apply them with
`npx prisma migrate deploy`; regenerate the typed client with `npx prisma generate`.

---

## 4. Authentication layer

There are **two ways to log in**, both ending in the same token pair.

### 4.1 The token model

| Token | Type | Lifetime | Storage |
|-------|------|----------|---------|
| **Access token** | JWT (signed, stateless) | 15 min | not stored server-side; sent as `Authorization: Bearer` |
| **Refresh token** | opaque random string | 60 days | stored **hashed** (SHA-256) in `refresh_tokens` |

`token.service.ts` owns all of this:

- `issuePair(user)` → signs a JWT + creates a refresh-token row (returns the raw refresh token **once**).
- `rotate(refreshToken)` → validates the hash, **revokes** the old token, issues a new pair. Rotation means a stolen token is single-use and detectable.
- `revoke(refreshToken)` → logout on one device.
- `revokeAllForUser(userId)` → logout everywhere.

### 4.2 Login paths

**Email + password** (admin / rider) — `auth.service.ts › login()`
1. Look up user by email.
2. `bcrypt.compare` the password.
3. `issuePair()` → return `{ token, refresh_token, user }`.

**Google (customer)** — `auth.service.ts › googleLogin()`
1. App sends the Google profile `{ googleId, email, name, avatarUrl }`.
2. Upsert: match by `googleId`, then `email` (so repeat logins don't duplicate); create a CUSTOMER if new.
3. `issuePair()` → same envelope back.

> The response envelope is **snake_case** (`refresh_token`, `user.avatar_url`,
> `user.is_premium`, `user.created_at`) on purpose — it matches the Flutter
> `AuthModel`/`UserModel` parsers exactly.

### 4.3 How a Bearer token is validated on each request (`jwt.strategy.ts`)

Passport runs this for any route behind `JwtAuthGuard`:

```ts
// 1. pull the JWT from the Authorization header
jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken()
// 2. verify signature + expiry against JWT_SECRET (automatic)
// 3. validate(payload): load the user, confirm still active
async validate(payload) {
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: { rider: true } });
  if (!user || !user.isActive) throw new UnauthorizedException();
  return { id, email, role, riderId };   // ← this becomes request.user
}
```

Whatever `validate()` returns is attached to the request as `req.user`, which
the `@CurrentUser()` decorator later reads.

### 4.4 Silent re-login (refresh)

The mobile Dio client auto-calls `POST /v1/auth/refresh` whenever a request
returns 401, swaps in the new access token, and retries — so the user never sees
a logout as long as the refresh token is valid. (See the Flutter `AuthInterceptor`.)

---

## 5. API restriction — how access is enforced

Two guards, applied together, gate every protected route.

### 5.1 `JwtAuthGuard` — *are you logged in?*

Extends Passport's `AuthGuard('jwt')`. If the Bearer token is missing/expired/invalid → **401 Unauthorized**. On success, `req.user` is populated.

### 5.2 `RolesGuard` — *are you allowed?*

Reads the `@Roles(...)` metadata on the handler and compares it to `req.user.role`:

```ts
const requiredRoles = reflector.getAllAndOverride(ROLES_KEY, [handler, class]);
if (!requiredRoles) return true;                 // no @Roles ⇒ any logged-in user
if (!requiredRoles.includes(user.role))          // wrong role ⇒ 403
  throw new ForbiddenException('Insufficient permissions');
```

→ wrong role = **403 Forbidden**.

### 5.3 Putting them on a controller

Guards run **top-to-bottom**: authenticate first, then authorize. Apply at the
class level (covers all routes), override per-route with `@Roles`:

```ts
@Controller('couriers')
@UseGuards(JwtAuthGuard, RolesGuard)     // every route requires a valid token
export class CouriersController {

  @Get()
  @Roles(Role.ADMIN)                     // only admins can list all couriers
  findAll(@Query() query: CourierQueryDto) { ... }

  @Get('mine')
  @Roles(Role.CUSTOMER)                  // only customers see their own
  findMine(@CurrentUser() user: AuthUser) { ... }
}
```

### 5.4 Two layers of restriction: role vs. ownership

Roles answer *"what kind of user is this?"* — but not *"is this **their** record?"*.
Ownership is checked **inside the service**:

```ts
// couriers.service.ts › cancel()
if (user?.role === Role.CUSTOMER && courier.customerId !== user.id) {
  throw new ForbiddenException('You can only cancel your own booking');
}
```

```ts
// couriers.service.ts › acceptByRider()
if (courier.riderId !== user.riderId) {
  throw new ForbiddenException('This job is not assigned to you');
}
```

**Rule of thumb:** *role* checks live on the controller (`@Roles`); *ownership*
checks live in the service (it has the DB record to compare against).

---

## 6. How a controller takes information from a request

NestJS uses **parameter decorators** to pull each part of the request. The
`ValidationPipe` validates the result against the DTO's `class-validator` rules
*before* your handler runs — so the body is always well-formed inside the method.

| Decorator | Reads | Example |
|-----------|-------|---------|
| `@Body()` | JSON request body | `@Body() dto: CreateCourierDto` |
| `@Query()` | URL query string (`?status=...`) | `@Query() q: CourierQueryDto` |
| `@Param('id')` | path segment (`/couriers/:id`) | `@Param('id') id: string` |
| `@Headers('user-agent')` | a request header | `@Headers('user-agent') ua` |
| `@CurrentUser()` | the authenticated user (`req.user`) | `@CurrentUser() user: AuthUser` |

### Worked example — `POST /v1/couriers/:id/assign`

```ts
@Post(':id/assign')
@Roles(Role.ADMIN)
assign(
  @Param('id') id: string,        // ← from the URL path
  @Body() dto: AssignRiderDto,    // ← validated body { riderId }
) {
  return this.couriersService.assignRider(id, dto.riderId);
}
```

The DTO declares *and validates* the shape:

```ts
// dto/assign-rider.dto.ts
export class AssignRiderDto {
  @IsString()
  @IsNotEmpty()
  riderId: string;      // missing/empty/non-string ⇒ 400 before the handler runs
}
```

### DTO validation cheatsheet (decorators we use)

`@IsString` `@IsInt` `@IsNumber` `@IsBoolean` `@IsEmail` `@IsEnum(SomeEnum)`
`@IsArray` `@ArrayNotEmpty` `@IsNotEmpty` `@IsOptional` `@Min(0)` `@IsJWT`.
A failed rule returns **400 Bad Request** with a message list — your service
code never sees malformed input.

### Reading the body conditionally (partial updates)

DTOs + the spread pattern make optional fields clean:

```ts
.setBody / data: {
  if (name != null) name,
  if (phone != null) phone,
}
```

In NestJS services we build the Prisma `data` object the same way, only setting
fields that were provided.

---

## 7. The complete API surface (all under `/v1`)

### Auth
| Method | Path | Role | Body | Returns |
|--------|------|------|------|---------|
| POST | `/auth/login` | public | `{ email, password }` | `{ token, refresh_token, user }` |
| POST | `/auth/google` | public | `{ googleId, email, name, avatarUrl? }` | `{ token, refresh_token, user }` |
| POST | `/auth/refresh` | public | `{ refreshToken }` | `{ token, refresh_token }` |
| POST | `/auth/logout` | public | `{ refreshToken }` | `{ success }` |
| GET | `/auth/me` | any auth | — | current profile |

### Riders
| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/riders` | ADMIN | create a rider (provisions a login) |
| GET | `/riders` | ADMIN | list riders + live active-ride counts |
| GET | `/riders/:id` | ADMIN | rider detail |
| GET | `/riders/:id/couriers` | ADMIN | a rider's past orders |
| GET | `/riders/me/couriers` | RIDER | my past orders |
| GET | `/riders/me/active` | RIDER | my active jobs |

### Couriers
| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/couriers` | ADMIN, CUSTOMER | create a booking |
| GET | `/couriers` | ADMIN | list all (`?status= &riderId= &search=`) |
| GET | `/couriers/mine` | CUSTOMER | my bookings |
| GET | `/couriers/:id` | ADMIN, RIDER | booking detail |
| GET | `/couriers/:id/track` | any auth | status timeline |
| POST | `/couriers/:id/assign` | ADMIN | `{ riderId }` → ASSIGNED |
| POST | `/couriers/:id/accept` | RIDER | accept assignment → ACCEPTED |
| POST | `/couriers/:id/decline` | RIDER | decline → back to PENDING |
| PATCH | `/couriers/:id/status` | ADMIN, RIDER | `{ status, note? }` advance |
| POST | `/couriers/:id/cancel` | ADMIN, CUSTOMER(own) | `{ reason? }` → CANCELLED |

### Courier status state machine (`couriers.service.ts`)

```
PENDING ─► ASSIGNED ─► ACCEPTED ─► PICKED_UP ─► ON_THE_WAY ─► DELIVERED
   │           │            │            │            │
   └───────────┴────────────┴────────────┴────────────┴────────► CANCELLED
ASSIGNED ─► PENDING   (rider declined / admin un-assigns)
```

Illegal jumps (e.g. PENDING → DELIVERED, or cancelling a DELIVERED booking) are
rejected with **400**. Every accepted transition appends a `CourierEvent` row,
which is what `/track` returns as the timeline.

---

## 8. Error responses (consistent across the API)

| Status | When |
|--------|------|
| **400** Bad Request | DTO validation failed, or an illegal status transition |
| **401** Unauthorized | missing/expired/invalid access token |
| **403** Forbidden | wrong role, or not the owner of the record |
| **404** Not Found | record doesn't exist |
| **409** Conflict | duplicate (e.g. creating a rider with an existing email) |

NestJS exceptions (`BadRequestException`, `ForbiddenException`, …) thrown in
services are serialized automatically to `{ statusCode, message, error }`.

---

## 9. Adding a new module (the recipe)

To add, say, the **Food** module later, follow the courier module exactly:

1. `prisma/schema.prisma` → add models, run `migrate`.
2. `src/food/dto/*.dto.ts` → request shapes with `class-validator` rules.
3. `src/food/food.service.ts` → business logic (inject `PrismaService`).
4. `src/food/food.controller.ts` → routes with `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)`.
5. `src/food/food.module.ts` → wire controller + service.
6. Register the module in `app.module.ts`.

The auth layer, guards, and validation pipe are global — a new module gets all
of it for free just by adding the decorators.
```
