-- Pay frequency is not always weekly or monthly: carriers pay daily, twice a
-- month, every two weeks, on a 10-day lag. The two-value check made an agency
-- store something untrue or nothing at all. Length is the only real rule.
ALTER TABLE public.org_carriers
  DROP CONSTRAINT IF EXISTS org_carriers_pay_frequency_chk;

ALTER TABLE public.org_carriers
  ADD CONSTRAINT org_carriers_pay_frequency_len
  CHECK (pay_frequency IS NULL OR char_length(pay_frequency) <= 60) NOT VALID;