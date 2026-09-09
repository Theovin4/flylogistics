# Fly Logistics Production Readiness Audit

Audit date: 2026-08-19

This audit inspected the Next.js app, Supabase schema, production environment variable names, public SEO files, security headers, middleware, payment providers, carrier integrations, notifications, and operational documentation.

## Executive Summary

Fly Logistics has a strong production foundation: role-based route protection, server-side secret usage, branded transactional email templates, public SEO routes, sitemap and robots files, payment callback routes, carrier webhook routes, health checks, Supabase RLS policies, rate limiting helpers, and operational event logging are already present.

Safe fixes applied during this pass:

- Production email sender defaults now use `flylogistics.com.ng`.
- App emails now include a branded Reply-To address.
- Resend test sender is no longer the silent production fallback.
- Stale `.flylogistics.ng` fallback emails were replaced with `.flylogistics.com.ng`.
- README and production operations docs were updated for the production sender setup.

No core workflows, routes, dashboards, database schema, payment logic, tracking logic, carrier adapters, or Supabase policies were rewritten.

## Verified By Code Inspection

### Framework And Routing

- Next.js App Router is configured with `reactStrictMode: true`, typed routes, and `poweredByHeader: false`.
- `next.config.ts` redirects `flylogistics.vercel.app` and `www.flylogistics.com.ng` to `https://flylogistics.com.ng`.
- Private routes are noindexed by middleware.
- Public routes remain indexable through `src/app/sitemap.ts` and `src/app/robots.ts`.
- A public health endpoint exists at `/api/health`.

### Authentication And Authorization

- Middleware resolves role server-side from `public.user_profiles` using the authenticated Supabase user id.
- Stale role cookies are cleared on role mismatch.
- Protected route groups exist for admin, customer, driver, dispatcher, merchant, and cloud workspaces.
- Admin-only and role-only API patterns use `requireRole` or tenant role checks.

### Supabase And RLS

- Key tables exist in `supabase-schema.sql`: `shipments`, `shipment_events`, `drivers`, `quote_requests`, `user_profiles`, `operational_events`, `notification_messages`, `customer_wallets`, `wallet_transactions`, `companies`, and `company_members`.
- RLS is enabled for the key tenant, wallet, shipment, driver, quote, notification, and operational-event tables.
- Policies use the safer `drop policy if exists` then `create policy` pattern.
- No `drop table`, `truncate`, or broad `delete from` statements were found in `supabase-schema.sql`.

### Security Headers

- Global headers include HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict referrer policy, COOP, CORP, permissions policy, and DNS prefetch control.
- Private routes receive `X-Robots-Tag: noindex, nofollow, noarchive`.
- `x-middleware-subrequest` requests are rejected.

### API Validation And Rate Limiting

- Shared API helpers enforce maximum JSON body size and Zod validation.
- Public and sensitive API routes inspected use `enforceRateLimit`.
- Rate limiting fails open if Redis is unavailable, which preserves customer operations but should be monitored.

### Payments

- Flutterwave secret key is used server-side only.
- Flutterwave checkout uses Fly Logistics branding and server-side verification paths.
- The retired alternative checkout integration has been removed from runtime code and configuration.

### Notifications

- Resend transactional emails render through a Fly Logistics HTML template with the public logo at `https://flylogistics.com.ng/payment-logo`.
- Customer shipment emails are white-labeled and do not expose backend carriers.
- WhatsApp webhook GET verification and POST signature validation exist.
- Termii SMS provider is server-side only.
- Notification attempts are recorded through `notification_messages`.

### SEO And Indexing

- `metadataBase` uses `https://flylogistics.com.ng`.
- Sitemap uses canonical `flylogistics.com.ng` URLs.
- Robots file includes the canonical sitemap and disallows private dashboards, auth, API, and payment paths.
- Google site verification, Meta domain verification, AdSense account metadata, and analytics script support are present.

## Production Env Name Check

Vercel production env variable names were checked without printing values.

Present:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `RESEND_FROM_EMAIL`
- `ADMIN_NOTIFICATION_EMAIL`
- `FLUTTERWAVE_SECRET_KEY`
- Crypto rate fallback and discount settings are server-side only.
- `FEZ_API_BASE_URL`
- `FEZ_USER_ID`
- `FEZ_PASSWORD`
- `FEZ_SECRET_KEY`
- `FEZ_WEBHOOK_SECRET`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_CLOUD_PHONE_NUMBER_ID`
- `WHATSAPP_CLOUD_ACCESS_TOKEN`
- `TERMII_API_KEY`
- `CRON_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Missing by name:

- `EMAIL_REPLY_TO`: app now falls back to `support@flylogistics.com.ng`; add it in Vercel for explicit control.
- `FLUTTERWAVE_WEBHOOK_SECRET_HASH`: add this if Flutterwave webhook signature verification is required in production.
- `GOOGLE_BUSINESS_PROFILE_REFRESH_TOKEN`: may be stored in the database by OAuth, but it is not present as a Vercel env var.
- `DATABASE_URL`: not required by the Supabase API client, but required for Prisma database scripts and database backup scripts.

## Manual Provider Checks Still Required

- Confirm `notifications@flylogistics.com.ng` is a verified sender/domain in Resend.
- Add `EMAIL_REPLY_TO=support@flylogistics.com.ng` in Vercel production.
- Add Flutterwave webhook hash if Flutterwave webhooks are active.
- Confirm Flutterwave and approved crypto payment flows in production.
- Confirm Google Business Profile API quota has recovered before loading accounts and locations.
- Confirm Zoho MX, SPF, DKIM, and DMARC records remain valid after DNS changes.

## Risk Notes

- Content Security Policy is not currently enforced. Adding CSP is recommended, but should be done as a dedicated pass because the app uses maps, analytics, payment redirects, Cloudinary, Resend-linked images, and external carrier/payment callbacks.
- Redis rate limiting fails open by design. This protects customer flows during Redis incidents, but repeated failures should trigger an admin alert.
- Google Business Profile API currently depends on Google quota and token state; failure should never block customer operations.
