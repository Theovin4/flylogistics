# Fly Logistics Supabase Auth Email Branding

Supabase Auth confirmation, recovery, invite, and magic-link emails are controlled in the Supabase dashboard unless you run a custom SMTP/email hook. The Next.js app cannot change already-hosted Supabase Auth emails by itself; paste the branded HTML below into each Supabase Auth template.

## Brand Settings

- Product name: `Fly Logistics`
- Primary color: `#ff7a00`
- Background color: `#080a10`
- Text color: `#f8fafc`
- Public HD logo URL: `https://flylogistics.com.ng/icons/meta-app-icon-1024.png`
- Support email: `support@flylogistics.com.ng`
- Support phone: `+234 706 107 2929`
- Address: `Bolade Oshodi, Mafoluku, Lagos, Nigeria`

## Supabase Dashboard Steps

1. Open Supabase dashboard.
2. Go to Authentication, then Email Templates.
3. Update Confirm Signup, Magic Link, Invite User, Change Email Address, and Reset Password.
4. Paste the branded HTML template below into each email body so the logo appears.
5. Set Site URL to `https://flylogistics.com.ng`.
6. Add redirect URLs:
   - `https://flylogistics.com.ng/customer/login`
   - `https://flylogistics.com.ng/customer/register`
   - `https://flylogistics.com.ng/driver/login`
   - `https://flylogistics.com.ng/admin/login`
   - `https://flylogistics.com.ng/auth/callback`

## Template Shell

Use this HTML wrapper around each Supabase action link:

```html
<div style="margin:0;padding:0;background:#080a10;color:#f8fafc;font-family:Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:32px 20px">
    <div style="border:1px solid rgba(255,122,0,.35);border-radius:14px;overflow:hidden;background:#10131a">
      <div style="padding:22px 24px;background:#ff7a00;color:#080a10">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr>
            <td width="60" style="width:60px;vertical-align:middle">
              <img src="https://flylogistics.com.ng/icons/meta-app-icon-1024.png" width="52" height="52" alt="Fly Logistics logo" style="display:block;width:52px;height:52px;border:0;border-radius:12px;background:#080a10" />
            </td>
            <td style="vertical-align:middle;color:#080a10;font-size:22px;font-weight:900;letter-spacing:.4px">
              Fly Logistics
              <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:800;margin-top:3px">AI Freight OS</div>
            </td>
          </tr>
        </table>
      </div>
      <div style="padding:28px">
        <p style="margin:0 0 8px;color:#ffb347;text-transform:uppercase;letter-spacing:3px;font-size:12px">Secure account access</p>
        <h1 style="margin:0 0 16px;font-size:26px;line-height:1.2">Complete your Fly Logistics account action</h1>
        <p style="margin:0 0 24px;color:#d4d7df;line-height:1.6">
          Use the secure button below to continue. This link is private to your Fly Logistics account.
        </p>
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#ff7a00;color:#080a10;text-decoration:none;font-weight:800;padding:14px 20px;border-radius:8px">
          Continue securely
        </a>
        <p style="margin:24px 0 0;color:#9aa1ad;font-size:13px;line-height:1.6">
          If you did not request this, ignore this email or contact Fly Logistics support.
        </p>
      </div>
    </div>
  </div>
</div>
```

For reset-password emails, change the heading to `Reset your Fly Logistics password`. For signup confirmation, change it to `Confirm your Fly Logistics account`. Keep the `<img src="https://flylogistics.com.ng/icons/meta-app-icon-1024.png">` line in every template; that is the visible HD logo.
