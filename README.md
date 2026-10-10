# Fly Logistics

Fly Logistics is a production-oriented Next.js 15 platform scaffold for a futuristic AI-powered logistics operating system.

## What is included

- Next.js App Router, React 19, TypeScript, Tailwind CSS v4
- Framer Motion, GSAP, and Three.js hero interactions
- shadcn-style reusable UI primitives
- Light/dark/system theme support with persistence
- Public pages, auth pages, tracking, instant quote, blog, and four role dashboards
- Protected customer portal for quote requests, shipments, payment status, timelines, and delivery confirmation status. Private delivery proof remains restricted to authorized operations users.
- Separate access flows for admin, customer, driver/rider, and dispatcher accounts
- API route architecture for quotes, tracking, OpenAI assistant, Auth.js, and webhooks
- Groq AI chat endpoint and premium chat UI
- Supabase-powered live driver map with realtime updates
- Leaflet/OpenStreetMap operations map with driver status cards
- Cloudinary signed image uploads for driver photos, package photos, proof-of-delivery photos, and future company media
- Flutterwave hosted checkout for booking payments with server-side verification
- WhatsApp Cloud API/Twilio notification workflows with Supabase message logs
- Growth engine foundation for lead capture, CRM contacts, referrals, loyalty rewards, testimonials, campaign tracking, and admin sales intelligence
- Prisma PostgreSQL schema for users, shipments, drivers, routes, vehicles, invoices, notifications, warehouses, analytics, AI logs, support tickets, proof of delivery, and audit logs
- Redis-backed rate limiting with graceful local fallback
- Structured monitoring helpers, admin audit logs, and operational event logs
- SEO metadata, sitemap, robots, Open Graph image, manifest, logo, favicon, and Vercel config

## Getting started

```bash
npm install
cp .env.example .env.local
npm run db:generate
npm run dev
```

Set `DATABASE_URL`, `AUTH_SECRET`, `GROQ_API_KEY`, `REDIS_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, Cloudinary credentials, and Flutterwave credentials before production deployment.

Meta campaign measurement uses browser and server events with shared IDs for deduplication:

```bash
NEXT_PUBLIC_META_PIXEL_ID=2062991460969957
META_PIXEL_ID=2062991460969957
META_CONVERSIONS_API_ACCESS_TOKEN=
META_CONVERSIONS_API_TEST_EVENT_CODE=
```

Keep the Conversions API token server-side. The optional test event code is only for Meta Events Manager validation and should be removed after testing. Fly Logistics excludes private dashboard pages and strips tracking numbers, addresses, carrier details, query strings, and payment credentials from Meta events.

Cloudinary uploads require:

```bash
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
NEXT_PUBLIC_CLOUDINARY_API_KEY=
```

Flutterwave payments require:

```bash
FLUTTERWAVE_PUBLIC_KEY=
FLUTTERWAVE_SECRET_KEY=
FLUTTERWAVE_ENCRYPTION_KEY=
FLUTTERWAVE_SUBACCOUNT_ID=
```

Crypto checkout supports USDT on TRC20, BEP20, and Solana plus BTC. Exchange rates and the 2% processing margin are calculated on the server and stored with each request. Customers submit a transaction hash, but only an authorized admin or finance user can approve the payment and trigger wallet credit or shipment creation.

Admin notifications and carrier fee debits use:

```bash
ADMIN_NOTIFICATION_EMAIL=vincenttheoikechukwu@gmail.com
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
RESEND_INBOUND_EMAIL="Fly Logistics Support <support@flylogistics.com.ng>"
EMAIL_FROM="Fly Logistics <notifications@flylogistics.com.ng>"
EMAIL_REPLY_TO=support@flylogistics.com.ng
RESEND_FROM_EMAIL="Fly Logistics <notifications@flylogistics.com.ng>"
RESEND_USE_CUSTOM_DOMAIN=true
FLY_ADMIN_WALLET_USER_ID=
```

If `RESEND_API_KEY` is omitted, admin notifications still appear in `/dashboard/admin` operational events. Use a verified Resend sender on `flylogistics.com.ng` before launch; production code will not silently fall back to a Resend test sender. `FLY_ADMIN_WALLET_USER_ID` should point to the admin account wallet to debit FEZ carrier fulfilment fees automatically; if omitted, Fly Logistics uses the first admin profile it can find.

Resend delivery and inbound events use `POST https://flylogistics.com.ng/api/webhooks/resend`. Configure the Resend webhook signing secret as `RESEND_WEBHOOK_SECRET` and subscribe to sent, delivered, bounced, complained, failed, and received email events. For inbound replies, verify a Resend receiving domain and set `RESEND_INBOUND_EMAIL` to its mailbox; received messages are stored as protected Fly Logistics support tickets.

Carrier fulfilment and webhooks require server-only secrets:

```bash
CARRIER_WEBHOOK_SECRET=
SENDBOX_ENVIRONMENT=staging # staging or production
SENDBOX_API_KEY=
SENDBOX_API_BASE_URL=
FEZ_ENVIRONMENT=staging # staging or production
FEZ_API_BASE_URL=https://api.fezdelivery.co/v1
FEZ_SECRET_KEY=
FEZ_AUTH_TOKEN=
FEZ_USER_ID=
FEZ_PASSWORD=
FEZ_WEBHOOK_SECRET=
EASYSHIP_API_KEY=
EASYSHIP_API_BASE_URL=
```

Use staging credentials for development and test deployments:

```bash
SENDBOX_ENVIRONMENT=staging
SENDBOX_API_KEY=your_sendbox_staging_key
SENDBOX_API_BASE_URL=https://sandbox.staging.sendbox.co
FEZ_ENVIRONMENT=staging
FEZ_API_BASE_URL=https://apisandbox.fezdelivery.co/v1
FEZ_SECRET_KEY=your_fez_staging_secret_key
FEZ_AUTH_TOKEN=your_fez_auth_token_if_available
FEZ_USER_ID=your_fez_user_id_if_no_static_token
FEZ_PASSWORD=your_fez_password_if_no_static_token
FEZ_WEBHOOK_SECRET=your_fez_webhook_secret
```

Use production credentials only in Vercel production:

```bash
SENDBOX_ENVIRONMENT=production
SENDBOX_API_KEY=your_sendbox_production_key
SENDBOX_API_BASE_URL=https://live.sendbox.co
FEZ_ENVIRONMENT=production
FEZ_API_BASE_URL=https://api.fezdelivery.co/v1
FEZ_SECRET_KEY=your_fez_production_secret_key
FEZ_AUTH_TOKEN=your_fez_auth_token_if_available
FEZ_USER_ID=your_fez_user_id_if_no_static_token
FEZ_PASSWORD=your_fez_password_if_no_static_token
FEZ_WEBHOOK_SECRET=your_fez_webhook_secret
```

If `SENDBOX_ENVIRONMENT` is omitted, Fly Logistics resolves Sendbox as `staging` when `NODE_ENV=development` and `production` when `NODE_ENV=production`. The Sendbox API key and base URL always come from environment variables; the app does not hardcode carrier credentials or Sendbox API hosts.

FEZ Logistics works the same way: set `FEZ_ENVIRONMENT=staging` for sandbox testing and `FEZ_ENVIRONMENT=production` for live fulfilment. Obtain the FEZ Business secret key from FEZ, then store `FEZ_SECRET_KEY`, `FEZ_USER_ID`, `FEZ_PASSWORD`, `FEZ_API_BASE_URL`, and `FEZ_WEBHOOK_SECRET` in Vercel as server-only variables. Fly Logistics authenticates with `FEZ_USER_ID` + `FEZ_PASSWORD` and sends the returned bearer token with the `secret-key` header. `FEZ_AUTH_TOKEN` is optional for emergency override/debugging only. If `FEZ_API_BASE_URL` is set to `https://api.fezdelivery.co`, the app uses the documented `/v1` API automatically. FEZ is an optional fulfilment partner; customer pages continue to show Fly Logistics tracking and branding.

Configure Sendbox shipment/tracking webhooks to call:

```text
https://flylogistics.com.ng/api/webhooks/sendbox
```

The Sendbox webhook accepts either a shared secret in `Authorization: Bearer <CARRIER_WEBHOOK_SECRET>`, `x-fly-webhook-secret`, `x-webhook-secret`, `x-sendbox-webhook-secret`, or an HMAC SHA-256 body signature in `x-sendbox-signature`.

Configure FEZ order webhooks to call:

```text
https://flylogistics.com.ng/api/webhooks/fez?secret=<FEZ_WEBHOOK_SECRET>
```

Register the FEZ webhook by calling FEZ:

```http
POST /webhooks/store
secret-key: <FEZ_SECRET_KEY>
Authorization: Bearer <FEZ_AUTH_TOKEN> # or the app-generated token from FEZ_USER_ID/FEZ_PASSWORD

{ "webhook": "https://flylogistics.com.ng/api/webhooks/fez?secret=<FEZ_WEBHOOK_SECRET>" }
```

Fly Logistics also includes an admin-only helper route that performs the same registration server-side:

```text
POST /api/admin/carriers/fez/register-webhook
```

The official FEZ webhook body received by Fly Logistics is:

```json
{
  "orderNumber": "FEZ_ORDER_NUMBER",
  "status": "In Transit"
}
```

The webhook matches FEZ shipments by `carrier_provider = 'fez_logistics'` and FEZ order fields such as `carrier_order_id`, `carrier_order_no`, or `carrier_tracking_id`, then maps the FEZ status into the Fly Logistics shipment timeline and status. Customer-facing tracking always uses the Fly Logistics tracking number.

WhatsApp production notifications can run in three modes:

```bash
WHATSAPP_PROVIDER=whatsapp_cloud_api # link, whatsapp_cloud_api, or twilio
WHATSAPP_CLOUD_API_VERSION=v20.0
WHATSAPP_API_VERSION=
WHATSAPP_CLOUD_PHONE_NUMBER_ID=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_CLOUD_ACCESS_TOKEN=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
META_APP_ID=1191025623149680
META_APP_SECRET=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

Termii SMS is used for payment confirmation fallback, OTP fallback architecture, critical shipment alerts, and delivery failure alerts:

```bash
TERMII_API_KEY=
TERMII_SENDER_ID=FlyLogistics
TERMII_BASE_URL=https://api.ng.termii.com/api
```

All Resend, WhatsApp Cloud, and Termii credentials are server-side only. Do not use `NEXT_PUBLIC_` for these values. `TERMII_SENDER_ID` must match a sender ID approved for the Termii application. The app accepts Termii base URLs with or without `/api`, such as `https://v3.api.termii.com` or `https://api.ng.termii.com/api`. Admins can view provider setup status, failed message logs, resend controls, broadcasts, and service alerts from `/dashboard/admin` in the notification center. Customer profiles support Email only, WhatsApp only, Email + WhatsApp, or In-app only preferences.

Meta WhatsApp Cloud API webhook setup:

1. Set `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in Vercel Production to a long random value. Do not prefix it with `NEXT_PUBLIC_`.
2. In Meta Developers, set the callback URL to `https://flylogistics.com.ng/api/webhooks/whatsapp`.
3. Paste the same verify token into Meta's webhook verification field.
4. Set `WHATSAPP_APP_SECRET` or `META_APP_SECRET` so POST webhooks are verified with Meta `X-Hub-Signature-256`.
5. Subscribe the WhatsApp app to message-related fields. Fly Logistics accepts Meta `GET` verification requests, stores inbound conversations, and updates delivery/read/failure receipts.
6. Admins can manage the protected WhatsApp inbox from `/dashboard/admin#admin-whatsapp` or `/admin/whatsapp`.
7. Keep `WHATSAPP_CLOUD_ACCESS_TOKEN`, app secrets, and webhook tokens server-side only.

Full setup guide:

```text
docs/WHATSAPP_SETUP.md
```

Marketing analytics and conversion tracking use public browser IDs only:

```bash
NEXT_PUBLIC_GA_MEASUREMENT_ID=
NEXT_PUBLIC_META_PIXEL_ID=
```

Google Business Profile syncing, reviews, posts, media, and campaign sending use server-only configuration:

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://flylogistics.com.ng/api/integrations/google-business/callback
GOOGLE_BUSINESS_PROFILE_ACCOUNT_NAME=accounts/...
GOOGLE_BUSINESS_PROFILE_LOCATION_NAME=locations/...
GOOGLE_BUSINESS_PROFILE_REFRESH_TOKEN=
GOOGLE_BUSINESS_PROFILE_URL=
```

Do not configure a permanent Google access token. Google access tokens expire, so Fly Logistics uses the refresh token server-side to mint short-lived access tokens only when an admin syncs data. Admins can connect from `/dashboard/admin#admin-google-business`; the OAuth route requests `https://www.googleapis.com/auth/business.manage` with offline access. The admin Google Business panel can sync business information, list reviews, reply/delete replies, create posts, upload/list media, and save the selected Google account/location without exposing tokens to customers.

The admin Growth tab reads leads, quote demand, paid conversions, merchant onboarding, referrals, loyalty rewards, testimonials, campaign events, email campaign sends, affiliate payouts, and Google Business Profile sync status. Public lead capture should post to `/api/growth/leads`; the route stores data server-side and notifies admin without exposing database keys. Campaign sends use Resend and are capped by the server route so admins can send controlled customer, merchant, lead, or all-audience campaigns.

Add a `photo_url` text column to the Supabase `drivers` table so uploaded driver profile images can be stored:

```sql
alter table public.drivers add column if not exists photo_url text;
```

For the full product flow, run [supabase-schema.sql](./supabase-schema.sql) in Supabase SQL editor. It creates:

- `drivers`
- `quote_requests`
- `shipments`
- `shipment_events`
- `user_profiles`
- `audit_logs`
- `operational_events`
- `notification_messages`
- `customer_notifications`
- `growth_leads`
- `crm_contacts`
- `referral_rewards`
- `loyalty_rewards`
- `customer_testimonials`
- `campaign_events`
- `email_campaigns`
- `email_campaign_sends`
- `affiliate_payouts`
- `support_chat_messages`
- `google_business_profile_settings`
- `google_business_profile_reviews`
- `google_business_profile_posts`
- `google_business_profile_media`
- `google_business_profile_syncs`
- `route_eta_snapshots`

The app uses server routes with `SUPABASE_SERVICE_ROLE_KEY` for shipment creation, quote storage, status updates, and proof-of-delivery writes.

## Fly Logistics Cloud SaaS layer

Public SaaS pages:

- `/cloud`
- `/cloud/pricing`
- `/cloud/features`
- `/cloud/demo`

Private company workspace pages:

- `/cloud/dashboard`
- `/cloud/shipments`
- `/cloud/drivers`
- `/cloud/customers`
- `/cloud/analytics`
- `/cloud/billing`
- `/cloud/settings`

### Tenant branding and public contact controls

Fly Logistics Cloud resolves the authenticated company on the server before the
workspace is rendered. The company name, logo, primary color, and contrast-aware
foreground variables are therefore present on the first response rather than
being applied after a client request.

- Owners and company admins can manage branding from `/cloud/settings`.
- Logo uploads accept PNG, JPEG, and WebP files up to 5 MB. File signatures are
  verified server-side before upload, and assets are stored under the company's
  isolated Cloudinary folder.
- Replacing a logo is rollback-safe: the existing logo remains active until the
  new upload and company update both succeed.
- Public address, phone, WhatsApp, and support email are optional. They are shown
  on tenant tracking only when the company enables the public-contact setting.
- Tenant tracking resolves the company from the shipment record and only returns
  the public-safe company projection. Owner, billing, team, carrier, and private
  shipment data are not exposed.
- Custom-domain and advanced branding capabilities are defined centrally in
  `src/lib/cloud-plans.ts`; existing plan prices and limits are unchanged.

Apply the focused additive migration before deploying these controls:

```text
supabase/migrations/20261004_cloud_white_label_contacts.sql
```

The migration is idempotent, enables RLS for the company branding fields, and
adds the tenant indexes used by company membership and shipment views.

New company signups start with `subscription_status = 'trialing'` and a 14-day `trial_ends_at`. Billing uses Flutterwave hosted checkout through server routes only. Configure optional Flutterwave recurring plan IDs in Vercel if you create matching payment plans in Flutterwave:

```bash
FLUTTERWAVE_CLOUD_STARTER_PLAN_ID=
FLUTTERWAVE_CLOUD_GROWTH_PLAN_ID=
FLUTTERWAVE_CLOUD_SCALE_PLAN_ID=
```

The focused SQL migration for this layer is [docs/cloud-commercial-saas.sql](./docs/cloud-commercial-saas.sql). It adds company subscription fields, creates `cloud_demo_requests`, enables RLS, and adds safe policies. The same updates are also reflected in `supabase-schema.sql`.

Useful production maintenance commands:

```bash
npm run security:scan
npm run backup:db:schema
npm run backup:db
```

`backup:db` uses `pg_dump` and `DATABASE_URL`. Run it from a secure machine only; the generated `backups/` directory should stay out of Git.

## Production security and stability

- Full operations checklist: [docs/production-operations.md](./docs/production-operations.md)
- Security launch checklist: [docs/security-checklist.md](./docs/security-checklist.md)
- Supabase Auth email branding guide: [docs/supabase-auth-email-branding.md](./docs/supabase-auth-email-branding.md)
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDINARY_API_SECRET`, `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_ENCRYPTION_KEY`, WhatsApp/Twilio tokens, `WEBHOOK_SECRET`, `CARRIER_WEBHOOK_SECRET`, and `FEZ_WEBHOOK_SECRET` server-only in Vercel. Never prefix these with `NEXT_PUBLIC_`.
- Public browser variables should be limited to `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_API_KEY`, and public contact/map keys.
- Run `supabase-schema.sql` after deployment updates. It includes indexes, RLS policies, realtime publication setup, `shipment_events`, `audit_logs`, `operational_events`, and `notification_messages`.
- Run the latest `supabase-schema.sql` before using the Growth tab. The growth tables are RLS-enabled and admin/staff readable through server routes.
- Enable Supabase point-in-time recovery or scheduled daily backups before taking production bookings. Export a weekly schema snapshot and keep it with deployment notes.
- Review Supabase Auth redirect URLs and include the Vercel production origin plus `/login`.
- Public account creation is limited to customers and drivers/riders. Admin and dispatcher roles should be assigned from Supabase `user_profiles`, then users can sign in through `/admin/login` or `/dispatcher/login`.
- Configure Redis in production. Public APIs use Redis-backed rate limits and fail open only if Redis is unavailable.
- Use `npm run security:scan` before releases to catch accidental private env references in client-facing files.
- Set `FLUTTERWAVE_SUBACCOUNT_ID` to the Fly Logistics Flutterwave subaccount id so wallet funding, shipment payments, and future merchant payments route under Fly Logistics. Checkout references use `FLY-WALLET-`, `FLY-QUOTE-`, and `FLY-SHIPMENT-` style prefixes.
- Set `ADMIN_NOTIFICATION_EMAIL`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` to email operations when customers create orders, pay, fund wallets, or open support tickets.
- Set `FLY_ADMIN_WALLET_USER_ID` to the admin wallet owner if FEZ fulfilment fees should debit a specific admin wallet. Otherwise the app attempts to use the first `user_profiles.role = 'admin'` profile.
- Set `FLUTTERWAVE_WEBHOOK_SECRET_HASH` and configure Flutterwave webhooks to call `/api/webhooks/flutterwave`. Payment status is still verified server-side before records are marked paid.
- Set `CARRIER_WEBHOOK_SECRET` and configure Sendbox shipment/tracking updates to call `/api/webhooks/sendbox`. Sendbox updates are logged in `operational_events` and update matching shipments by Fly tracking ID, Sendbox shipment ID, or Sendbox tracking ID.
- Set `SENDBOX_ENVIRONMENT`, `SENDBOX_API_KEY`, and `SENDBOX_API_BASE_URL` per Vercel environment. Admins can view the current Sendbox environment and API health from `/dashboard/admin`.
- Set `FEZ_ENVIRONMENT`, `FEZ_SECRET_KEY`, `FEZ_USER_ID`, `FEZ_PASSWORD`, `FEZ_API_BASE_URL`, and `FEZ_WEBHOOK_SECRET` per Vercel environment. FEZ updates are logged in `operational_events` and update matching shipments by FEZ order ID while customers keep using the Fly Logistics tracking number.
- For WhatsApp production sends, set `WHATSAPP_PROVIDER` to `whatsapp_cloud_api`, `WHATSAPP_CLOUD_PHONE_NUMBER_ID`, `WHATSAPP_CLOUD_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, and optionally `WHATSAPP_BUSINESS_ACCOUNT_ID`. Configure Meta webhook verification at `https://flylogistics.com.ng/api/webhooks/whatsapp`. The fallback `link` mode logs the message and returns a WhatsApp URL without sending through a provider.
- For SMS production sends, set `TERMII_API_KEY`, `TERMII_SENDER_ID`, and `TERMII_BASE_URL`. If Termii is not configured, the app logs `NOT_CONFIGURED` and keeps the customer flow running.
- Rotate API keys after any accidental log exposure, failed secret audit, or team member offboarding.
- Keep Next.js, React, Supabase, and payment SDK dependencies patched. Re-run `npm run build` before every Vercel production promotion.

## Supabase operations backup notes

- Daily: confirm automated backups are enabled and verify the most recent backup timestamp in Supabase.
- Weekly: export schema, review RLS policies, and spot-check `quote_requests`, `shipments`, `shipment_events`, `drivers`, `user_profiles`, `audit_logs`, and `operational_events`.
- Local export helper: set `DATABASE_URL` to the production Supabase connection string on a secure machine, then run `npm run backup:db:schema` or `npm run backup:db`.
- Before large migrations: create a manual Supabase backup, run SQL in a staging project first, and save the migration output.
- Recovery drill: restore into a temporary Supabase project quarterly and point a Vercel preview deployment at it using preview-only environment variables.

## Production notes

Scheduled editorial publishing keeps the ten launch guides available, publishes three validated database-backed articles per day from July 6 through July 19, 2026, then switches to one article per day from July 20. The secured Vercel cron route is `/api/cron/blog`. Configure `CRON_SECRET`, `GROQ_API_KEY`, `BLOG_GROQ_MODEL`, `BLOG_HIGH_FREQUENCY_START_DATE`, `BLOG_DAILY_SWITCH_DATE`, and `BLOG_PUBLISH_TIMEZONE`; see `docs/production-operations.md` for quality gates and recovery steps.

- Use Postgres with Prisma migrations for data durability.
- Use Redis for rate limiting, live events, notification fanout, and WebSocket presence.
- Keep authorization checks in server actions and route handlers; the proxy only adds request hardening.
- Use Cloudinary signed uploads for proof-of-delivery images and shipment documents.
- Use Flutterwave hosted checkout links and verify transactions on the server before marking quotes or shipments paid.
- Use Supabase realtime for driver presence, map markers, and dispatch updates.
- Keep OpenStreetMap tile attribution visible when extending the Leaflet map.
