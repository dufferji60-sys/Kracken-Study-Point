# Kracken Study

Kracken Study is a private, invite-only study-resource platform. An administrator manages temporary student accounts, trades, chapters, PDF resources, and the public-facing site identity. Students sign in to browse a searchable trade → chapter → resource library and open or download original files.

## Included

- Username/password login with HTTP-only signed session cookies
- Admin-only routes and server-side role checks
- Temporary accounts with 1 hour, 1 day, 1 week, 1 month, or custom expiry
- Account enable/disable, reset password, extend expiry, and delete actions
- Dynamic trades, chapters, and multiple resources per chapter
- Search across trades, chapters, and resources
- Admin settings for site name, logo, favicon, background, Kracken branding, About Me, Instagram, and footer copy
- Persistent PostgreSQL data through Drizzle ORM
- Presigned object-storage upload API for PDFs and images
- Installable Android PWA with a home-screen prompt and offline app shell
- Responsive React/Vite frontend with loading, empty, error, and confirmation states

## 1. Install

```bash
pnpm install
```

## 2. Configure environment variables

Copy the example file and fill in values from your database and storage provider:

```bash
cp .env.example .env
```

Required values:

- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — long random string used to sign the login cookie
- `ADMIN_USERNAME` — initial administrator username, created on first server start
- `ADMIN_PASSWORD` — initial administrator password, created on first server start
- `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY_ID`, and `STORAGE_SECRET_ACCESS_KEY` — S3-compatible persistent file storage
- `PRIVATE_OBJECT_DIR` and `PUBLIC_OBJECT_SEARCH_PATHS` — object key prefixes

Do not commit `.env`. The starter admin login in `.env.example` is for private testing only; replace the password with a strong private value before a public launch. Admin credentials are only seeded when the matching account does not already exist, so changing environment variables does not reset a password in an existing database.

## 3. Set up the database

For a development database:

```bash
pnpm --filter @workspace/db run push
```

The API seeds a small library structure and the initial admin account when the corresponding tables are empty. Content is stored in PostgreSQL after that; do not edit seed values to manage normal content.

## 4. Run locally

Start the API and frontend in separate terminals:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/kraken-study run dev
```

The Replit workspace also includes managed workflows for both services. Open the frontend preview at the project root.

## 5. Uploading files

The application uses a presigned upload flow:

1. The admin client sends file metadata to `POST /api/storage/uploads/request-url`.
2. The API returns a short-lived upload URL and an object path.
3. The browser sends the file bytes directly to the storage provider.
4. The returned object path is saved with the resource record.

Keep PDF bytes out of PostgreSQL. Only file metadata and object paths belong in the database.

The bucket must allow browser `PUT` requests from your deployed site origin and allow the `Content-Type` request header. For Cloudflare R2, add a bucket CORS rule for your deployed domain (and localhost while developing). Keep the bucket private; the API streams files through an authenticated route.

## 6. GitHub

From the project directory:

```bash
git init
git add .
git commit -m "Build Kracken Study"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

## 7. Render

1. Push the unzipped project contents to GitHub. The repository root must contain `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`.
2. Create a Render PostgreSQL database. Use its Internal Database URL as `DATABASE_URL` on the web service, and keep the database and web service in the same region.
3. Create a Render **Web Service** connected to the repository. Leave Root Directory blank when those project files are at the repository root.
4. Use this Build Command:

```bash
corepack enable && corepack prepare pnpm@10.26.1 --activate && CI=true pnpm install --frozen-lockfile && PORT=10000 BASE_PATH=/ pnpm --filter @workspace/kraken-study run build && pnpm --filter @workspace/api-server run build
```

5. Use this Start Command:

```bash
pnpm --filter @workspace/api-server run start
```

6. Add these Environment Variables in Render: `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `NODE_ENV=production`. Set the starter login to username `Kracken` and password `Kracken@123` only for private testing; replace the password with a strong secret before a public launch. Render supplies `PORT` automatically. Add the `STORAGE_*`, `PRIVATE_OBJECT_DIR`, and `PUBLIC_OBJECT_SEARCH_PATHS` variables from `.env.example` when enabling file uploads.
7. Before the first login, run this command once from the project root with `DATABASE_URL` available, to create the PostgreSQL tables:

```bash
pnpm --filter @workspace/db run push
```

After deployment, check `https://YOUR-SERVICE.onrender.com/api/healthz`. Then sign in using the admin values configured in Render. The health endpoint confirms the web server responds; it does not verify the database connection.

The Render commands above build the frontend and API packages directly. The repository-wide `pnpm run build` also typechecks an unrelated mockup workspace and may fail if its generated preview file is absent.

## 8. Install on Android

After the site is deployed over HTTPS, open it in Chrome on Android and tap **Install** when the in-page prompt appears. If Chrome does not show the prompt, open the browser menu and choose **Install app** or **Add to Home screen**. It installs as a PWA and uses the same website, accounts, and database; this project does not include an APK.

Run a production build locally before deploying:

```bash
PORT=18183 BASE_PATH=/ pnpm --filter @workspace/kraken-study run build
pnpm --filter @workspace/api-server run typecheck
```

## API contract

The source of truth for all generated client and validation code is `lib/api-spec/openapi.yaml`. After changing an endpoint or schema:

```bash
pnpm --filter @workspace/api-spec run codegen
```
