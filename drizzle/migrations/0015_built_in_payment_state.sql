CREATE TABLE public.payment_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL,
 organization_id uuid,
 environment text NOT NULL,
 stripe_subscription_id text NOT NULL,
 stripe_customer_id text NOT NULL,
 kind text NOT NULL,
 price_id text,
 quantity integer NOT NULL DEFAULT 1,
 status text NOT NULL,
 current_period_end timestamptz,
 cancel_at_period_end boolean NOT NULL DEFAULT false,
 last_event_at bigint NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(environment, stripe_subscription_id)
);
GRANT SELECT ON public.payment_subscriptions TO authenticated;
GRANT ALL ON public.payment_subscriptions TO service_role;
ALTER TABLE public.payment_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_subscription_owner_read ON public.payment_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TABLE public.payment_events (
 environment text NOT NULL,
 event_id text NOT NULL,
 processed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(environment, event_id)
);
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;