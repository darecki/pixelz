# Pixelz

Offline-first puzzle game (MVP: web + Vercel API + Supabase).

## Setup

- **Node:** 20+
- **pnpm:** `npm install -g pnpm`

```bash
pnpm install
pnpm build
```

## Run locally

```bash
# Web app (Vite)
pnpm dev:web

# API (Hono)
pnpm dev:api
```

Or both in parallel: `pnpm dev`

## Monorepo

- `apps/web` – React (Vite) frontend
- `apps/api` – Hono API (Vercel serverless)
- `packages/shared` – Zod schemas, events, API contracts

## Env

Copy `.env.example` to `.env.local` and fill in Supabase + database values. See `.env.example` for variable names.
