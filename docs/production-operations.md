# Fly Logistics Production Operations Checklist

This checklist is for running Fly Logistics as a real production freight platform on Vercel, Supabase, Cloudinary, Redis, Flutterwave, and GitHub.

## Monitoring and Logging

- Review Vercel Function logs for structured JSON events with `category` values: `api`, `auth`, `payment`, `shipment_workflow`, and `operational_event`.
- Review `/dashboard/admin` operational event logs for quote intake, payment verification, dispatch, proof upload, notification, and shipment workflow events.
- Review `/dashboard/admin` notification center logs for WhatsApp Cloud API, Termii SMS, provider status, failed sends, and fallback link-mode messages.
- Review `/dashboard/admin#admin-growth` for lead sources, paid conversions, merchant onboarding, campaign events, referrals, loyalty rewards, and testimonial status.
- Investigate repeated `auth` failures by IP, email, and path.
- Investigate `payment` errors before manually changing payment status.
- Investigate `shipment_workflow` errors before customer-facing escalation.
- Use `/dashboard/admin` audit logs to review admin shipment, dispatch, proof, profile, and notification actions.
- Alert manually on repeated `severity=error` events, failed payment webhook processing, and repeated rate-limit warnings from the same IP.

## Backups

### Supabase Database

- Enable automated backups and point-in-time recovery for the production Supabase project.
- Before schema changes, create a manual backup and run `supabase-schema.sql` in staging first.
- Weekly: export schema and verify core tables: `quote_requests`, `shipments`, `shipment_events`, `drivers`, `user_profiles`, and `audit_logs`.
- Helper: run `npm run backup:db:schema` for a schema-only export or `npm run backup:db` for a full SQL export from a secure machine with `DATABASE_URL` and `pg_dump`.
- Store exported SQL in an encrypted company vault or backup bucket. Do not commit backup files to GitHub.
- Quarterly: restore into a temporary Supabase project and point a Vercel preview deployment at it.

### Vercel Environment Variables

- Keep a secure offline inventory of variable names, owners, and rotation dates.
- Never store raw secret values in GitHub, README files, screenshots, or support tickets.
- Export environment variable names and scopes from Vercel after each release, but store secret values only in an approved password manager.
- Required server-only secrets include `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDINARY_API_SECRET`, `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_ENCRYPTION_KEY`, `FLUTTERWAVE_SUBACCOUNT_ID`, `FLUTTERWAVE_WEBHOOK_SECRET_HASH`, WhatsApp Cloud API tokens, Termii SMS API keys, carrier API keys, `WEBHOOK_SECRET`, `CARRIER_WEBHOOK_SECRET`, `FEZ_WEBHOOK_SECRET`, and `RESEND_API_KEY`.
- Admin notification email variables:
  - `ADMIN_NOTIFICATION_EMAIL=vincenttheoikechukwu@gmail.com`
  - `RESEND_API_KEY`
  - `EMAIL_FROM="Fly Logistics <notifications@flylogistics.com.ng>"`
  - `EMAIL_REPLY_TO=support@flylogistics.com.ng`
  - `RESEND_FROM_EMAIL="Fly Logistics <notifications@flylogistics.com.ng>"`
  - `RESEND_USE_CUSTOM_DOMAIN=true` after the sender domain is verified in Resend.
- Production email must use a verified `flylogistics.com.ng` sender. The Resend test sender is only a local development fallback.
- If `RESEND_API_KEY` is missing, admin notifications still write to `operational_events`, but email delivery is skipped.
- `FLY_ADMIN_WALLET_USER_ID` should point to the admin wallet owner used for automatic FEZ carrier-fee debits. If it is omitted, Fly Logistics attempts to use the first admin profile.
- `FLUTTERWAVE_SUBACCOUNT_ID` should be the Fly Logistics subaccount under the parent Flutterwave account. Customer checkout labels must remain Fly Logistics branded; do not expose parent account names in customer UI.
- Crypto payment requests use fixed Fly Logistics deposit addresses and server-side exchange-rate snapshots. Operations must verify each submitted blockchain hash before approval.
- WhatsApp provider modes:
  - `WHATSAPP_PROVIDER=whatsapp_cloud_api` requires `WHATSAPP_CLOUD_PHONE_NUMBER_ID` and `WHATSAPP_CLOUD_ACCESS_TOKEN`. The shorter aliases `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` are also accepted.
  - `WHATSAPP_BUSINESS_ACCOUNT_ID` is optional for diagnostics and future template management.
  - `WHATSAPP_WEBHOOK_VERIFY_TOKEN` is required for Meta webhook verification at `https://flylogistics.com.ng/api/webhooks/whatsapp`.
  - `WHATSAPP_APP_SECRET` or `META_APP_SECRET` is required to enforce Meta `X-Hub-Signature-256` signature validation on POST webhook events.
  - `WHATSAPP_PROVIDER=twilio` requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_WHATSAPP_FROM`.
  - `WHATSAPP_PROVIDER=link` logs the message and creates a WhatsApp URL without direct provider sending.
- Meta WhatsApp Cloud API webhook setup:
  - Callback URL: `https://flylogistics.com.ng/api/webhooks/whatsapp`
  - Verify token: the exact value of `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
  - Subscribe to message events. Fly Logistics accepts Meta `GET` verification, verifies signed POST events when the app secret is configured, stores inbound WhatsApp conversations, and updates delivery receipts.
- Admin WhatsApp inbox:
  - `/dashboard/admin#admin-whatsapp`
  - `/admin/whatsapp`
  - Allowed roles: admin, customer care, moderator, and dispatcher.
- See `docs/WHATSAPP_SETUP.md` for the full production setup, template checklist, and safe test plan.
- Termii SMS fallback variables:
  - `TERMII_API_KEY`
  - `TERMII_SENDER_ID=FlyLogistics`
  - `TERMII_BASE_URL=https://api.ng.termii.com/api`
- `TERMII_SENDER_ID` must be approved and attached to the Termii application. If Termii returns `ApplicationSenderId not found`, register/approve that sender in the Termii dashboard or set the env var to an already approved sender ID.
- Termii base URLs may be configured with or without `/api`; the provider normalizes both formats before calling `/sms/send`.
- Termii is used for OTP fallback architecture, payment confirmation fallback, critical shipment alerts, and delivery failure alerts. If Termii is missing, customer-facing flows continue and admin logs show `NOT_CONFIGURED`.
- Customer profiles include Email, WhatsApp, and SMS fallback notification preference toggles. Customers can choose Email only, WhatsApp only, Email + WhatsApp, or In-app only. Preferences default to enabled and are stored in `user_profiles`.
- Notification attempts are stored in `notification_messages` with `channel`, `provider`, `recipient`, `message_body`, `status`, `external_message_id`, `error_message`, `metadata`, `created_at`, `sent_at`, `delivered_at`, and `read_at`.
- WhatsApp inbound support is stored in `whatsapp_contacts`, `whatsapp_conversations`, `whatsapp_messages`, and `whatsapp_events`. These tables are RLS-enabled, anonymous access is revoked, and customer-facing messages remain Fly Logistics branded.
- Customer dashboard notifications are stored in `customer_notifications`; read state is mirrored to `notification_messages` for admin lifecycle visibility.
- Admins can send broadcasts and service alerts from `/dashboard/admin` notification center. Broadcasts support in-app, email, and WhatsApp channels and write audit + operational logs.
- Marketing analytics variables are public IDs only: `NEXT_PUBLIC_GA_MEASUREMENT_ID` and `NEXT_PUBLIC_META_PIXEL_ID`. Do not place private ad account credentials in the browser bundle.
- Google Business Profile variables are server-side only: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_BUSINESS_PROFILE_ACCOUNT_NAME`, `GOOGLE_BUSINESS_PROFILE_LOCATION_NAME`, `GOOGLE_BUSINESS_PROFILE_REFRESH_TOKEN`, and `GOOGLE_BUSINESS_PROFILE_URL`. Do not configure or rely on a permanent Google access token because access tokens expire. Fly Logistics uses the refresh token server-side to generate short-lived access tokens for admin-only sync, reviews, replies, posts, and media.
- Google Business Profile OAuth callback URL: `https://flylogistics.com.ng/api/integrations/google-business/callback`. In Google Cloud, add this as an authorized redirect URI, enable the Business Profile APIs, and request the `https://www.googleapis.com/auth/business.manage` scope with offline access.
- Admins manage Google Business Profile from `/dashboard/admin#admin-google-business`. The page can connect/disconnect Google, list accounts/locations, sync business information, fetch reviews, reply/delete replies, create posts, and upload/manage media. Customers never receive Google tokens or admin Google data.
- Growth data is stored in `growth_leads`, `crm_contacts`, `referral_rewards`, `loyalty_rewards`, `customer_testimonials`, `campaign_events`, `email_campaigns`, `email_campaign_sends`, and `affiliate_payouts`. These tables are RLS-enabled and should be reviewed before running public campaigns.
- Live customer support chat uses `support_chat_messages` with Supabase realtime when available and dashboard polling as a fallback. Admin/moderator replies are sent from the admin support operations panel; customer replies stay inside `/customer`.
- Email campaign sends should start with small test audiences. Confirm `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, unsubscribe wording, and audience selection before sending large campaigns.
- Rotate production secrets after failed audits, staff offboarding, or suspected exposure.

### Carrier Webhooks

- Development and staging should use `SENDBOX_ENVIRONMENT=staging`, a staging Sendbox API key, and the staging Sendbox API base URL.
- Production should use `SENDBOX_ENVIRONMENT=production`, a production Sendbox API key, and the production Sendbox API base URL.
- If `SENDBOX_ENVIRONMENT` is omitted, Fly Logistics uses staging when `NODE_ENV=development` and production when `NODE_ENV=production`.
- Required Sendbox variables per Vercel environment:
  - `SENDBOX_ENVIRONMENT`
  - `SENDBOX_API_KEY`
  - `SENDBOX_API_BASE_URL`
  - `CARRIER_WEBHOOK_SECRET`
- Sendbox production webhook URL: `https://flylogistics.com.ng/api/webhooks/sendbox`.
- Store `CARRIER_WEBHOOK_SECRET` only in Vercel server-side environment variables.
- Prefer HMAC SHA-256 signatures in `x-sendbox-signature` when Sendbox supports signing. If Sendbox only supports a shared secret, send it as `Authorization: Bearer <secret>`, `x-fly-webhook-secret`, `x-webhook-secret`, or `x-sendbox-webhook-secret`.
- Supported Sendbox events include `shipment_created`, `shipment_picked_up`, `shipment_in_transit`, `shipment_delivered`, `shipment_cancelled`, and `tracking_updated`.
- Webhook processing logs every event to `operational_events`; matching shipments are updated by Fly tracking ID, Sendbox shipment ID, or Sendbox tracking ID.
- If a Sendbox webhook arrives without a matching shipment, keep the warning event for reconciliation before manually changing shipment status.
- Admin-only carrier diagnostics in `/dashboard/admin` show the current Sendbox environment, configuration status, API health, and latest carrier sync without exposing API keys.
- Development and staging should use `FEZ_ENVIRONMENT=staging`, a FEZ sandbox secret key, and the FEZ sandbox API base URL.
- Production should use `FEZ_ENVIRONMENT=production`, the production FEZ secret key, and the production FEZ API base URL.
- Obtain the FEZ secret key from FEZ Business, then store it only in Vercel server-side environment variables.
- Required FEZ variables per Vercel environment:
  - `FEZ_ENVIRONMENT`
  - `FEZ_SECRET_KEY`
  - `FEZ_API_BASE_URL`
  - `FEZ_WEBHOOK_SECRET`
- Optional FEZ bearer auth variables:
  - `FEZ_AUTH_TOKEN`
  - or `FEZ_USER_ID` + `FEZ_PASSWORD`
- Fly Logistics authenticates with `FEZ_USER_ID` + `FEZ_PASSWORD` and sends the returned bearer token with FEZ's documented `secret-key` request header. `FEZ_AUTH_TOKEN` is optional for emergency override/debugging only.
- FEZ production webhook URL: `https://flylogistics.com.ng/api/webhooks/fez?secret=<FEZ_WEBHOOK_SECRET>`.
- Production FEZ webhooks are rejected unless `FEZ_WEBHOOK_SECRET` or `CARRIER_WEBHOOK_SECRET` is configured and sent with the request. Accepted verification methods are `x-fez-webhook-secret`, `x-fly-webhook-secret`, `x-webhook-secret`, `Authorization: Bearer <secret>`, `?token=<secret>`, `?secret=<secret>`, or an HMAC SHA-256 signature header.
- If FEZ cannot send custom headers, register the webhook as `https://flylogistics.com.ng/api/webhooks/fez?secret=<FEZ_WEBHOOK_SECRET>`.
- Paid customer bookings automatically attempt FEZ fulfilment after the Fly Logistics shipment is created. If FEZ returns a carrier fee, the admin wallet is debited. If FEZ fails or is not configured, the shipment remains internally managed and an admin operational event is recorded.
- Register the FEZ webhook with `POST /webhooks/store`, body `{ "webhook": "https://flylogistics.com.ng/api/webhooks/fez?secret=<FEZ_WEBHOOK_SECRET>" }`, `secret-key: <FEZ_SECRET_KEY>`, and `Authorization: Bearer <FEZ_AUTH_TOKEN>` if FEZ provides one. If `FEZ_AUTH_TOKEN` is not supplied, Fly Logistics authenticates with `FEZ_USER_ID` + `FEZ_PASSWORD`.
- The admin-only helper `POST /api/admin/carriers/fez/register-webhook` performs the same registration server-side.
- The official incoming FEZ webhook body is `{ "orderNumber": "...", "status": "..." }`.
- Webhook processing logs every FEZ event to `operational_events`; matching shipments are updated where `carrier_provider = 'fez_logistics'` and `carrier_order_id`, `carrier_order_no`, or `carrier_tracking_id` matches `orderNumber`. Customers still track only with the Fly Logistics tracking number.
- Supported FEZ status mappings include confirmed/created, driver assigned, picked up, dispatched/in transit, arrived, delivered, and cancelled.
- Admin-only carrier diagnostics in `/dashboard/admin` show the FEZ environment, webhook-secret status, API health, and latest sync without exposing API keys.

### Cloudinary Assets

- Enable Cloudinary backups or scheduled exports for production folders:
  - `fly-logistics/drivers`
  - `fly-logistics/packages`
  - `fly-logistics/proof-of-delivery`
  - `fly-logistics/company-media`
- Keep proof-of-delivery retention aligned with business and legal requirements.
- Export asset metadata monthly so shipment records can be reconciled against Cloudinary media URLs.

### GitHub Code

- Protect the production branch with required CI checks.
- Tag production releases after successful Vercel deployments.
- Keep at least one mirrored remote or protected organization backup of the repository.
- Keep dependency updates reviewed and tested with `npm run typecheck`, `npm run lint`, and `npm run build`.

## Security Hardening

- Admin APIs must call `requireRole(request, ["admin"])` or stricter role checks.
- Public APIs must validate payloads with Zod and use Redis rate limiting.
- Public lead capture must use `/api/growth/leads`, not direct Supabase table access.
- Public quote request forms use a honeypot and minimum-submit-time check in addition to Redis throttling.
- Auth login and session routes are throttled and set `Cache-Control: no-store`.
- Middleware rejects `x-middleware-subrequest`, applies security headers, and clears invalid auth cookies.
- Service role usage must stay in server-only modules and route handlers.
- Browser code may only use public env vars prefixed with `NEXT_PUBLIC_`.
- Run `npm run security:scan` before production releases to check client-facing files for private env names.
- Run `supabase-schema.sql` after deployment to keep RLS policies, indexes, realtime tables, and audit logs current.

### Supabase RLS Access Model

- Public/anonymous users can only read approved, non-suspended driver map records directly. Shipment tracking and quote submission must go through rate-limited server APIs.
- Customers can read their own `quote_requests` and `shipments` by authenticated email, and can insert only quote requests tied to their own email.
- Drivers can read and update only shipments assigned to their linked `driver_id`; they cannot self-assign a driver profile through `user_profiles`.
- Dispatchers can read and manage operational shipment, quote, driver, notification, and shipment-event data.
- Admins have full operational access through `user_profiles.role = 'admin'`; admin accounts must be assigned inside Supabase, never self-registered.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and must remain server-side only in API routes, server helpers, and Vercel env vars.
- Middleware reads roles from `user_profiles` under RLS and never trusts editable user metadata for admin or dispatcher access.

## Performance

- Keep the map route dynamically loaded and avoid server-rendering Leaflet.
- Use `next/image` for uploaded proof, driver, and package images.
- Keep dashboard endpoints aggregated so client components fetch one compact payload per surface.
- Keep analytics queries bounded with limits and indexed columns.
- Keep growth dashboard queries bounded to recent rows and aggregate server-side before returning to the browser.

## Scheduled Blog Publishing

- The ten launch guides remain available as the initial editorial library.
- Database-backed publishing produces three validated articles per day from July 6 through July 19, 2026, then one article per day from July 20.
- Required production variables are `CRON_SECRET`, `GROQ_API_KEY`, `BLOG_GROQ_MODEL`, `BLOG_HIGH_FREQUENCY_START_DATE`, `BLOG_DAILY_SWITCH_DATE`, and `BLOG_PUBLISH_TIMEZONE`.
- Vercel calls `GET /api/cron/blog` with `Authorization: Bearer <CRON_SECRET>`; unauthenticated requests are rejected.
- Every generated article must pass schema validation, contain six distinct operational sections, six checklist items, three FAQs, avoid internal provider names, and render between 1,200 and 2,000 words before publication.
- `blog_posts.source_date`, `daily_sequence`, `slug`, and title checks prevent duplicate articles. Missed slots are retried by later runs without exceeding the active daily publishing quantity.
- Public visitors have read-only RLS access to rows where `status = 'published'` and `published_at <= now()`. Browser clients cannot insert, update, or delete blog content.
- Publication failures are written to `operational_events`; review those events and Vercel function logs before manually retrying a failed date.

## Core Business Workflows

1. Quote request to shipment: customer submits `/quote`; admin converts quote request into a shipment and tracking ID.
2. Shipment to driver assignment: admin or dispatcher assigns a driver manually or uses AI dispatch recommendations.
3. Status update to customer notification: status updates append timeline events and prepare WhatsApp/customer notification metadata.
4. Delivery proof upload to completion: proof upload saves Cloudinary media, marks the shipment delivered, appends timeline history, and records an audit event.
5. Payment confirmation to WhatsApp: Flutterwave verification logs payment state and sends a customer payment confirmation when a new successful payment is recorded.
6. Lead to customer or merchant: public lead capture writes `growth_leads`, admin reviews from the Growth tab, then converts qualified prospects into customer accounts, merchant accounts, or quote workflows.

## Release Checklist

- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm run build` passes.
- Supabase schema is applied in staging first.
- Vercel production env vars are present and scoped correctly.
- Flutterwave webhook URL points to `/api/webhooks/flutterwave`.
- Crypto payment approvals are restricted to admin and finance roles and recorded in audit logs.
- Sendbox webhook URL points to `/api/webhooks/sendbox` and `CARRIER_WEBHOOK_SECRET` is configured in Vercel.
- Sendbox staging and production credentials are separated with `SENDBOX_ENVIRONMENT`, `SENDBOX_API_KEY`, and `SENDBOX_API_BASE_URL` in the correct Vercel environment scope.
- FEZ webhook URL points to `/api/webhooks/fez?secret=<FEZ_WEBHOOK_SECRET>`, the webhook is registered through FEZ `POST /webhooks/store`, and FEZ staging/production credentials are separated with `FEZ_ENVIRONMENT`, `FEZ_SECRET_KEY`, `FEZ_API_BASE_URL`, and either `FEZ_AUTH_TOKEN` or `FEZ_USER_ID` + `FEZ_PASSWORD`.
- WhatsApp Cloud webhook URL points to `/api/webhooks/whatsapp`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` is configured in Vercel, `WHATSAPP_APP_SECRET` or `META_APP_SECRET` is configured for signed POST events, and Meta verification returns the plain `hub.challenge`.
- Redis is configured for production rate limiting.
- Cloudinary signed upload credentials are present only as server secrets.
- Supabase Auth emails are branded with Fly Logistics logo, orange/black colors, and account-specific redirect URLs.
- Admin notification email variables are configured if launch operations require inbox alerts.
- Google Analytics, Meta Pixel, Meta Conversions API, Google Business Profile OAuth, and growth schema tables are configured before public campaigns.

### Meta Pixel and Conversions API

- Public browser tracking uses `NEXT_PUBLIC_META_PIXEL_ID`. Fly Logistics currently uses Pixel ID `2062991460969957`.
- Server-side conversion delivery uses `META_CONVERSIONS_API_ACCESS_TOKEN`. Keep this value server-side in Vercel and never prefix it with `NEXT_PUBLIC_`.
- `META_PIXEL_ID` must match the browser Pixel ID so browser and server events deduplicate with the shared event ID.
- `META_CONVERSIONS_API_TEST_EVENT_CODE` is optional and should only be set while validating events in Meta Events Manager Test Events.
- Supported funnel events include Lead, InitiateCheckout, Purchase, Search, Contact, and WalletFunded.
- Fly Logistics strips query strings and does not send shipment tracking numbers, addresses, carrier names, message text, or payment credentials to Meta.
- Verify browser events with Meta Pixel Helper and server events in Events Manager. Remove the test event code after validation.
- Scheduled publishing uses `/api/cron/blog`, starts on July 20, 2026, and has a non-empty `CRON_SECRET`.
- Admin login, customer login, quote, tracking, map, payment, and proof upload flows are spot checked.
