# Fly Logistics WhatsApp Cloud API Setup

Fly Logistics uses Meta WhatsApp Cloud API for operational customer communication, inbound support, tracking commands, and delivery receipts. Customer-facing messages must stay Fly Logistics branded and must not mention fulfilment partners.

## Production Endpoint

Final webhook URL:

```text
https://flylogistics.com.ng/api/webhooks/whatsapp
```

Meta verification method:

- `GET /api/webhooks/whatsapp`
- The endpoint reads `hub.mode`, `hub.verify_token`, and `hub.challenge`.
- If the verify token matches the server-side token, Fly Logistics returns `hub.challenge` as plain text with HTTP 200.
- If the token does not match, Fly Logistics returns HTTP 403.

POST webhook security:

- If `WHATSAPP_APP_SECRET` or `META_APP_SECRET` is configured, Fly Logistics verifies `X-Hub-Signature-256` using HMAC SHA-256 over the raw request body.
- The Meta app secret is required in production. If it is missing, POST webhooks are rejected with HTTP 503 until `WHATSAPP_APP_SECRET` or `META_APP_SECRET` is configured.
- Invalid signatures are rejected with HTTP 401.
- Incoming event IDs are stored in `whatsapp_events` for replay protection.
- Inbound messages are stored in `whatsapp_conversations` and `whatsapp_messages`.
- Delivery/read/failure receipts update both `notification_messages` and `whatsapp_messages` where message IDs match.

## Environment Variables

Set these in Vercel Production, Preview, and Development as appropriate. Never prefix access tokens, app secrets, or verify tokens with `NEXT_PUBLIC_`.

| Variable | Purpose | Secret | Where to get it | Vercel scopes | Redeploy |
|---|---|---:|---|---|---:|
| `WHATSAPP_PROVIDER` | Selects the provider. Use `whatsapp_cloud_api` for Meta Cloud API. | No | Fly Logistics config | Production/Preview/Development | Yes |
| `WHATSAPP_CLOUD_PHONE_NUMBER_ID` | Meta phone number ID used to send messages. | No | Meta Developers → WhatsApp → API setup | Production/Preview | Yes |
| `WHATSAPP_PHONE_NUMBER_ID` | Optional alias for the same phone number ID. | No | Meta Developers | Optional | Yes |
| `WHATSAPP_CLOUD_ACCESS_TOKEN` | Meta Cloud API access token for server-side sends. | Yes | Meta app system user/permanent token setup | Production/Preview | Yes |
| `WHATSAPP_ACCESS_TOKEN` | Optional alias for the same access token. | Yes | Meta app system user/permanent token setup | Optional | Yes |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp Business Account ID for diagnostics/template management. | No | WhatsApp Manager | Production/Preview | Yes |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Secret value Meta uses during webhook verification. | Yes | Choose a long random value and paste the same value in Meta | Production/Preview | Yes |
| `WHATSAPP_VERIFY_TOKEN` | Optional alias for the same verify token. | Yes | Same as above | Optional | Yes |
| `WHATSAPP_APP_SECRET` | Meta app secret used to verify `X-Hub-Signature-256`. | Yes | Meta Developers → App settings → Basic | Production/Preview | Yes |
| `META_APP_SECRET` | Optional alias for the same app secret. | Yes | Meta Developers | Optional | Yes |
| `META_APP_ID` | Meta app ID for documentation/diagnostics. | No | Meta Developers | Optional | Yes |
| `WHATSAPP_CLOUD_API_VERSION` | Graph API version. Existing default is `v20.0`; set `v25.0` only after confirming the Meta app uses it. | No | Meta docs/app setup | Production/Preview | Yes |
| `WHATSAPP_API_VERSION` | Optional alias for Graph API version. | No | Meta docs/app setup | Optional | Yes |
| `WHATSAPP_TEST_RECIPIENT` | A permitted test/customer phone number for manual send tests. | Customer data | Internal test plan | Development/Preview only where possible | No |
| `WHATSAPP_TEST_TEMPLATE_NAME` | Approved template name for test sends. | No | WhatsApp Manager → Message templates | Development/Preview/Production test | No |

Known production identifiers for Fly Logistics:

- Production WhatsApp number: `+234 706 107 2929`
- Phone Number ID: `1202012222993511`
- Meta App ID: `1191025623149680`

Do not commit token values or screenshots containing token values.

## Meta Dashboard Setup

1. Open Meta Developers.
2. Select the Fly Logistics app.
3. Go to **WhatsApp → Configuration**.
4. Set Callback URL to:

   ```text
   https://flylogistics.com.ng/api/webhooks/whatsapp
   ```

5. Set Verify Token to the exact value stored in `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
6. Click **Verify and save**.
7. Subscribe to message webhook fields for WhatsApp messages, statuses, and delivery receipts.
8. Go to **App settings → Basic** and copy the app secret into Vercel as `WHATSAPP_APP_SECRET` or `META_APP_SECRET`.
9. Redeploy Vercel after changing environment variables.

## Supported Inbound Commands

The inbound bot supports case-insensitive commands and natural language:

- `TRACK FLY-2026-XXXXXX`
- `QUOTE`
- `BOOK`
- `PRICE`
- `PAYMENT`
- `HELP`
- `SUPPORT`
- `INTERNATIONAL`

Tracking replies include only Fly Logistics branded information:

- Fly Logistics tracking ID
- Current customer-safe status
- ETA if available
- Latest safe tracking update
- Fly Logistics tracking URL

The bot does not expose fulfilment partner names, carrier IDs, internal admin notes, private driver IDs, or unrelated customer data.

## Human Takeover

Inbound messages containing support escalation terms such as `agent`, `human`, `complaint`, `refund`, `lost`, `damaged`, `dispute`, `cancel`, or `failed` are marked `human_required`.

When a conversation is `human_required`:

- Automated replies stop except for a short acknowledgement.
- Admin/support staff can respond from `/dashboard/admin#admin-whatsapp` or `/admin/whatsapp`.
- Staff can resolve, reopen, force human takeover, or return the conversation to AI-active mode.

## Admin Inbox

Admin-only inbox routes:

- `/dashboard/admin#admin-whatsapp`
- `/admin/whatsapp`

Allowed roles:

- `admin`
- `customer_care`
- `moderator`
- `dispatcher`

The API route `/api/admin/whatsapp` requires an authenticated Fly Logistics session and performs server-side role checks. Customers, drivers, anonymous users, and browser clients cannot read other users' WhatsApp conversations.

## Database Tables

WhatsApp storage tables:

- `whatsapp_contacts`
- `whatsapp_conversations`
- `whatsapp_messages`
- `whatsapp_events`

All four tables have RLS enabled. Anonymous access is revoked. Authenticated staff roles can read the inbox; server-side webhook processing uses the Supabase service role and remains server-only.

## Templates

Operational notifications prefer approved templates so they can be delivered outside Meta's 24-hour customer-service window. Each template below must contain exactly one body variable (`{{1}}`); Fly Logistics supplies the branded event message as that value. If a template is unavailable, the service attempts a text fallback, which Meta permits only while the customer-service window is open. Template approval remains a Meta dashboard action.

Set `WHATSAPP_USE_TEMPLATES=true` and `WHATSAPP_TEMPLATE_LANGUAGE=en_US`. Individual names can be overridden with the `WHATSAPP_TEMPLATE_*` variables shown in `.env.example` without changing application code.

Recommended template names to create/approve:

| Template | Category | Language | Variables | Code status | Meta approval status |
|---|---|---|---|---|---|
| `shipment_created` | Utility | `en_US` | tracking ID, tracking link | Supported by notification service | Manual Meta action |
| `driver_assigned` | Utility | `en_US` | tracking ID, driver display name, ETA | Supported by notification service | Manual Meta action |
| `pickup_confirmed` | Utility | `en_US` | tracking ID, tracking link | Supported by notification service | Manual Meta action |
| `shipment_in_transit` | Utility | `en_US` | tracking ID, tracking link | Supported by notification service | Manual Meta action |
| `out_for_delivery` | Utility | `en_US` | tracking ID, tracking link | Supported by notification service | Manual Meta action |
| `delivered` | Utility | `en_US` | tracking ID, delivery date | Supported by notification service | Manual Meta action |
| `delivery_failed` | Utility | `en_US` | tracking ID, support link | Supported by notification service | Manual Meta action |
| `payment_received` | Utility | `en_US` | amount, reference | Supported after server-side payment verification | Manual Meta action |
| `otp` | Authentication | `en_US` | OTP code | Architecture only | Blocked until Meta template approval |
| `password_reset` | Authentication | `en_US` | reset link/code | Architecture only | Blocked until Meta template approval |

Do not claim a template is approved until it appears as approved in WhatsApp Manager.

## Production activation and mobile use

Meta error `#131030 Recipient phone number not in allowed list` means the WhatsApp account is still restricted to test recipients. Adding individual numbers in **WhatsApp → API Setup** is suitable only for testing. Customer-wide delivery requires the business portfolio, display number, and app to be approved/live with the required WhatsApp permissions.

For staff conversations on a phone, use one of these supported operating models:

1. Open the mobile-responsive Fly Logistics inbox at `https://flylogistics.com.ng/admin/whatsapp`. This works with the Cloud API number and preserves the shared audit trail.
2. Enable Meta's official WhatsApp Business App coexistence onboarding for the same number, if the option is available in WhatsApp Manager. Do not register the Cloud API number directly in the mobile app outside that onboarding flow; doing so can deregister the API number.

Inbound chat also requires `WHATSAPP_APP_SECRET` (or `META_APP_SECRET`) in Vercel so signed webhook events can be verified. Subscribe the WhatsApp Business Account webhook to the `messages` field; that field carries inbound messages and sent/delivered/read/failed status updates.

## Safe Test Plan

Only test with a permitted customer/test phone number.

1. Send `Hello` from the test phone. Confirm a conversation appears in `/admin/whatsapp`.
2. Reply from admin inbox. Confirm the test phone receives the message.
3. Send `TRACK <valid Fly tracking ID>`. Confirm the reply is Fly Logistics branded and does not show carrier details.
4. Send `TRACK FLY-INVALID`. Confirm safe failure copy.
5. Send `I need to speak to a human`. Confirm the conversation marks human takeover.
6. Trigger a delivery status update. Confirm only one meaningful customer notification is sent.
7. Replay the same webhook payload. Confirm no duplicate conversation message is created.
8. Send a fake POST with bad `X-Hub-Signature-256` while app secret is configured. Confirm HTTP 401 and no database mutation.

## Meta Verification Status

Meta Business Verification is currently **In Progress**. This is not a Fly Logistics code failure.

Classify verification-gated capabilities as `BLOCKED_BY_META_BUSINESS_VERIFICATION` until Meta completes verification, including any increased messaging limits, additional template privileges, or account capabilities gated by Meta.
