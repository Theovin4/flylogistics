# Fly Logistics Disaster Recovery Plan

## Recovery Objectives

- Public website and tracking: restore within 30 minutes.
- Admin operations: restore within 60 minutes.
- Payments, carrier sync, and notifications: restore within 2 hours, with manual reconciliation if providers are degraded.
- Data loss target: rely on Supabase automated backups and point-in-time recovery where enabled.

## Critical Systems

- Vercel: Next.js app, API routes, webhooks, cron jobs.
- Supabase: Auth, Postgres, Realtime, RLS policies, operational data.
- Redis: rate limiting and short-lived cache.
- Cloudinary: proof-of-delivery and media assets.
- Resend: transactional email.
- WhatsApp Cloud API and Termii: customer communications.
- Flutterwave and approved blockchain records: payments.
- FEZ and Sendbox: optional carrier fulfillment providers.
- GitHub: source control and deployment pipeline.

## Backups

### Supabase

- Enable daily backups and point-in-time recovery on the production project.
- Before schema changes, take a manual backup and test the SQL in staging.
- Weekly: run `npm run backup:db:schema` from a secure machine with `DATABASE_URL`.
- Monthly: run a full restore test into a temporary Supabase project.

### Vercel Environment Variables

- Store secret values only in a password manager.
- Export and review env variable names after every release.
- Do not commit `.env.local`, Vercel pulled env files, database dumps, or provider secrets.

### Cloudinary

- Keep Cloudinary asset backups enabled for proof media.
- Export critical folder lists monthly.
- Do not expose upload signatures or API secrets to client code.

### GitHub

- Protect the main branch.
- Require review for production releases when the team grows.
- Tag stable launches.

## Incident Response

### Website Down

1. Check `/api/health`.
2. Check Vercel deployment status and function logs.
3. Roll back to the last good Vercel production deployment if the latest release is faulty.
4. Verify `/`, `/tracking`, `/quote`, `/customer/login`, and `/dashboard/admin`.

### Supabase Degraded

1. Check Supabase project status.
2. Confirm `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
3. Switch customer messaging to manual support updates if tracking lookups are unavailable.
4. Restore from backup only after confirming data corruption or irreversible schema damage.

### Payment Incident

1. Disable affected provider in the admin UI or Vercel env if needed.
2. Reconcile payment references in Flutterwave and submitted blockchain transactions.
3. Do not mark shipments paid manually without payment evidence.
4. Record every manual adjustment in audit logs.

### Carrier Sync Incident

1. Keep local Fly Logistics shipment active.
2. Use admin carrier retry if available.
3. If provider created an external order but callback failed, save the carrier reference in admin-only fields and refresh status.
4. Customers must continue tracking with Fly Logistics tracking numbers only.

### Notification Incident

1. Check notification provider health in admin.
2. Use in-app notifications as the fallback.
3. Re-send failed messages from the admin notification center after provider recovery.
4. Never include carrier names or carrier tracking IDs in customer messages.

## Secret Rotation

Rotate secrets after staff offboarding, suspected exposure, failed audits, or provider compromise:

- Supabase service role key.
- Flutterwave secret keys and approved crypto transaction hashes.
- FEZ, Sendbox, WhatsApp, Termii, Resend, and Google credentials.
- Cron and webhook secrets.

After rotation:

1. Update Vercel production env.
2. Redeploy.
3. Test `/api/health`, payments, webhooks, notifications, and carrier sync.
