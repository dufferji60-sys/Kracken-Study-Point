# Kraken Study

Private study-resource platform for managing temporary student access and a dynamic trade → chapter → PDF library.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and object-storage variables shown in `.env.example`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/kraken-study/` — React/Vite frontend and visual theme
- `artifacts/api-server/src/routes/study.ts` — auth, dashboard, library, users, and settings routes
- `artifacts/api-server/src/routes/storage.ts` — presigned object-storage routes
- `lib/db/src/schema/study.ts` — PostgreSQL schema
- `lib/api-spec/openapi.yaml` — API source of truth
- `README.md` and `.env.example` — GitHub/Vercel setup instructions

## Architecture decisions

- The login system uses signed, HTTP-only cookies backed by a PostgreSQL session table; passwords are scrypt-hashed and never returned to clients.
- All content is database-backed. The API owns authorization; hiding admin navigation in the client is not a security boundary.
- Uploaded bytes stay in persistent object storage. PostgreSQL stores only the returned object path and file metadata.
- The frontend consumes generated React Query hooks from the OpenAPI contract instead of hand-written client types.

## Product

Students can sign in, browse trades and chapters, search resources, and open/download PDFs. The administrator can manage temporary student accounts, content hierarchy, uploads, and public branding/settings.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
