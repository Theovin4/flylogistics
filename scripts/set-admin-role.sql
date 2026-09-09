-- Set admin role for a user in Supabase
-- Run this in your Supabase SQL Editor: https://app.supabase.com/project/YOUR_PROJECT/sql
-- Replace 'your-email@example.com' with your actual email address

-- Option 1: Set admin role directly by email
UPDATE public.user_profiles
SET role = 'admin'
WHERE email = 'your-email@example.com';

-- Verify the update
SELECT id, email, full_name, role, created_at
FROM public.user_profiles
WHERE email = 'your-email@example.com';

-- Option 2: If you know your user ID, use this instead:
-- UPDATE public.user_profiles
-- SET role = 'admin'
-- WHERE id = 'your-user-id-here';
