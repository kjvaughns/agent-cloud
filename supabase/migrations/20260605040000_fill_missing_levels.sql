-- Fill missing commission levels 85–145% for American Amicable, Baltimore Life, and Prudential
-- These carriers use numeric percentages as level names and were missing 13 intermediary levels.

DO $$
DECLARE c_id uuid;
BEGIN
  -- American Amicable
  SELECT id INTO c_id FROM public.carriers WHERE name ILIKE '%american amicable%' LIMIT 1;
  IF c_id IS NOT NULL THEN
    INSERT INTO public.commission_grids (carrier_id, product_name, level_name, year_1_pct, years_2_5_pct, years_6_plus_pct)
    SELECT c_id, p.product_name, v.level_name, v.pct, 0, 0
    FROM (VALUES
      ('Senior Choice FE'), ('Easy Term 20-30yr'), ('Express UL'), ('Home Protector'),
      ('Secure Life Plus'), ('Term Made Simple'), ('Security Protector'), ('Survivor Protector'),
      ('Platinum Solutions'), ('Safe Care Term'), ('Intelligent Choice')
    ) AS p(product_name)
    CROSS JOIN (VALUES
      ('85',85),('90',90),('95',95),('100',100),('105',105),('110',110),('115',115),
      ('120',120),('125',125),('130',130),('135',135),('140',140),('145',145)
    ) AS v(level_name,pct)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

DO $$
DECLARE c_id uuid;
BEGIN
  -- Baltimore Life
  SELECT id INTO c_id FROM public.carriers WHERE name ILIKE '%baltimore life%' LIMIT 1;
  IF c_id IS NOT NULL THEN
    INSERT INTO public.commission_grids (carrier_id, product_name, level_name, year_1_pct, years_2_5_pct, years_6_plus_pct)
    SELECT c_id, p.product_name, v.level_name, v.pct, 0, 0
    FROM (VALUES ('iProvide'), ('A-Priority')) AS p(product_name)
    CROSS JOIN (VALUES
      ('85',85),('90',90),('95',95),('100',100),('105',105),('110',110),('115',115),
      ('120',120),('125',125),('130',130),('135',135),('140',140),('145',145)
    ) AS v(level_name,pct)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

DO $$
DECLARE c_id uuid;
BEGIN
  -- Prudential
  SELECT id INTO c_id FROM public.carriers WHERE name ILIKE '%prudential%' LIMIT 1;
  IF c_id IS NOT NULL THEN
    INSERT INTO public.commission_grids (carrier_id, product_name, level_name, year_1_pct, years_2_5_pct, years_6_plus_pct)
    SELECT c_id, p.product_name, v.level_name, v.pct, 0, 0
    FROM (VALUES ('Level Term'), ('MP Term')) AS p(product_name)
    CROSS JOIN (VALUES
      ('85',85),('90',90),('95',95),('100',100),('105',105),('110',110),('115',115),
      ('120',120),('125',125),('130',130),('135',135),('140',140),('145',145)
    ) AS v(level_name,pct)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
