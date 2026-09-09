# Fly Logistics Security Checklist

Use this before public launch and before every production promotion.

## Secrets

- Keep `SUPABASE_SERVICE_ROLE_KEY`, `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_ENCRYPTION_KEY`, `FLUTTERWAVE_WEBHOOK_SECRET_HASH`, `CLOUDINARY_API_SECRET`, `REDIS_URL`, `GROQ_API_KEY`, carrier API keys, `FEZ_WEBHOOK_SECRET`, `CARRIER_WEBHOOK_SECRET`, WhatsApp/Twilio tokens, and `RESEND_API_KEY` server-side only.
- Never add private keys to `NEXT_PUBLIC_` variables.
- Run `npm run security:scan` before every deployment.
- Rotate keys after staff offboarding, accidental exposure, failed audits, or suspicious logs.
- Keep `FLY_AUTH_DEBUG` unset in production. Enable it only during a short auth incident investigation, then disable it again.

## Authentication

- Admin accounts are not publicly self-registered.
- Admins sign in through `/admin/login`; customers through `/customer/login`; drivers through `/driver/login`; dispatchers through `/dispatcher/login`.
- Role checks must read `public.user_profiles.role` fresh from the authenticated user id.
- Cookie-authenticated write requests must pass same-origin checks; normal dashboard requests should send bearer tokens.
- Supabase Auth redirect URLs must include the production domain and account-specific login paths.
- Supabase Auth email templates must use Fly Logistics branding. See `docs/supabase-auth-email-branding.md`.

## Authorization And RLS

- Admin APIs must use `requireRole(request, ["admin"])` or a deliberate internal role list.
- Customer APIs must use the authenticated user id/email and never trust user-submitted customer email for ownership.
- Drivers can update only their own driver profile, location, KYC, and assigned shipments.
- Public tracking should return only customer-safe shipment details and never expose proof-of-delivery images.
- Public maps should not show private customer records or offline rider details beyond approved public-safe fields.
- Re-run `supabase-schema.sql` after schema changes to refresh RLS policies and indexes.

## Payments

- Flutterwave checkout must use Fly Logistics references: `FLY-WALLET-`, `FLY-QUOTE-`, and `FLY-SHIPMENT-`.
- Payment records are marked paid only after server-side verification.
- Flutterwave webhooks must verify `FLUTTERWAVE_WEBHOOK_SECRET_HASH`.
- Wallet debits must be atomic through `apply_customer_wallet_transaction` or the server fallback.
- Admin wallet carrier debits require a funded wallet for `FLY_ADMIN_WALLET_USER_ID` or the first admin profile.

## Carrier Fulfilment

- FEZ, Sendbox, and future carrier keys stay server-side.
- Customer-facing tracking must always use Fly Logistics tracking ID first.
- Carrier webhook events must be logged to `operational_events`.
- FEZ webhook requests must include `FEZ_WEBHOOK_SECRET` or `CARRIER_WEBHOOK_SECRET` through an approved header, bearer token, query token, or HMAC signature. If FEZ cannot send headers, register the webhook URL with a secret query token.
- Carrier failures must not break public tracking or customer payment success pages.

## API Protection

- Validate all request bodies with Zod.
- Reject oversized JSON payloads before parsing.
- Rate-limit public APIs: quote submission, tracking lookup, AI chat, login/session routes, wallet funding, and support tickets.
- Reject suspicious quote form submissions using honeypot and minimum-submit-time checks.
- Return safe user-facing errors; never return raw secrets or provider tokens.

## Browser And Headers

- Keep `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and HTTPS HSTS active in production.
- Keep `Cross-Origin-Resource-Policy`, `Cross-Origin-Opener-Policy`, `Origin-Agent-Cluster`, and `X-Permitted-Cross-Domain-Policies` active unless a specific third-party integration requires a reviewed exception.
- Avoid adding broad third-party script permissions.
- Keep analytics IDs public-only and provider secrets server-side.
- Keep `typescript.ignoreBuildErrors` disabled so production builds fail on unsafe TypeScript regressions.

## Monitoring

- Review `/dashboard/admin` operational events daily during launch.
- Investigate repeated auth failures, payment verification failures, carrier webhook failures, and rate-limit spikes.
- Admin notifications are written to dashboard events and emailed when `RESEND_API_KEY` is configured.

## Backups

- Enable Supabase automated backups and point-in-time recovery.
- Run `npm run backup:db:schema` before schema updates.
- Store backup exports in an encrypted vault, never in Git.
- Keep Cloudinary asset backups or exports for proof and shipment media.
