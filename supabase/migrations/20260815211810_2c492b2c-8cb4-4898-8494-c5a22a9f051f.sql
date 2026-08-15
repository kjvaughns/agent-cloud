CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('process-abandoned-imports')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-abandoned-imports');

SELECT cron.schedule(
  'process-abandoned-imports',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--72338457-b712-4dd1-9869-c5b1476a0a2b.lovable.app/api/public/hooks/process-imports',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvZGtiYWZ0ZmJlZmRicGRiY3JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODE3ODcsImV4cCI6MjA5NTA1Nzc4N30.odxnAlTwY_cZ9b_ldfm1tleoLrSOtCIB2opMSjzjI_Q"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  );
  $$
);