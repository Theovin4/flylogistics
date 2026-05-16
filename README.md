# Fly Logistics

Fly Logistics is a production-oriented Next.js 15 platform scaffold for a futuristic AI-powered logistics operating system.

## What is included

- Next.js App Router, React 19, TypeScript, Tailwind CSS v4
- Framer Motion, GSAP, and Three.js hero interactions
- shadcn-style reusable UI primitives
- Light/dark/system theme support with persistence
- Public pages, auth pages, tracking, instant quote, blog, and four role dashboards
- API route architecture for quotes, tracking, OpenAI assistant, Auth.js, and webhooks
- Groq AI chat endpoint and premium chat UI
- Supabase-powered live driver map with realtime updates
- Leaflet/OpenStreetMap operations map with driver status cards
- Cloudinary signed image uploads for driver photos, package photos, proof-of-delivery photos, and future company media
- Prisma PostgreSQL schema for users, shipments, drivers, routes, vehicles, invoices, notifications, warehouses, analytics, AI logs, support tickets, proof of delivery, and audit logs
- Redis-backed rate limiting with graceful local fallback
- SEO metadata, sitemap, robots, Open Graph image, manifest, logo, favicon, and Vercel config

## Getting started

```bash
npm install
cp .env.example .env.local
npm run db:generate
npm run dev
```

Set `DATABASE_URL`, `AUTH_SECRET`, `GROQ_API_KEY`, `REDIS_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and Cloudinary credentials before production deployment.

Cloudinary uploads require:

```bash
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
NEXT_PUBLIC_CLOUDINARY_API_KEY=
```

Add a `photo_url` text column to the Supabase `drivers` table so uploaded driver profile images can be stored:

```sql
alter table public.drivers add column if not exists photo_url text;
```

For the full product flow, run [supabase-schema.sql](./supabase-schema.sql) in Supabase SQL editor. It creates:

- `drivers`
- `quote_requests`
- `shipments`

The app uses server routes with `SUPABASE_SERVICE_ROLE_KEY` for shipment creation, quote storage, status updates, and proof-of-delivery writes.

## Production notes

- Use Postgres with Prisma migrations for data durability.
- Use Redis for rate limiting, live events, notification fanout, and WebSocket presence.
- Keep authorization checks in server actions and route handlers; the proxy only adds request hardening.
- Use Cloudinary signed uploads for proof-of-delivery images and shipment documents.
- Use Supabase realtime for driver presence, map markers, and dispatch updates.
- Keep OpenStreetMap tile attribution visible when extending the Leaflet map.
