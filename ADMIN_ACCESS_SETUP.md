# Admin Dashboard Access Fix

## Problem
You can't login to the admin dashboard because your user profile is missing the `admin` role. By default, all new users get the `customer` role.

## Solution

### Option 1: Use SQL Editor (Fastest)

1. Go to [your Supabase project](https://app.supabase.com/project/igloqgojviveysjazhmu/sql)
2. Click the "SQL Editor" tab
3. Create a new query with this SQL:

```sql
UPDATE public.user_profiles
SET role = 'admin'
WHERE email = 'YOUR_EMAIL_HERE';
```

Replace `YOUR_EMAIL_HERE` with your actual email address.

4. Click "Run"
5. You should see a response like: `Query executed successfully`
6. Sign in at `http://localhost:3000/admin/login`, then open `/dashboard/admin`

### Option 2: Use Node.js Script

```bash
cd c:\Users\USER\Documents\New project\fly-logistics
npx tsx scripts/set-admin-role.ts your-email@example.com
```

## How it Works

The app uses role-based access control (RBAC) through the `user_profiles` table in Supabase:

```
user_profiles table columns:
- id (UUID, linked to auth.users)
- email
- full_name
- company
- role (one of: 'admin', 'dispatcher', 'driver', 'customer')
```

When you login:
1. Supabase authenticates you
2. Your user profile is fetched from `user_profiles` table
3. The role-gate component checks if you have 'admin' role
4. If yes ✅ → access to admin dashboard
5. If no ❌ → redirected with "Role access required" error

## Verify Your Role

In Supabase SQL Editor, run:

```sql
SELECT id, email, role, created_at
FROM public.user_profiles
ORDER BY created_at DESC
LIMIT 10;
```

You should see your user with `role = 'admin'`.

## Other Available Roles

- **admin**: Full system access, analytics, user management, shipment governance
- **dispatcher**: Fleet management, route optimization, driver assignment
- **driver**: Assigned deliveries, proof of delivery, earnings tracking
- **customer**: Shipment tracking, quotes, invoicing

## Still Having Issues?

1. **Check if user exists in Supabase**:
   - Go to Authentication tab in Supabase
   - Look for your email address
   - If not found, create a normal account via `/register`, then assign `admin` in `user_profiles`

2. **Check user_profiles table**:
   - In Supabase, go to the "user_profiles" table
   - Search for your user ID
   - Verify the role is set to 'admin'

3. **Clear browser cache**:
   - Hard refresh: `Ctrl+Shift+R` (Windows)
   - Or clear cookies for localhost

4. **Check environment variables**:
   - Make sure `.env.local` has valid Supabase credentials
   - `NEXT_PUBLIC_SUPABASE_URL` should be your project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` should be your anon key
