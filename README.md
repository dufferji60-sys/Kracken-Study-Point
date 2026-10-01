# Kraken Study

Kraken Study is a private, invite-only study-resource platform. An administrator manages temporary student accounts, trades, chapters, PDF resources, and the public-facing site identity. Students sign in to browse a searchable trade → chapter → resource library and open or download original files.

## Included

- Username/password login with HTTP-only signed session cookies
- Admin-only routes and server-side role checks
- Temporary accounts with 1 hour, 1 day, 1 week, 1 month, or custom expiry
- Account enable/disable, reset password, extend expiry, and delete actions
- Dynamic trades, chapters, and multiple resources per chapter
- Search across trades, chapters, and resources
- Admin settings for site name, logo, favicon, background, Kraken branding, About Me, Instagram, and footer copy
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

Do not commit `.env`. Change the initial admin password after the first login if you later replace the account-management flow.

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

The bucket must allow browser `PUT` requests from your deployed site origin and allow the `Content-Type` request header. For Cloudflare R2, add a bucket CORS rule for your Vercel domain (and localhost while developing). Keep the bucket private; the API streams files through an authenticated route.

## 6. GitHub

From the project directory:

```bash
git init
git add .
git commit -m "Build Kraken Study"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

## 7. Vercel

Import the GitHub repository into Vercel and keep the project root at the repository root. Add every variable from `.env.example` in the Vercel project settings for the correct environment. Use a managed PostgreSQL provider and a Vercel-compatible S3/GCS object-storage provider for the production database and uploads.

The repository includes `vercel.json` for the Vite output and the API function entry point. Vercel serverless functions are stateless, so sessions, database records, and uploaded files must use the configured persistent services.

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
