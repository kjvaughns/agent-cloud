-- Fill missing American Home Life commission levels GA (11)–GA (23)
DO $$
DECLARE
  c_id uuid;
BEGIN
  SELECT id INTO c_id FROM public.carriers WHERE name ILIKE '%american home life%' LIMIT 1;
  IF c_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.commission_grids
    (carrier_id, product_name, level_name, year_1_pct, years_2_5_pct, years_6_plus_pct)
  VALUES
    (c_id, 'Final Expense', 'GA (11)', 85, 0, 0),
    (c_id, 'Final Expense', 'GA (12)', 90, 0, 0),
    (c_id, 'Final Expense', 'GA (13)', 95, 0, 0),
    (c_id, 'Final Expense', 'GA (14)', 100, 0, 0),
    (c_id, 'Final Expense', 'GA (15)', 105, 0, 0),
    (c_id, 'Final Expense', 'GA (16)', 110, 0, 0),
    (c_id, 'Final Expense', 'GA (17)', 115, 0, 0),
    (c_id, 'Final Expense', 'GA (18)', 120, 0, 0),
    (c_id, 'Final Expense', 'GA (19)', 125, 0, 0),
    (c_id, 'Final Expense', 'GA (20)', 130, 0, 0),
    (c_id, 'Final Expense', 'GA (21)', 135, 0, 0),
    (c_id, 'Final Expense', 'GA (22)', 140, 0, 0),
    (c_id, 'Final Expense', 'GA (23)', 145, 0, 0)
  ON CONFLICT DO NOTHING;
END $$;
