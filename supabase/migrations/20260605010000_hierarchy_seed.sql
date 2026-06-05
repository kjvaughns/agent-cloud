-- Set Kaeden's upline to Samuel and ensure both have admin role.
-- Apply via Supabase SQL Editor: https://supabase.com/dashboard/project/jodkbaftfbefdbpdbcrr/sql/new

-- Set Kaeden under Samuel
UPDATE public.profiles
SET upline_id = (SELECT id FROM auth.users WHERE email = 'info@kingofsales.net')
WHERE id = (SELECT id FROM auth.users WHERE email = 'kjvaughns13@gmail.com');

-- Samuel is the root (no upline)
UPDATE public.profiles
SET upline_id = NULL
WHERE id = (SELECT id FROM auth.users WHERE email = 'info@kingofsales.net');

-- Give both admin role (uses single-column UNIQUE(user_id) constraint from admin_additions migration)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users
WHERE email IN ('info@kingofsales.net', 'kjvaughns13@gmail.com')
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
