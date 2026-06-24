# Deploying Kashio (free tier, ~2–3 users)

Three free pieces:

| Part | Service | URL you'll get |
|------|---------|----------------|
| Database | **Neon** (Postgres) | a connection string |
| Backend | **Render** (NestJS) | `https://kashio-backend.onrender.com` |
| Admin dashboard | **Vercel** (Next.js) | `https://kashio-admin.vercel.app` |

> The Flutter app isn't "deployed" — it just points at the Render backend URL.

---

## 1. Database — Neon

1. Create a project at https://neon.tech.
2. Copy **two** connection strings from the dashboard:
   - **Pooled** (host contains `-pooler`) → this is `DATABASE_URL`
   - **Direct** (no `-pooler`) → this is `DIRECT_URL`
3. Make sure both end with `?sslmode=require`.

---

## 2. Backend — Render

Render deploys from a Git repo, so push the `backend/` folder to GitHub first
(see "Git setup" below).

**Option A — Blueprint (uses `render.yaml`):**
New → Blueprint → pick the repo. It reads `backend/render.yaml` and fills in the
build/start commands. Then set the secret env vars in the dashboard.

**Option B — manual Web Service:**
- Root directory: `backend`
- Build: `npm install && npx prisma generate && npm run build`
- Start: `npx prisma migrate deploy && node dist/main`
- Health check path: `/v1/health`

**Env vars to set in Render:**
```
DATABASE_URL   = <Neon pooled string>
DIRECT_URL     = <Neon direct string>
JWT_SECRET     = <a long random string>
CORS_ORIGINS   = https://kashio-admin.vercel.app
ACCESS_TOKEN_EXPIRES_IN   = 15m
REFRESH_TOKEN_EXPIRES_DAYS = 60
```
(`PORT` is provided by Render automatically.)

**Seed the admin once** (Render → your service → Shell):
```
npm run db:seed
```
Login becomes `admin@kashio.app` / `admin123`.

> Free Render services sleep after ~15 min idle; the first request then takes
> ~50s to wake. Fine for a few testers.

---

## 3. Admin dashboard — Vercel

1. Push `admin-dashboard/` to GitHub.
2. Vercel → New Project → import it (root directory `admin-dashboard`; Next.js
   is auto-detected).
3. Add one env var:
   ```
   NEXT_PUBLIC_API_BASE_URL = https://kashio-backend.onrender.com
   ```
4. Deploy. Then go back to Render and make sure `CORS_ORIGINS` is the Vercel URL.

---

## 4. Point the mobile app at the live backend

Run / build the Flutter app with:
```
flutter run --dart-define=API_ORIGIN=https://kashio-backend.onrender.com
```
For a release build, set the same value (or the prod origin in `client_constant.dart`).

---

## Git setup (first time)

`backend/` and `admin-dashboard/` are separate repos. From each folder:
```
git init
git add .
git commit -m "Initial deploy"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
`.env` is gitignored, so secrets stay out of the repo — set them in Render/Vercel.
