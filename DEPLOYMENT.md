# Deploying Project Camp (free tier)

Frontend on **Vercel**, backend on **Render**, database on **MongoDB Atlas**.

Vercel can't host this backend: it runs serverless functions, which cut off the
real-time (SSE) connection, wipe uploaded files, and make rate limiting
unreliable. Render runs a normal Node server, so everything works.

---

## 0. Before you start

1. **Push to GitHub.** The repo is initialised with a `.gitignore`; commit and
   push it:
   ```bash
   git add -A
   git commit -m "Project Camp"
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. **MongoDB Atlas** → Network Access → allow `0.0.0.0/0` (hosts use changing
   IP addresses), and create a database user.
3. **Generate two secrets**, running this twice:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
4. **Email:** the `MAILTRAP_SMTP_*` variables take any SMTP host, but
   **Render blocks outbound ports 25, 465 and 587**, so Gmail and most defaults
   will simply hang. Pick a provider that offers **port 2525**:

   | Provider | Free tier | Host | Port |
   | --- | --- | --- | --- |
   | Brevo (recommended) | 300 emails/day | `smtp-relay.brevo.com` | 2525 |
   | Mailtrap Sandbox | captures mail, never delivers it | `sandbox.smtp.mailtrap.io` | 2525 |
   | SendGrid | 100 emails/day | `smtp.sendgrid.net` | 2525 |

   Or skip email entirely for a demo: set `AUTO_VERIFY_EMAIL=true` and new
   accounts are usable immediately, with no verification mail. Anyone can then
   register with an address they don't own, so don't leave it on for real use.

---

## 1. Backend → Render

New → **Web Service** → pick the repo.

| Setting        | Value                          |
| -------------- | ------------------------------ |
| Root Directory | `backend`                      |
| Build Command  | `pnpm install && pnpm build`   |
| Start Command  | `pnpm start`                   |
| Instance Type  | Free                           |

Deploy, then copy the URL, e.g. `https://project-camp-api.onrender.com`.

### Environment variables

```
NODE_ENV=production
MONGO_URI=<Atlas connection string>
CORS_ORIGIN=https://<your-app>.vercel.app
SERVER_URL=https://<your-api>.onrender.com
TRUST_PROXY=1
COOKIE_SAME_SITE=none

ACCESS_TOKEN_SECRET=<secret 1>
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_SECRET=<secret 2>
REFRESH_TOKEN_EXPIRY=7d

EMAIL_VERIFICATION_REDIRECT_URL=https://<your-app>.vercel.app/verify-email
FORGOT_PASSWORD_REDIRECT_URL=https://<your-app>.vercel.app/reset-password

MAILTRAP_SMTP_HOST=smtp-relay.brevo.com
MAILTRAP_SMTP_PORT=2525
MAILTRAP_SMTP_USER=<user>
MAILTRAP_SMTP_PASS=<pass>
MAIL_FROM=Project Camp <no-reply@example.com>
```

Set `CORS_ORIGIN` and the two redirect URLs after step 2, once you know the
Vercel URL, then redeploy.

---

## 2. Frontend → Vercel

Add New → **Project** → pick the repo.

| Setting        | Value      |
| -------------- | ---------- |
| Root Directory | `frontend` |
| Framework      | Vite       |
| Build Command  | `pnpm build` (default) |
| Output         | `dist` (default)       |

### Environment variable

```
VITE_API_BASE_URL=https://<your-api>.onrender.com/api/v1
```

`frontend/vercel.json` is already in the repo; it serves `index.html` for deep
links such as `/projects/:id` and caches hashed assets.

---

## 3. Check it works

1. `https://<your-api>.onrender.com/api/v1/healthcheck` returns JSON.
2. Register an account and open the verification link from the email (with
   `AUTO_VERIFY_EMAIL=true` the account is ready straight away instead).
3. Sign in. In DevTools → Application → Cookies, `accessToken` should be
   `Secure` with `SameSite=None`.
4. Create a project and a task, and upload a file.
5. Open the app in two browsers — a change in one appears in the other within
   about a second (real-time updates).
6. Refresh the page on `/projects/<id>`: no 404.

---

## Free-tier limits

- **The API sleeps** after ~15 minutes of inactivity. The next request takes
  ~50 seconds, and open real-time connections drop (the app reconnects).
- **Uploaded files disappear** on every deploy and restart, because the free
  instance has no persistent disk. Fix later with Cloudinary/S3 (free tiers) or
  a paid Render disk.
- **Safari and Brave block the login cookie**, because the app and API are on
  different sites. Chrome and Firefox work. Fix with a custom domain:
  - Point `app.example.com` at Vercel and `api.example.com` at Render.
  - Update `CORS_ORIGIN`, `SERVER_URL`, both redirect URLs and
    `VITE_API_BASE_URL`, and set `COOKIE_SAME_SITE=lax`.
  - Cookies are then same-site and work everywhere.
- **Rate limits and real-time subscribers live in memory**, so they only work
  with a single instance. That's fine on the free tier (one instance).

---

## Deploying updates

Both hosts redeploy automatically when you push to the default branch.
Environment variable changes need a manual redeploy on Render.
