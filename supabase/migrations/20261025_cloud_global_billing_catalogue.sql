insert into public.cloud_plan_prices (
  plan,
  currency,
  amount,
  provider,
  provider_plan_id,
  price_version,
  billing_interval,
  active
)
values
  ('starter', 'USD', 37,    'flutterwave', '172703', '2026-global-v1', 'monthly', false),
  ('growth',  'USD', 94,    'flutterwave', '172704', '2026-global-v1', 'monthly', false),
  ('scale',   'USD', 331,   'flutterwave', '172705', '2026-global-v1', 'monthly', false),
  ('starter', 'GBP', 27.50, 'flutterwave', '172706', '2026-global-v1', 'monthly', false),
  ('growth',  'GBP', 70,    'flutterwave', '172707', '2026-global-v1', 'monthly', false),
  ('scale',   'GBP', 247,   'flutterwave', '172708', '2026-global-v1', 'monthly', false),
  ('starter', 'EUR', 33,    'flutterwave', '172709', '2026-global-v1', 'monthly', false),
  ('growth',  'EUR', 83.50, 'flutterwave', '172710', '2026-global-v1', 'monthly', false),
  ('scale',   'EUR', 295,   'flutterwave', '172711', '2026-global-v1', 'monthly', false),
  ('starter', 'GHS', 429,   'flutterwave', '172712', '2026-global-v1', 'monthly', false),
  ('growth',  'GHS', 1090,  'flutterwave', '172713', '2026-global-v1', 'monthly', false),
  ('scale',   'GHS', 3845,  'flutterwave', '172714', '2026-global-v1', 'monthly', false),
  ('starter', 'KES', 4800,  'flutterwave', '172715', '2026-global-v1', 'monthly', false),
  ('growth',  'KES', 12200, 'flutterwave', '172716', '2026-global-v1', 'monthly', false),
  ('scale',   'KES', 43000, 'flutterwave', '172717', '2026-global-v1', 'monthly', false),
  ('starter', 'ZAR', 610,   'flutterwave', '172718', '2026-global-v1', 'monthly', false),
  ('growth',  'ZAR', 1550,  'flutterwave', '172719', '2026-global-v1', 'monthly', false),
  ('scale',   'ZAR', 5460,  'flutterwave', '172720', '2026-global-v1', 'monthly', false)
on conflict (plan, currency, price_version) do update
set
  amount = excluded.amount,
  provider = excluded.provider,
  provider_plan_id = excluded.provider_plan_id,
  billing_interval = excluded.billing_interval,
  active = false,
  updated_at = now();
