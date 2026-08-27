<p align="center">
  <img src="frontend/public/digital-thread-logo-no-bg.png" alt="Digital Thread logo" width="320" />
</p>

# Digital Thread

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

**Digital Thread** is an open, modular platform for orchestrating the lifecycle of composite
components across multi-partner industrial and aerospace value chains. It provides
partner-scoped workflow execution, governed file exchange with classification-based access
control, full provenance and lineage tracking (modeled on W3C PROV-O), and standards-based
interoperability with AAS, DTDL and AutomationML.

## Features

- **Graphical state-machine editor** for designing multi-partner workflows, with immutable
  versioning so in-flight iterations always keep running the definition they were created against.
- **Iteration (instance) execution** with partner-scoped RBAC across three roles — SUPERADMIN,
  OWNER, OPERATOR.
- **File classification and access requests** — every file carries a classification level, with
  a governed request/approval flow for cross-partner access.
- **Live updates** over Server-Sent Events.
- **Pluggable infrastructure** — SQLite or PostgreSQL for the database, local filesystem or
  MinIO (S3-compatible) for object storage.
- **Optional integrations** — OIDC single sign-on, a Redis-backed event broker for multi-instance
  deployments, and Vault-backed secrets encryption.

## Work in progress

The following features are implemented but their user interface is still being finalized. In the
current build they are visible but disabled — marked with a yellow *Work in progress* badge and
rendered blurred and non-interactive:

- **Append-only audit and provenance** — administrative actions, file access, logins, and
  provenance/lineage edges are recorded in tamper-evident, insert-only tables.
- **Provenance explorer** — per-iteration provenance views: partner timeline, file story,
  sortable table with CSV export, and a W3C PROV-O graph with Turtle download.
- **Lineage explorer** — upstream/downstream file lineage graph across iterations.
- **Governance dashboard** — review and approval of cross-partner file-access requests.
- **Observability** — Prometheus metrics and optional OpenTelemetry distributed tracing.
- **Audit console** — admin actions, file access, logins and metrics (SUPERADMIN).
- **Notifications** — per-user email/webhook subscriptions by semantic event type, with
  delivery history.
- **External REST API access** — per-user API-key management on the Profile page (the
  `/api/v1/ext` surface and its Swagger UI at `/docs/ext` are in place).
- **In-app standards reference** — the documentation viewer for the AAS/DTDL/AutomationML
  mappings.
- **Standards-based import/export** — AAS, DTDL and AutomationML.
- **Workflow version compare** — side-by-side comparison of two immutable workflow versions.
- **Client-side file preview** — in-browser 3D CAD/mesh (STEP/IGES/STL/OBJ/glTF/…), PDF and
  JSON viewers next to each download.
- **Settings sections** — Data sources, Node templates (including the domain-template palette
  in the workflow editor) and Email (SMTP) configuration.

## Architecture

| Component | Stack | Port |
|---|---|---|
| Backend | NestJS 11 + Fastify + Prisma 6 | 3000 |
| Frontend | React 19 + Vite 7 + XYFlow + Zustand | 5173 (dev server proxies `/api`, `/docs/ext`, `/sse`, `/ws` to the backend) |

Monorepo layout:

```
digital-thread/
├─ backend/    NestJS API, Prisma schema/migrations, seed & migration scripts
├─ frontend/   React SPA
└─ scripts/    Repo-level utility scripts (database provider switcher)
```

Everything runs **100% locally by default** — no external services are required to develop
against the platform (SQLite database, filesystem storage, in-process event bus).

## Getting Started

### Prerequisites

- **Node.js 20** or later, with npm (both Dockerfiles build on `node:20-alpine`; the backend's
  `package.json` declares `"engines": { "node": ">=20" }`)

### Standalone (backend + frontend on your machine)

By default the backend uses **SQLite** and **filesystem** storage — no databases or object
stores to stand up first.

```bash
cd backend
npm install
cp .env.example .env
# PowerShell / cmd users: copy .env.example .env
npx prisma migrate deploy
npm run seed
npm run migrate:versions
npm run start:dev
```

> **`migrate:versions` is required immediately after `seed`** on a first run (or after any
> database reset). The seed script creates workflow definitions but not their versioned
> snapshots; without this step, creating a new iteration or editing a workflow graph fails with
> a "no versions" error.

The backend listens on **http://localhost:3000** (Swagger UI at `/docs`, health check at
`/health`).

In a second terminal, start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**.

### Seeded demo accounts

The seed script registers 12 demo partner organizations and the following accounts.
**These are demo credentials for local evaluation only — do not reuse them anywhere else.**

| Role | Email | Password | Scope |
|---|---|---|---|
| SUPERADMIN | `admin@compstlar.eu` | `admin123` | Full platform access — the only partner-less role |
| OWNER | `owner@compstlar.eu` | `owner123` | Bound to partner **CAI** — authors/runs workflows and manages CAI's products |
| OPERATOR | `operator@cai.eu` | `partner123` | Partner **CAI** — own-partner nodes only |
| OPERATOR | `operator@aimplas.eu` | `partner123` | Partner **AIMPLAS** — own-partner nodes only |
| OPERATOR | `operator@<partner>.eu` | `partner123` | One operator per remaining consortium partner: `ens`, `aim`, `msq`, `imd`, `idk`, `ntnu`, `ipt`, `ucb`, `zie`, `ensam` |

### Docker Compose (full stack: PostgreSQL + MinIO + Redis)

`docker-compose.yml` builds and runs **both** the backend and frontend as containers, alongside
PostgreSQL, MinIO and Redis.

> The backend image bakes in a Prisma client generated for whichever database provider
> `backend/prisma/schema.prisma` declares **at build time**. The repository ships with SQLite as
> the committed default, but the Compose backend service is configured for PostgreSQL — switch
> the schema *before* building:

```bash
cd backend
npm run db:use:postgres
cd ..
docker compose up -d --build
```

This starts:

- **postgres** — PostgreSQL 16, database `digital_thread` (user/password `dt` / `dt`)
- **minio** + **createbuckets** — MinIO object storage, provisioning the `digital-thread` bucket
  with versioning enabled
- **redis** — Redis 7, backing the multi-instance SSE event broker
- **backend** — the NestJS app on port 3000 (applies the schema with `prisma db push` and the
  append-only trigger SQL on boot, then starts the server)
- **frontend** — the production build served by nginx on port 5173, proxying `/api` to the
  backend container

The backend container does **not** seed automatically. Run it once against the running stack:

```bash
docker compose exec backend npm run seed
docker compose exec backend npm run migrate:versions
```

URLs once the stack is up:

- App: http://localhost:5173
- API: http://localhost:3000
- Swagger, internal API (JWT): http://localhost:3000/docs
- Swagger, external API (API key): http://localhost:3000/docs/ext
- MinIO console: http://localhost:9001 (`minioadmin` / `minioadmin`)

> The `JWT_SECRET` and `SECRETS_KEY_HEX` values baked into `docker-compose.yml` are placeholders
> for local evaluation only. Change both — along with the default MinIO and PostgreSQL
> credentials — before using this Compose file for anything beyond a local trial.

## Database

Digital Thread runs on **SQLite** by default and can be switched to **PostgreSQL**. Because
Prisma's `datasource` provider is a compile-time literal (not switchable by environment variable
alone), toggling between them is scripted:

```bash
cd backend
npm run db:use:sqlite      # or: npm run db:use:postgres
```

Each command rewrites the provider in `prisma/schema.prisma`, updates `DB_PROVIDER` /
`DATABASE_URL` in `backend/.env`, and regenerates the Prisma client. The committed
`schema.prisma` currently targets SQLite, matching the committed migration history under
`backend/prisma/migrations/`.

To run against PostgreSQL:

```bash
docker compose up -d postgres
cd backend
npm run db:use:postgres
npm run db:setup:postgres   # prisma db push + append-only triggers
npm run seed
npm run migrate:versions
```

`db:setup:postgres` uses `prisma db push` rather than `prisma migrate deploy`, because the
committed Prisma migrations are SQLite-dialect. The Postgres-specific append-only triggers live
separately in `backend/prisma/postgres/append-only-triggers.sql` and are applied idempotently by
the same command.

## Storage

File storage is pluggable between the local filesystem and MinIO (S3-compatible), selected via
`STORAGE_PROVIDER`:

- **`fs`** (default) — files are written under `STORAGE_PATH` (default `./storage`), inside a
  top-level directory named after `STORAGE_BUCKET`.
- **`minio`** — files are written to a MinIO/S3 bucket named `STORAGE_BUCKET` (default
  **`digital-thread`**), configured via `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`,
  `MINIO_SECRET_KEY`, `MINIO_SECURE`.

One installation uses exactly one bucket; the same object-key layout is used on both providers.

To run a local MinIO for standalone (non-Compose) development:

```bash
docker compose up -d minio createbuckets
```

Then set `STORAGE_PROVIDER=minio` in `backend/.env` — the `MINIO_*` defaults already match the
Compose service. Console: http://localhost:9001 (`minioadmin` / `minioadmin`).

## Configuration reference

The variables below are documented in `backend/.env.example`. The standalone quick start only
requires copying that file as-is (SQLite + filesystem storage, no external services).

**Core / server**

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Backend HTTP port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed origin(s) for the frontend, comma-separated; `*` allowed |
| `LOG_LEVEL` | `info` | Fastify/pino log level |
| `NODE_ENV` | `development` | Standard Node environment marker |
| `THROTTLE_TTL_S` / `THROTTLE_LIMIT` | `60` / `120` | Global per-IP rate limit window (seconds) / request count |

**Database**

| Variable | Default | Purpose |
|---|---|---|
| `DB_PROVIDER` | `sqlite` | `sqlite` or `postgres` — set by `db:use:*`, not meant to be hand-edited |
| `DATABASE_URL` | `file:./dev.db` | Prisma connection string |

**Storage**

| Variable | Default | Purpose |
|---|---|---|
| `STORAGE_PROVIDER` | `fs` | `fs` or `minio` |
| `STORAGE_PATH` | `./storage` | Filesystem root (fs provider) |
| `STORAGE_BUCKET` | `digital-thread` | Bucket / top-level directory name |
| `MAX_UPLOAD_BYTES` | `33554432` (32 MB) | Max decoded upload size |
| `MINIO_ENDPOINT` / `MINIO_PORT` | `localhost` / `9000` | MinIO endpoint |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | `minioadmin` / `minioadmin` | MinIO credentials |
| `MINIO_SECURE` | `false` | Use TLS against MinIO |

**Auth / OIDC**

| Variable | Default | Purpose |
|---|---|---|
| `JWT_SECRET` | placeholder | HS256 signing secret — set a long random string |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRES_DAYS` | `7` | Refresh token lifetime |
| `AUTH_PROVIDER` | `jwt` | Auth strategy |
| `OIDC_ISSUER_URL` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | unset | Enables SSO login when both issuer and client id are set |
| `OIDC_SCOPE` | `openid email profile` | Requested scopes |
| `OIDC_REDIRECT_URI` | `http://localhost:3000/api/v1/auth/oidc/callback` | Callback URL registered with the identity provider |
| `OIDC_ROLE_CLAIM` | `roles` | Claim carrying role/group membership |
| `OIDC_ROLE_MAPPING` | unset | JSON map of IdP group to `SUPERADMIN` / `OWNER` / `OPERATOR` |
| `OIDC_PARTNER_CLAIM` | unset | Claim carrying the partner short name or id |
| `OIDC_PROVIDER_LABEL` | `SLICES IAM` | SSO button label on the login page |
| `FRONTEND_URL` | `http://localhost:5173` | Post-login redirect and logout return target |

**Events**

| Variable | Default | Purpose |
|---|---|---|
| `EVENT_BROKER` | in-process | Set to `redis` to fan SSE events out across multiple backend instances |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection (when `EVENT_BROKER=redis`) |

**Observability**

| Variable | Default | Purpose |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | Enables OpenTelemetry tracing when set |
| `OTEL_SERVICE_NAME` | `digital-thread-backend` | Trace resource service name |

Prometheus metrics are always exposed at `GET /api/v1/metrics` — no configuration needed.

**Notifications**

| Variable | Default | Purpose |
|---|---|---|
| `SMTP_URL` | unset | Fallback SMTP connection string; a SUPERADMIN can instead configure SMTP at runtime from Settings → Email (SMTP) — a work-in-progress UI — which takes priority |
| `SMTP_FROM` | unset | Fallback "from" address |

**Retention**

| Variable | Default | Purpose |
|---|---|---|
| `RETENTION_ENABLED` | `false` | Enable nightly deletion of files past their classification's retention window |
| `RETENTION_SWEEP_MS` | `86400000` (24h) | Sweep interval |

**Vault / secrets**

| Variable | Default | Purpose |
|---|---|---|
| `SECRETS_KEY_HEX` | derived from `JWT_SECRET` (dev-only fallback) | AES-256-GCM key encrypting secrets at rest (data-source credentials, webhook auth, SMTP config) |
| `VAULT_ADDR` / `VAULT_TOKEN` / `VAULT_SECRET_PATH` | unset | Fetch the secrets key from a Vault KV v2 secret at startup instead |

**AAS federation (optional)**

| Variable | Default | Purpose |
|---|---|---|
| `AAS_SERVER_BASE_URL` / `AAS_REGISTRY_BASE_URL` | unset | Thin client for a remote AAS Part 2 server/registry; left unset, related calls are skipped |
| `AAS_REGISTRY_SYNC_ENABLED` / `AAS_REGISTRY_SYNC_MS` | `false` / `600000` | Periodically poll federated AAS Registry peers into the local catalog |
| `AAS_EVENTS_SUBSCRIBE` | `false` | Subscribe to AAS Part 2 events on active MQTT data sources |

## API Documentation

- **Swagger UI, internal API (JWT):** http://localhost:3000/docs
- **Swagger UI, external API (`X-API-Key`):** http://localhost:3000/docs/ext — a dedicated,
  API-key-authenticated REST surface for OPERATOR/OWNER integrations, documented separately from
  the internal API (API-key management in the Profile page is currently
  [work in progress](#work-in-progress))
- **Prometheus metrics:** `GET /api/v1/metrics` (unauthenticated)
- **Health / readiness probes:** `GET /health`, `GET /readiness` (unauthenticated)

All internal API routes are served under the `/api/v1` prefix (health and readiness excluded).

## Development

Backend (from `backend/`):

```bash
npm run lint
npm test           # Jest unit tests
npm run test:e2e   # Jest end-to-end suite
npm run build       # nest build -> dist/
```

Frontend (from `frontend/`):

```bash
npm run lint
npm run build       # tsc -b && vite build
npm run preview     # serve the production build locally
```

The frontend package does not currently define a test script.

## Project Structure

```
digital-thread/
├─ backend/                 NestJS 11 + Fastify + Prisma 6 API (port 3000)
│  ├─ src/
│  │  ├─ auth/              JWT + OIDC federation, RBAC guards
│  │  ├─ users/ partners/   Partner-scoped core registries
│  │  │  products/
│  │  ├─ machines/          Workflow editor + versioned iteration runtime
│  │  │  iterations/
│  │  ├─ execution/         Workflow engine and node handlers
│  │  ├─ files/             Upload, classification, storage abstraction
│  │  │  datasources/
│  │  ├─ standards/         AAS / DTDL / AutomationML import-export
│  │  ├─ provenance/        Provenance and lineage graph
│  │  │  lineage/
│  │  ├─ governance/        Access requests, compliance, change management
│  │  │  compliance/
│  │  ├─ notifications/     Per-user email/webhook subscriptions
│  │  ├─ audit/             Append-only audit console
│  │  ├─ api-key/ ext-api/  External REST API (API-key auth)
│  │  └─ common/            Observability, resilience, security
│  ├─ prisma/               Schema, migrations, seed data
│  └─ scripts/              Seed and one-shot migration/backfill scripts
└─ frontend/                 React 19 + Vite 7 SPA (port 5173)
   └─ src/
      ├─ pages/ components/  Routed views, editor canvas, previews, uploads
      ├─ stores/             Zustand stores (API-backed)
      └─ hooks/ lib/ types/ data/
```

## License

Copyright (C) 2026 Walter D. Vergara, Manfredi Pistone, Sabrina Verardi, Cinzia Rubattino (Engineering Ingegneria Informatica S.p.A.)

This program is free software: you can redistribute it and/or modify it under the terms of the
GNU Affero General Public License as published by the Free Software Foundation, version 3 of
the License. It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See
the [LICENSE](LICENSE) file for the full text of the GNU AGPL v3.

## Acknowledgments

This software was developed in the context of the CompSTLar project (grant agreement
No [101192936]), funded by the European Union's Horizon Europe research and innovation programme.
Views and opinions expressed are those of the authors only and do not necessarily reflect those
of the European Union or the granting authority; neither the European Union nor the granting
authority can be held responsible for them.
