-- Accurate intermediate commission levels for all carriers (S+1 through S+13/S+14)
-- Based on commission grids PDF. Supersedes partial/incorrect migrations 030000 and 040000.
-- Idempotent: uses ON CONFLICT DO NOTHING; existing correct rows are preserved.

-- ============================================================
-- TRANSAMERICA — S+1 through S+13 for all 9 products
-- ============================================================
DO $$
DECLARE c_id uuid;
BEGIN
  SELECT id INTO c_id FROM public.carriers WHERE name ILIKE '%transamerica%' LIMIT 1;
  IF c_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.commission_grids (carrier_id, product_name, level_name, year_1_pct, years_2_5_pct, years_6_plus_pct)
  VALUES
    -- Immediate Solution
    (c_id, 'Immediate Solution', 'S+1', 69, 0, 0),
    (c_id, 'Immediate Solution', 'S+2', 73, 0, 0),
    (c_id, 'Immediate Solution', 'S+3', 77, 0, 0),
    (c_id, 'Immediate Solution', 'S+4', 81, 0, 0),
    (c_id, 'Immediate Solution', 'S+5', 85.5, 0, 0),
    (c_id, 'Immediate Solution', 'S+6', 89.5, 0, 0),
    (c_id, 'Immediate Solution', 'S+7', 93.5, 0, 0),
    (c_id, 'Immediate Solution', 'S+8', 97.5, 0, 0),
    (c_id, 'Immediate Solution', 'S+9', 101.5, 0, 0),
    (c_id, 'Immediate Solution', 'S+10', 105.5, 0, 0),
    (c_id, 'Immediate Solution', 'S+11', 109.5, 0, 0),
    (c_id, 'Immediate Solution', 'S+12', 114, 0, 0),
    (c_id, 'Immediate Solution', 'S+13', 118, 0, 0),
    -- FE Express
    (c_id, 'FE Express', 'S+1', 85, 0, 0),
    (c_id, 'FE Express', 'S+2', 90, 0, 0),
    (c_id, 'FE Express', 'S+3', 95, 0, 0),
    (c_id, 'FE Express', 'S+4', 100, 0, 0),
    (c_id, 'FE Express', 'S+5', 105, 0, 0),
    (c_id, 'FE Express', 'S+6', 110, 0, 0),
    (c_id, 'FE Express', 'S+7', 115, 0, 0),
    (c_id, 'FE Express', 'S+8', 120, 0, 0),
    (c_id, 'FE Express', 'S+9', 125, 0, 0),
    (c_id, 'FE Express', 'S+10', 130, 0, 0),
    (c_id, 'FE Express', 'S+11', 135, 0, 0),
    (c_id, 'FE Express', 'S+12', 140, 0, 0),
    (c_id, 'FE Express', 'S+13', 145, 0, 0),
    -- Whole Life
    (c_id, 'Whole Life', 'S+1', 74.5, 0, 0),
    (c_id, 'Whole Life', 'S+2', 79, 0, 0),
    (c_id, 'Whole Life', 'S+3', 83, 0, 0),
    (c_id, 'Whole Life', 'S+4', 87.5, 0, 0),
    (c_id, 'Whole Life', 'S+5', 92, 0, 0),
    (c_id, 'Whole Life', 'S+6', 96, 0, 0),
    (c_id, 'Whole Life', 'S+7', 100.5, 0, 0),
    (c_id, 'Whole Life', 'S+8', 105, 0, 0),
    (c_id, 'Whole Life', 'S+9', 109.5, 0, 0),
    (c_id, 'Whole Life', 'S+10', 114, 0, 0),
    (c_id, 'Whole Life', 'S+11', 118, 0, 0),
    (c_id, 'Whole Life', 'S+12', 122.5, 0, 0),
    (c_id, 'Whole Life', 'S+13', 127, 0, 0),
    -- Trendsetter Super 10Yr
    (c_id, 'Trendsetter Super 10Yr', 'S+1', 48, 0, 0),
    (c_id, 'Trendsetter Super 10Yr', 'S+2', 50.5, 0, 0),
    (c_id, 'Trendsetter Super 10Yr', 'S+3', 53.5, 0, 0),
    (c_id, 'Trendsetter Super 10Yr', 'S+4', 56, 0, 0),
    (c_id, 'Trendsetter Super 10Yr', 'S+5', 59, 0, 0),
    (c_id, 'Trendsetter Super 10Yr', 'S+6', 62, 0, 0),
    (c_id, 'Trendsetter Super 10Yr', 'S+7', 64.5, 0, 0),
    (c_id, 'Trendsetter Super 10Yr', 'S+8', 67.5, 0, 0),
    (c_id, 'Trendsetter Super 10Yr', 'S+9', 70.5, 0, 0),
    (c_id, 'Trendsetter Super 10Yr', 'S+10', 73, 0, 0),
    (c_id, 'Trendsetter Super 10Yr', 'S+11', 76, 0, 0),
    (c_id, 'Trendsetter Super 10Yr', 'S+12', 79, 0, 0),
    (c_id, 'Trendsetter Super 10Yr', 'S+13', 81.5, 0, 0),
    -- Trendsetter Super 15Yr
    (c_id, 'Trendsetter Super 15Yr', 'S+1', 53, 0, 0),
    (c_id, 'Trendsetter Super 15Yr', 'S+2', 56, 0, 0),
    (c_id, 'Trendsetter Super 15Yr', 'S+3', 59.5, 0, 0),
    (c_id, 'Trendsetter Super 15Yr', 'S+4', 62.5, 0, 0),
    (c_id, 'Trendsetter Super 15Yr', 'S+5', 65.5, 0, 0),
    (c_id, 'Trendsetter Super 15Yr', 'S+6', 69, 0, 0),
    (c_id, 'Trendsetter Super 15Yr', 'S+7', 72, 0, 0),
    (c_id, 'Trendsetter Super 15Yr', 'S+8', 75, 0, 0),
    (c_id, 'Trendsetter Super 15Yr', 'S+9', 78, 0, 0),
    (c_id, 'Trendsetter Super 15Yr', 'S+10', 81, 0, 0),
    (c_id, 'Trendsetter Super 15Yr', 'S+11', 84.5, 0, 0),
    (c_id, 'Trendsetter Super 15Yr', 'S+12', 87.5, 0, 0),
    (c_id, 'Trendsetter Super 15Yr', 'S+13', 90.5, 0, 0),
    -- Trendsetter Super 20/25/30Yr
    (c_id, 'Trendsetter Super 20/25/30Yr', 'S+1', 58.5, 0, 0),
    (c_id, 'Trendsetter Super 20/25/30Yr', 'S+2', 62, 0, 0),
    (c_id, 'Trendsetter Super 20/25/30Yr', 'S+3', 65.5, 0, 0),
    (c_id, 'Trendsetter Super 20/25/30Yr', 'S+4', 69, 0, 0),
    (c_id, 'Trendsetter Super 20/25/30Yr', 'S+5', 72, 0, 0),
    (c_id, 'Trendsetter Super 20/25/30Yr', 'S+6', 75.5, 0, 0),
    (c_id, 'Trendsetter Super 20/25/30Yr', 'S+7', 79, 0, 0),
    (c_id, 'Trendsetter Super 20/25/30Yr', 'S+8', 82.5, 0, 0),
    (c_id, 'Trendsetter Super 20/25/30Yr', 'S+9', 86, 0, 0),
    (c_id, 'Trendsetter Super 20/25/30Yr', 'S+10', 89.5, 0, 0),
    (c_id, 'Trendsetter Super 20/25/30Yr', 'S+11', 93, 0, 0),
    (c_id, 'Trendsetter Super 20/25/30Yr', 'S+12', 96, 0, 0),
    (c_id, 'Trendsetter Super 20/25/30Yr', 'S+13', 99.5, 0, 0),
    -- Trendsetter LB 10Yr
    (c_id, 'Trendsetter LB 10Yr', 'S+1', 42.5, 0, 0),
    (c_id, 'Trendsetter LB 10Yr', 'S+2', 45, 0, 0),
    (c_id, 'Trendsetter LB 10Yr', 'S+3', 47.5, 0, 0),
    (c_id, 'Trendsetter LB 10Yr', 'S+4', 50, 0, 0),
    (c_id, 'Trendsetter LB 10Yr', 'S+5', 52.5, 0, 0),
    (c_id, 'Trendsetter LB 10Yr', 'S+6', 55, 0, 0),
    (c_id, 'Trendsetter LB 10Yr', 'S+7', 57.5, 0, 0),
    (c_id, 'Trendsetter LB 10Yr', 'S+8', 60, 0, 0),
    (c_id, 'Trendsetter LB 10Yr', 'S+9', 62.5, 0, 0),
    (c_id, 'Trendsetter LB 10Yr', 'S+10', 65, 0, 0),
    (c_id, 'Trendsetter LB 10Yr', 'S+11', 67.5, 0, 0),
    (c_id, 'Trendsetter LB 10Yr', 'S+12', 70, 0, 0),
    (c_id, 'Trendsetter LB 10Yr', 'S+13', 72.5, 0, 0),
    -- Trendsetter LB 15Yr
    (c_id, 'Trendsetter LB 15Yr', 'S+1', 58.5, 0, 0),
    (c_id, 'Trendsetter LB 15Yr', 'S+2', 62, 0, 0),
    (c_id, 'Trendsetter LB 15Yr', 'S+3', 65.5, 0, 0),
    (c_id, 'Trendsetter LB 15Yr', 'S+4', 69, 0, 0),
    (c_id, 'Trendsetter LB 15Yr', 'S+5', 72, 0, 0),
    (c_id, 'Trendsetter LB 15Yr', 'S+6', 75.5, 0, 0),
    (c_id, 'Trendsetter LB 15Yr', 'S+7', 79, 0, 0),
    (c_id, 'Trendsetter LB 15Yr', 'S+8', 82.5, 0, 0),
    (c_id, 'Trendsetter LB 15Yr', 'S+9', 86, 0, 0),
    (c_id, 'Trendsetter LB 15Yr', 'S+10', 89.5, 0, 0),
    (c_id, 'Trendsetter LB 15Yr', 'S+11', 93, 0, 0),
    (c_id, 'Trendsetter LB 15Yr', 'S+12', 96, 0, 0),
    (c_id, 'Trendsetter LB 15Yr', 'S+13', 99.5, 0, 0),
    -- Trendsetter LB 20/25/30Yr
    (c_id, 'Trendsetter LB 20/25/30Yr', 'S+1', 69, 0, 0),
    (c_id, 'Trendsetter LB 20/25/30Yr', 'S+2', 73, 0, 0),
    (c_id, 'Trendsetter LB 20/25/30Yr', 'S+3', 77, 0, 0),
    (c_id, 'Trendsetter LB 20/25/30Yr', 'S+4', 81, 0, 0),
    (c_id, 'Trendsetter LB 20/25/30Yr', 'S+5', 85.5, 0, 0),
    (c_id, 'Trendsetter LB 20/25/30Yr', 'S+6', 89.5, 0, 0),
    (c_id, 'Trendsetter LB 20/25/30Yr', 'S+7', 93.5, 0, 0),
    (c_id, 'Trendsetter LB 20/25/30Yr', 'S+8', 97.5, 0, 0),
    (c_id, 'Trendsetter LB 20/25/30Yr', 'S+9', 101.5, 0, 0),
    (c_id, 'Trendsetter LB 20/25/30Yr', 'S+10', 105.5, 0, 0),
    (c_id, 'Trendsetter LB 20/25/30Yr', 'S+11', 109.5, 0, 0),
    (c_id, 'Trendsetter LB 20/25/30Yr', 'S+12', 114, 0, 0),
    (c_id, 'Trendsetter LB 20/25/30Yr', 'S+13', 118, 0, 0)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================
-- AMERICAN AMICABLE — S+1(80%) through S+14(145%)
-- Also deletes wrong rows from migration 040000 (which set pct=level% incorrectly)
-- ============================================================
DO $$
DECLARE c_id uuid;
BEGIN
  SELECT id INTO c_id FROM public.carriers WHERE name ILIKE '%american amicable%' LIMIT 1;
  IF c_id IS NULL THEN RETURN; END IF;

  -- Remove incorrect rows inserted by migration 040000
  DELETE FROM public.commission_grids
  WHERE carrier_id = c_id
    AND level_name IN ('85','90','95','100','105','110','115','120','125','130','135','140','145');

  INSERT INTO public.commission_grids (carrier_id, product_name, level_name, year_1_pct, years_2_5_pct, years_6_plus_pct)
  VALUES
    -- Senior Choice FE (S+1=80, S+2=85, ..., S+14=145)
    (c_id, 'Senior Choice FE', 'S+1', 80, 0, 0),
    (c_id, 'Senior Choice FE', 'S+2', 85, 0, 0),
    (c_id, 'Senior Choice FE', 'S+3', 90, 0, 0),
    (c_id, 'Senior Choice FE', 'S+4', 95, 0, 0),
    (c_id, 'Senior Choice FE', 'S+5', 100, 0, 0),
    (c_id, 'Senior Choice FE', 'S+6', 105, 0, 0),
    (c_id, 'Senior Choice FE', 'S+7', 110, 0, 0),
    (c_id, 'Senior Choice FE', 'S+8', 115, 0, 0),
    (c_id, 'Senior Choice FE', 'S+9', 120, 0, 0),
    (c_id, 'Senior Choice FE', 'S+10', 125, 0, 0),
    (c_id, 'Senior Choice FE', 'S+11', 130, 0, 0),
    (c_id, 'Senior Choice FE', 'S+12', 135, 0, 0),
    (c_id, 'Senior Choice FE', 'S+13', 140, 0, 0),
    (c_id, 'Senior Choice FE', 'S+14', 145, 0, 0),
    -- Easy Term 20-30yr
    (c_id, 'Easy Term 20-30yr', 'S+1', 64, 0, 0),
    (c_id, 'Easy Term 20-30yr', 'S+2', 68, 0, 0),
    (c_id, 'Easy Term 20-30yr', 'S+3', 72, 0, 0),
    (c_id, 'Easy Term 20-30yr', 'S+4', 76, 0, 0),
    (c_id, 'Easy Term 20-30yr', 'S+5', 80, 0, 0),
    (c_id, 'Easy Term 20-30yr', 'S+6', 84, 0, 0),
    (c_id, 'Easy Term 20-30yr', 'S+7', 88, 0, 0),
    (c_id, 'Easy Term 20-30yr', 'S+8', 92, 0, 0),
    (c_id, 'Easy Term 20-30yr', 'S+9', 96, 0, 0),
    (c_id, 'Easy Term 20-30yr', 'S+10', 100, 0, 0),
    (c_id, 'Easy Term 20-30yr', 'S+11', 104, 0, 0),
    (c_id, 'Easy Term 20-30yr', 'S+12', 108, 0, 0),
    (c_id, 'Easy Term 20-30yr', 'S+13', 112, 0, 0),
    (c_id, 'Easy Term 20-30yr', 'S+14', 116, 0, 0),
    -- Express UL
    (c_id, 'Express UL', 'S+1', 58.5, 0, 0),
    (c_id, 'Express UL', 'S+2', 62.5, 0, 0),
    (c_id, 'Express UL', 'S+3', 66, 0, 0),
    (c_id, 'Express UL', 'S+4', 69.5, 0, 0),
    (c_id, 'Express UL', 'S+5', 73.5, 0, 0),
    (c_id, 'Express UL', 'S+6', 77, 0, 0),
    (c_id, 'Express UL', 'S+7', 80.5, 0, 0),
    (c_id, 'Express UL', 'S+8', 84.5, 0, 0),
    (c_id, 'Express UL', 'S+9', 88, 0, 0),
    (c_id, 'Express UL', 'S+10', 91.5, 0, 0),
    (c_id, 'Express UL', 'S+11', 95.5, 0, 0),
    (c_id, 'Express UL', 'S+12', 99, 0, 0),
    (c_id, 'Express UL', 'S+13', 102.5, 0, 0),
    (c_id, 'Express UL', 'S+14', 106.5, 0, 0),
    -- Home Protector
    (c_id, 'Home Protector', 'S+1', 90.5, 0, 0),
    (c_id, 'Home Protector', 'S+2', 96.5, 0, 0),
    (c_id, 'Home Protector', 'S+3', 102, 0, 0),
    (c_id, 'Home Protector', 'S+4', 107.5, 0, 0),
    (c_id, 'Home Protector', 'S+5', 113.5, 0, 0),
    (c_id, 'Home Protector', 'S+6', 119, 0, 0),
    (c_id, 'Home Protector', 'S+7', 124.5, 0, 0),
    (c_id, 'Home Protector', 'S+8', 130.5, 0, 0),
    (c_id, 'Home Protector', 'S+9', 136, 0, 0),
    (c_id, 'Home Protector', 'S+10', 141.5, 0, 0),
    (c_id, 'Home Protector', 'S+11', 147.5, 0, 0),
    (c_id, 'Home Protector', 'S+12', 153, 0, 0),
    (c_id, 'Home Protector', 'S+13', 158.5, 0, 0),
    (c_id, 'Home Protector', 'S+14', 164.5, 0, 0),
    -- Secure Life Plus
    (c_id, 'Secure Life Plus', 'S+1', 101.5, 0, 0),
    (c_id, 'Secure Life Plus', 'S+2', 107.5, 0, 0),
    (c_id, 'Secure Life Plus', 'S+3', 114, 0, 0),
    (c_id, 'Secure Life Plus', 'S+4', 120.5, 0, 0),
    (c_id, 'Secure Life Plus', 'S+5', 126.5, 0, 0),
    (c_id, 'Secure Life Plus', 'S+6', 133, 0, 0),
    (c_id, 'Secure Life Plus', 'S+7', 139.5, 0, 0),
    (c_id, 'Secure Life Plus', 'S+8', 145.5, 0, 0),
    (c_id, 'Secure Life Plus', 'S+9', 152, 0, 0),
    (c_id, 'Secure Life Plus', 'S+10', 158.5, 0, 0),
    (c_id, 'Secure Life Plus', 'S+11', 164.5, 0, 0),
    (c_id, 'Secure Life Plus', 'S+12', 171, 0, 0),
    (c_id, 'Secure Life Plus', 'S+13', 177.5, 0, 0),
    (c_id, 'Secure Life Plus', 'S+14', 183.5, 0, 0),
    -- Term Made Simple
    (c_id, 'Term Made Simple', 'S+1', 58.5, 0, 0),
    (c_id, 'Term Made Simple', 'S+2', 62.5, 0, 0),
    (c_id, 'Term Made Simple', 'S+3', 66, 0, 0),
    (c_id, 'Term Made Simple', 'S+4', 69.5, 0, 0),
    (c_id, 'Term Made Simple', 'S+5', 73.5, 0, 0),
    (c_id, 'Term Made Simple', 'S+6', 77, 0, 0),
    (c_id, 'Term Made Simple', 'S+7', 80.5, 0, 0),
    (c_id, 'Term Made Simple', 'S+8', 84.5, 0, 0),
    (c_id, 'Term Made Simple', 'S+9', 88, 0, 0),
    (c_id, 'Term Made Simple', 'S+10', 91.5, 0, 0),
    (c_id, 'Term Made Simple', 'S+11', 95.5, 0, 0),
    (c_id, 'Term Made Simple', 'S+12', 99, 0, 0),
    (c_id, 'Term Made Simple', 'S+13', 102.5, 0, 0),
    (c_id, 'Term Made Simple', 'S+14', 106.5, 0, 0),
    -- Security Protector
    (c_id, 'Security Protector', 'S+1', 64, 0, 0),
    (c_id, 'Security Protector', 'S+2', 68, 0, 0),
    (c_id, 'Security Protector', 'S+3', 72, 0, 0),
    (c_id, 'Security Protector', 'S+4', 76, 0, 0),
    (c_id, 'Security Protector', 'S+5', 80, 0, 0),
    (c_id, 'Security Protector', 'S+6', 84, 0, 0),
    (c_id, 'Security Protector', 'S+7', 88, 0, 0),
    (c_id, 'Security Protector', 'S+8', 92, 0, 0),
    (c_id, 'Security Protector', 'S+9', 96, 0, 0),
    (c_id, 'Security Protector', 'S+10', 100, 0, 0),
    (c_id, 'Security Protector', 'S+11', 104, 0, 0),
    (c_id, 'Security Protector', 'S+12', 108, 0, 0),
    (c_id, 'Security Protector', 'S+13', 112, 0, 0),
    (c_id, 'Security Protector', 'S+14', 116, 0, 0),
    -- Survivor Protector
    (c_id, 'Survivor Protector', 'S+1', 96, 0, 0),
    (c_id, 'Survivor Protector', 'S+2', 102, 0, 0),
    (c_id, 'Survivor Protector', 'S+3', 108, 0, 0),
    (c_id, 'Survivor Protector', 'S+4', 114, 0, 0),
    (c_id, 'Survivor Protector', 'S+5', 120, 0, 0),
    (c_id, 'Survivor Protector', 'S+6', 126, 0, 0),
    (c_id, 'Survivor Protector', 'S+7', 132, 0, 0),
    (c_id, 'Survivor Protector', 'S+8', 138, 0, 0),
    (c_id, 'Survivor Protector', 'S+9', 144, 0, 0),
    (c_id, 'Survivor Protector', 'S+10', 150, 0, 0),
    (c_id, 'Survivor Protector', 'S+11', 156, 0, 0),
    (c_id, 'Survivor Protector', 'S+12', 162, 0, 0),
    (c_id, 'Survivor Protector', 'S+13', 168, 0, 0),
    (c_id, 'Survivor Protector', 'S+14', 174, 0, 0),
    -- Platinum Solutions
    (c_id, 'Platinum Solutions', 'S+1', 85.5, 0, 0),
    (c_id, 'Platinum Solutions', 'S+2', 90.5, 0, 0),
    (c_id, 'Platinum Solutions', 'S+3', 96, 0, 0),
    (c_id, 'Platinum Solutions', 'S+4', 101.5, 0, 0),
    (c_id, 'Platinum Solutions', 'S+5', 106.5, 0, 0),
    (c_id, 'Platinum Solutions', 'S+6', 112, 0, 0),
    (c_id, 'Platinum Solutions', 'S+7', 117.5, 0, 0),
    (c_id, 'Platinum Solutions', 'S+8', 122.5, 0, 0),
    (c_id, 'Platinum Solutions', 'S+9', 128, 0, 0),
    (c_id, 'Platinum Solutions', 'S+10', 133.5, 0, 0),
    (c_id, 'Platinum Solutions', 'S+11', 138.5, 0, 0),
    (c_id, 'Platinum Solutions', 'S+12', 144, 0, 0),
    (c_id, 'Platinum Solutions', 'S+13', 149.5, 0, 0),
    (c_id, 'Platinum Solutions', 'S+14', 154.5, 0, 0),
    -- Safe Care Term
    (c_id, 'Safe Care Term', 'S+1', 101.5, 0, 0),
    (c_id, 'Safe Care Term', 'S+2', 107.5, 0, 0),
    (c_id, 'Safe Care Term', 'S+3', 114, 0, 0),
    (c_id, 'Safe Care Term', 'S+4', 120.5, 0, 0),
    (c_id, 'Safe Care Term', 'S+5', 126.5, 0, 0),
    (c_id, 'Safe Care Term', 'S+6', 133, 0, 0),
    (c_id, 'Safe Care Term', 'S+7', 139.5, 0, 0),
    (c_id, 'Safe Care Term', 'S+8', 145.5, 0, 0),
    (c_id, 'Safe Care Term', 'S+9', 152, 0, 0),
    (c_id, 'Safe Care Term', 'S+10', 158.5, 0, 0),
    (c_id, 'Safe Care Term', 'S+11', 164.5, 0, 0),
    (c_id, 'Safe Care Term', 'S+12', 171, 0, 0),
    (c_id, 'Safe Care Term', 'S+13', 177.5, 0, 0),
    (c_id, 'Safe Care Term', 'S+14', 183.5, 0, 0),
    -- Intelligent Choice
    (c_id, 'Intelligent Choice', 'S+1', 58.5, 0, 0),
    (c_id, 'Intelligent Choice', 'S+2', 62.5, 0, 0),
    (c_id, 'Intelligent Choice', 'S+3', 66, 0, 0),
    (c_id, 'Intelligent Choice', 'S+4', 69.5, 0, 0),
    (c_id, 'Intelligent Choice', 'S+5', 73.5, 0, 0),
    (c_id, 'Intelligent Choice', 'S+6', 77, 0, 0),
    (c_id, 'Intelligent Choice', 'S+7', 80.5, 0, 0),
    (c_id, 'Intelligent Choice', 'S+8', 84.5, 0, 0),
    (c_id, 'Intelligent Choice', 'S+9', 88, 0, 0),
    (c_id, 'Intelligent Choice', 'S+10', 91.5, 0, 0),
    (c_id, 'Intelligent Choice', 'S+11', 95.5, 0, 0),
    (c_id, 'Intelligent Choice', 'S+12', 99, 0, 0),
    (c_id, 'Intelligent Choice', 'S+13', 102.5, 0, 0),
    (c_id, 'Intelligent Choice', 'S+14', 106.5, 0, 0)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================
-- MUTUAL OF OMAHA — S+0(75%) through S+14(145%) for all 8 products
-- ============================================================
DO $$
DECLARE c_id uuid;
BEGIN
  SELECT id INTO c_id FROM public.carriers WHERE name ILIKE '%mutual of omaha%' LIMIT 1;
  IF c_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.commission_grids (carrier_id, product_name, level_name, year_1_pct, years_2_5_pct, years_6_plus_pct)
  VALUES
    -- Living Promise FE
    (c_id, 'Living Promise FE', 'S+0', 75, 0, 0),
    (c_id, 'Living Promise FE', 'S+1', 80, 0, 0),
    (c_id, 'Living Promise FE', 'S+2', 85, 0, 0),
    (c_id, 'Living Promise FE', 'S+3', 90, 0, 0),
    (c_id, 'Living Promise FE', 'S+4', 95, 0, 0),
    (c_id, 'Living Promise FE', 'S+5', 100, 0, 0),
    (c_id, 'Living Promise FE', 'S+6', 105, 0, 0),
    (c_id, 'Living Promise FE', 'S+7', 110, 0, 0),
    (c_id, 'Living Promise FE', 'S+8', 115, 0, 0),
    (c_id, 'Living Promise FE', 'S+9', 120, 0, 0),
    (c_id, 'Living Promise FE', 'S+10', 125, 0, 0),
    (c_id, 'Living Promise FE', 'S+11', 130, 0, 0),
    (c_id, 'Living Promise FE', 'S+12', 135, 0, 0),
    (c_id, 'Living Promise FE', 'S+13', 140, 0, 0),
    (c_id, 'Living Promise FE', 'S+14', 145, 0, 0),
    -- TLE
    (c_id, 'TLE', 'S+0', 86, 0, 0),
    (c_id, 'TLE', 'S+1', 92, 0, 0),
    (c_id, 'TLE', 'S+2', 97.5, 0, 0),
    (c_id, 'TLE', 'S+3', 103.5, 0, 0),
    (c_id, 'TLE', 'S+4', 109, 0, 0),
    (c_id, 'TLE', 'S+5', 115, 0, 0),
    (c_id, 'TLE', 'S+6', 120.5, 0, 0),
    (c_id, 'TLE', 'S+7', 126.5, 0, 0),
    (c_id, 'TLE', 'S+8', 132, 0, 0),
    (c_id, 'TLE', 'S+9', 138, 0, 0),
    (c_id, 'TLE', 'S+10', 143.5, 0, 0),
    (c_id, 'TLE', 'S+11', 149.5, 0, 0),
    (c_id, 'TLE', 'S+12', 155, 0, 0),
    (c_id, 'TLE', 'S+13', 161, 0, 0),
    (c_id, 'TLE', 'S+14', 166.5, 0, 0),
    -- IULE
    (c_id, 'IULE', 'S+0', 71, 0, 0),
    (c_id, 'IULE', 'S+1', 75.5, 0, 0),
    (c_id, 'IULE', 'S+2', 80.5, 0, 0),
    (c_id, 'IULE', 'S+3', 85, 0, 0),
    (c_id, 'IULE', 'S+4', 90, 0, 0),
    (c_id, 'IULE', 'S+5', 94.5, 0, 0),
    (c_id, 'IULE', 'S+6', 99.5, 0, 0),
    (c_id, 'IULE', 'S+7', 104, 0, 0),
    (c_id, 'IULE', 'S+8', 109, 0, 0),
    (c_id, 'IULE', 'S+9', 113.5, 0, 0),
    (c_id, 'IULE', 'S+10', 118, 0, 0),
    (c_id, 'IULE', 'S+11', 123, 0, 0),
    (c_id, 'IULE', 'S+12', 127.5, 0, 0),
    (c_id, 'IULE', 'S+13', 132.5, 0, 0),
    (c_id, 'IULE', 'S+14', 137, 0, 0),
    -- Whole Life
    (c_id, 'Whole Life', 'S+0', 71, 0, 0),
    (c_id, 'Whole Life', 'S+1', 75.5, 0, 0),
    (c_id, 'Whole Life', 'S+2', 80.5, 0, 0),
    (c_id, 'Whole Life', 'S+3', 85, 0, 0),
    (c_id, 'Whole Life', 'S+4', 90, 0, 0),
    (c_id, 'Whole Life', 'S+5', 94.5, 0, 0),
    (c_id, 'Whole Life', 'S+6', 99.5, 0, 0),
    (c_id, 'Whole Life', 'S+7', 104, 0, 0),
    (c_id, 'Whole Life', 'S+8', 109, 0, 0),
    (c_id, 'Whole Life', 'S+9', 113.5, 0, 0),
    (c_id, 'Whole Life', 'S+10', 118, 0, 0),
    (c_id, 'Whole Life', 'S+11', 123, 0, 0),
    (c_id, 'Whole Life', 'S+12', 127.5, 0, 0),
    (c_id, 'Whole Life', 'S+13', 132.5, 0, 0),
    (c_id, 'Whole Life', 'S+14', 137, 0, 0),
    -- UL
    (c_id, 'UL', 'S+0', 50.5, 0, 0),
    (c_id, 'UL', 'S+1', 54, 0, 0),
    (c_id, 'UL', 'S+2', 57.5, 0, 0),
    (c_id, 'UL', 'S+3', 61, 0, 0),
    (c_id, 'UL', 'S+4', 64, 0, 0),
    (c_id, 'UL', 'S+5', 67.5, 0, 0),
    (c_id, 'UL', 'S+6', 71, 0, 0),
    (c_id, 'UL', 'S+7', 74.5, 0, 0),
    (c_id, 'UL', 'S+8', 77.5, 0, 0),
    (c_id, 'UL', 'S+9', 81, 0, 0),
    (c_id, 'UL', 'S+10', 84.5, 0, 0),
    (c_id, 'UL', 'S+11', 88, 0, 0),
    (c_id, 'UL', 'S+12', 91, 0, 0),
    (c_id, 'UL', 'S+13', 94.5, 0, 0),
    (c_id, 'UL', 'S+14', 98, 0, 0),
    -- IUL
    (c_id, 'IUL', 'S+0', 66, 0, 0),
    (c_id, 'IUL', 'S+1', 70.5, 0, 0),
    (c_id, 'IUL', 'S+2', 74.5, 0, 0),
    (c_id, 'IUL', 'S+3', 79, 0, 0),
    (c_id, 'IUL', 'S+4', 83.5, 0, 0),
    (c_id, 'IUL', 'S+5', 88, 0, 0),
    (c_id, 'IUL', 'S+6', 92, 0, 0),
    (c_id, 'IUL', 'S+7', 96.5, 0, 0),
    (c_id, 'IUL', 'S+8', 101, 0, 0),
    (c_id, 'IUL', 'S+9', 105.5, 0, 0),
    (c_id, 'IUL', 'S+10', 110, 0, 0),
    (c_id, 'IUL', 'S+11', 114, 0, 0),
    (c_id, 'IUL', 'S+12', 118.5, 0, 0),
    (c_id, 'IUL', 'S+13', 123, 0, 0),
    (c_id, 'IUL', 'S+14', 127.5, 0, 0),
    -- TLA 10 Year
    (c_id, 'TLA 10 Year', 'S+0', 38.5, 0, 0),
    (c_id, 'TLA 10 Year', 'S+1', 41, 0, 0),
    (c_id, 'TLA 10 Year', 'S+2', 43.5, 0, 0),
    (c_id, 'TLA 10 Year', 'S+3', 46, 0, 0),
    (c_id, 'TLA 10 Year', 'S+4', 49, 0, 0),
    (c_id, 'TLA 10 Year', 'S+5', 51.5, 0, 0),
    (c_id, 'TLA 10 Year', 'S+6', 54, 0, 0),
    (c_id, 'TLA 10 Year', 'S+7', 56.5, 0, 0),
    (c_id, 'TLA 10 Year', 'S+8', 59, 0, 0),
    (c_id, 'TLA 10 Year', 'S+9', 61.5, 0, 0),
    (c_id, 'TLA 10 Year', 'S+10', 64, 0, 0),
    (c_id, 'TLA 10 Year', 'S+11', 67, 0, 0),
    (c_id, 'TLA 10 Year', 'S+12', 69.5, 0, 0),
    (c_id, 'TLA 10 Year', 'S+13', 72, 0, 0),
    (c_id, 'TLA 10 Year', 'S+14', 74.5, 0, 0),
    -- TLA 20/30 Year
    (c_id, 'TLA 20/30 Year', 'S+0', 61, 0, 0),
    (c_id, 'TLA 20/30 Year', 'S+1', 65, 0, 0),
    (c_id, 'TLA 20/30 Year', 'S+2', 69, 0, 0),
    (c_id, 'TLA 20/30 Year', 'S+3', 73, 0, 0),
    (c_id, 'TLA 20/30 Year', 'S+4', 77, 0, 0),
    (c_id, 'TLA 20/30 Year', 'S+5', 81, 0, 0),
    (c_id, 'TLA 20/30 Year', 'S+6', 85, 0, 0),
    (c_id, 'TLA 20/30 Year', 'S+7', 89, 0, 0),
    (c_id, 'TLA 20/30 Year', 'S+8', 93, 0, 0),
    (c_id, 'TLA 20/30 Year', 'S+9', 97.5, 0, 0),
    (c_id, 'TLA 20/30 Year', 'S+10', 101.5, 0, 0),
    (c_id, 'TLA 20/30 Year', 'S+11', 105.5, 0, 0),
    (c_id, 'TLA 20/30 Year', 'S+12', 109.5, 0, 0),
    (c_id, 'TLA 20/30 Year', 'S+13', 113.5, 0, 0),
    (c_id, 'TLA 20/30 Year', 'S+14', 117.5, 0, 0)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================
-- FORESTERS — S+1(85%) through S+13(145%), including renewal rows
-- ============================================================
DO $$
DECLARE c_id uuid;
BEGIN
  SELECT id INTO c_id FROM public.carriers WHERE name ILIKE '%foresters%' LIMIT 1;
  IF c_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.commission_grids (carrier_id, product_name, level_name, year_1_pct, years_2_5_pct, years_6_plus_pct)
  VALUES
    -- PlanRight FE 50-80
    (c_id, 'PlanRight FE 50-80', 'S+1', 85, 0, 0),
    (c_id, 'PlanRight FE 50-80', 'S+2', 90, 0, 0),
    (c_id, 'PlanRight FE 50-80', 'S+3', 95, 0, 0),
    (c_id, 'PlanRight FE 50-80', 'S+4', 100, 0, 0),
    (c_id, 'PlanRight FE 50-80', 'S+5', 105, 0, 0),
    (c_id, 'PlanRight FE 50-80', 'S+6', 110, 0, 0),
    (c_id, 'PlanRight FE 50-80', 'S+7', 115, 0, 0),
    (c_id, 'PlanRight FE 50-80', 'S+8', 120, 0, 0),
    (c_id, 'PlanRight FE 50-80', 'S+9', 125, 0, 0),
    (c_id, 'PlanRight FE 50-80', 'S+10', 130, 0, 0),
    (c_id, 'PlanRight FE 50-80', 'S+11', 135, 0, 0),
    (c_id, 'PlanRight FE 50-80', 'S+12', 140, 0, 0),
    (c_id, 'PlanRight FE 50-80', 'S+13', 145, 0, 0),
    -- PlanRight FE 81-85
    (c_id, 'PlanRight FE 81-85', 'S+1', 55, 0, 0),
    (c_id, 'PlanRight FE 81-85', 'S+2', 58.5, 0, 0),
    (c_id, 'PlanRight FE 81-85', 'S+3', 62, 0, 0),
    (c_id, 'PlanRight FE 81-85', 'S+4', 65, 0, 0),
    (c_id, 'PlanRight FE 81-85', 'S+5', 68, 0, 0),
    (c_id, 'PlanRight FE 81-85', 'S+6', 71.5, 0, 0),
    (c_id, 'PlanRight FE 81-85', 'S+7', 75, 0, 0),
    (c_id, 'PlanRight FE 81-85', 'S+8', 78, 0, 0),
    (c_id, 'PlanRight FE 81-85', 'S+9', 81, 0, 0),
    (c_id, 'PlanRight FE 81-85', 'S+10', 84.5, 0, 0),
    (c_id, 'PlanRight FE 81-85', 'S+11', 88, 0, 0),
    (c_id, 'PlanRight FE 81-85', 'S+12', 91, 0, 0),
    (c_id, 'PlanRight FE 81-85', 'S+13', 94, 0, 0),
    -- PlanRight Renewals Yr2-5 (stored as year_2_5 column)
    (c_id, 'PlanRight Renewals', 'S+1', 0, 6, 4),
    (c_id, 'PlanRight Renewals', 'S+2', 0, 6.5, 4),
    (c_id, 'PlanRight Renewals', 'S+3', 0, 7, 4.5),
    (c_id, 'PlanRight Renewals', 'S+4', 0, 7, 4.5),
    (c_id, 'PlanRight Renewals', 'S+5', 0, 7.5, 5),
    (c_id, 'PlanRight Renewals', 'S+6', 0, 8, 5),
    (c_id, 'PlanRight Renewals', 'S+7', 0, 8.5, 5.5),
    (c_id, 'PlanRight Renewals', 'S+8', 0, 8.5, 5.5),
    (c_id, 'PlanRight Renewals', 'S+9', 0, 9, 6),
    (c_id, 'PlanRight Renewals', 'S+10', 0, 9.5, 6),
    (c_id, 'PlanRight Renewals', 'S+11', 0, 9.5, 6.5),
    (c_id, 'PlanRight Renewals', 'S+12', 0, 10, 6.5),
    (c_id, 'PlanRight Renewals', 'S+13', 0, 10.5, 7),
    -- PlanRight Modified Benefit WL
    (c_id, 'PlanRight Modified Benefit WL', 'S+1', 42.5, 0, 0),
    (c_id, 'PlanRight Modified Benefit WL', 'S+2', 45, 0, 0),
    (c_id, 'PlanRight Modified Benefit WL', 'S+3', 47.5, 0, 0),
    (c_id, 'PlanRight Modified Benefit WL', 'S+4', 50, 0, 0),
    (c_id, 'PlanRight Modified Benefit WL', 'S+5', 52.5, 0, 0),
    (c_id, 'PlanRight Modified Benefit WL', 'S+6', 55, 0, 0),
    (c_id, 'PlanRight Modified Benefit WL', 'S+7', 57.5, 0, 0),
    (c_id, 'PlanRight Modified Benefit WL', 'S+8', 60, 0, 0),
    (c_id, 'PlanRight Modified Benefit WL', 'S+9', 62.5, 0, 0),
    (c_id, 'PlanRight Modified Benefit WL', 'S+10', 65, 0, 0),
    (c_id, 'PlanRight Modified Benefit WL', 'S+11', 67.5, 0, 0),
    (c_id, 'PlanRight Modified Benefit WL', 'S+12', 70, 0, 0),
    (c_id, 'PlanRight Modified Benefit WL', 'S+13', 72.5, 0, 0),
    -- Your Term Non-Med 15/20/25/30Yr
    (c_id, 'Your Term Non-Med 15/20/25/30Yr', 'S+1', 79.5, 0, 0),
    (c_id, 'Your Term Non-Med 15/20/25/30Yr', 'S+2', 84.5, 0, 0),
    (c_id, 'Your Term Non-Med 15/20/25/30Yr', 'S+3', 89, 0, 0),
    (c_id, 'Your Term Non-Med 15/20/25/30Yr', 'S+4', 94, 0, 0),
    (c_id, 'Your Term Non-Med 15/20/25/30Yr', 'S+5', 98.5, 0, 0),
    (c_id, 'Your Term Non-Med 15/20/25/30Yr', 'S+6', 103, 0, 0),
    (c_id, 'Your Term Non-Med 15/20/25/30Yr', 'S+7', 108, 0, 0),
    (c_id, 'Your Term Non-Med 15/20/25/30Yr', 'S+8', 112.5, 0, 0),
    (c_id, 'Your Term Non-Med 15/20/25/30Yr', 'S+9', 117, 0, 0),
    (c_id, 'Your Term Non-Med 15/20/25/30Yr', 'S+10', 122, 0, 0),
    (c_id, 'Your Term Non-Med 15/20/25/30Yr', 'S+11', 126.5, 0, 0),
    (c_id, 'Your Term Non-Med 15/20/25/30Yr', 'S+12', 131, 0, 0),
    (c_id, 'Your Term Non-Med 15/20/25/30Yr', 'S+13', 136, 0, 0),
    -- Your Term Medical 15/20/25/30Yr
    (c_id, 'Your Term Medical 15/20/25/30Yr', 'S+1', 64, 0, 0),
    (c_id, 'Your Term Medical 15/20/25/30Yr', 'S+2', 67.5, 0, 0),
    (c_id, 'Your Term Medical 15/20/25/30Yr', 'S+3', 71, 0, 0),
    (c_id, 'Your Term Medical 15/20/25/30Yr', 'S+4', 75, 0, 0),
    (c_id, 'Your Term Medical 15/20/25/30Yr', 'S+5', 79, 0, 0),
    (c_id, 'Your Term Medical 15/20/25/30Yr', 'S+6', 82.5, 0, 0),
    (c_id, 'Your Term Medical 15/20/25/30Yr', 'S+7', 86, 0, 0),
    (c_id, 'Your Term Medical 15/20/25/30Yr', 'S+8', 90, 0, 0),
    (c_id, 'Your Term Medical 15/20/25/30Yr', 'S+9', 94, 0, 0),
    (c_id, 'Your Term Medical 15/20/25/30Yr', 'S+10', 97.5, 0, 0),
    (c_id, 'Your Term Medical 15/20/25/30Yr', 'S+11', 101, 0, 0),
    (c_id, 'Your Term Medical 15/20/25/30Yr', 'S+12', 105, 0, 0),
    (c_id, 'Your Term Medical 15/20/25/30Yr', 'S+13', 109, 0, 0),
    -- Your Term 10Yr
    (c_id, 'Your Term 10Yr', 'S+1', 37, 0, 0),
    (c_id, 'Your Term 10Yr', 'S+2', 39.5, 0, 0),
    (c_id, 'Your Term 10Yr', 'S+3', 41.5, 0, 0),
    (c_id, 'Your Term 10Yr', 'S+4', 44, 0, 0),
    (c_id, 'Your Term 10Yr', 'S+5', 46, 0, 0),
    (c_id, 'Your Term 10Yr', 'S+6', 48, 0, 0),
    (c_id, 'Your Term 10Yr', 'S+7', 50.5, 0, 0),
    (c_id, 'Your Term 10Yr', 'S+8', 52.5, 0, 0),
    (c_id, 'Your Term 10Yr', 'S+9', 54.5, 0, 0),
    (c_id, 'Your Term 10Yr', 'S+10', 57, 0, 0),
    (c_id, 'Your Term 10Yr', 'S+11', 59, 0, 0),
    (c_id, 'Your Term 10Yr', 'S+12', 61, 0, 0),
    (c_id, 'Your Term 10Yr', 'S+13', 63.5, 0, 0),
    -- SMART UL
    (c_id, 'SMART UL', 'S+1', 85, 0, 0),
    (c_id, 'SMART UL', 'S+2', 90, 0, 0),
    (c_id, 'SMART UL', 'S+3', 95, 0, 0),
    (c_id, 'SMART UL', 'S+4', 100, 0, 0),
    (c_id, 'SMART UL', 'S+5', 105, 0, 0),
    (c_id, 'SMART UL', 'S+6', 110, 0, 0),
    (c_id, 'SMART UL', 'S+7', 115, 0, 0),
    (c_id, 'SMART UL', 'S+8', 120, 0, 0),
    (c_id, 'SMART UL', 'S+9', 125, 0, 0),
    (c_id, 'SMART UL', 'S+10', 130, 0, 0),
    (c_id, 'SMART UL', 'S+11', 135, 0, 0),
    (c_id, 'SMART UL', 'S+12', 140, 0, 0),
    (c_id, 'SMART UL', 'S+13', 145, 0, 0),
    -- Advantage Plus SI WL Pay 100
    (c_id, 'Advantage Plus SI WL Pay 100', 'S+1', 79.5, 0, 0),
    (c_id, 'Advantage Plus SI WL Pay 100', 'S+2', 84.5, 0, 0),
    (c_id, 'Advantage Plus SI WL Pay 100', 'S+3', 89, 0, 0),
    (c_id, 'Advantage Plus SI WL Pay 100', 'S+4', 94, 0, 0),
    (c_id, 'Advantage Plus SI WL Pay 100', 'S+5', 98.5, 0, 0),
    (c_id, 'Advantage Plus SI WL Pay 100', 'S+6', 103, 0, 0),
    (c_id, 'Advantage Plus SI WL Pay 100', 'S+7', 108, 0, 0),
    (c_id, 'Advantage Plus SI WL Pay 100', 'S+8', 112.5, 0, 0),
    (c_id, 'Advantage Plus SI WL Pay 100', 'S+9', 117, 0, 0),
    (c_id, 'Advantage Plus SI WL Pay 100', 'S+10', 122, 0, 0),
    (c_id, 'Advantage Plus SI WL Pay 100', 'S+11', 126.5, 0, 0),
    (c_id, 'Advantage Plus SI WL Pay 100', 'S+12', 131, 0, 0),
    (c_id, 'Advantage Plus SI WL Pay 100', 'S+13', 136, 0, 0),
    -- Advantage Plus FU WL Pay 100
    (c_id, 'Advantage Plus FU WL Pay 100', 'S+1', 79.5, 0, 0),
    (c_id, 'Advantage Plus FU WL Pay 100', 'S+2', 84.5, 0, 0),
    (c_id, 'Advantage Plus FU WL Pay 100', 'S+3', 89, 0, 0),
    (c_id, 'Advantage Plus FU WL Pay 100', 'S+4', 94, 0, 0),
    (c_id, 'Advantage Plus FU WL Pay 100', 'S+5', 98.5, 0, 0),
    (c_id, 'Advantage Plus FU WL Pay 100', 'S+6', 103, 0, 0),
    (c_id, 'Advantage Plus FU WL Pay 100', 'S+7', 108, 0, 0),
    (c_id, 'Advantage Plus FU WL Pay 100', 'S+8', 112.5, 0, 0),
    (c_id, 'Advantage Plus FU WL Pay 100', 'S+9', 117, 0, 0),
    (c_id, 'Advantage Plus FU WL Pay 100', 'S+10', 122, 0, 0),
    (c_id, 'Advantage Plus FU WL Pay 100', 'S+11', 126.5, 0, 0),
    (c_id, 'Advantage Plus FU WL Pay 100', 'S+12', 131, 0, 0),
    (c_id, 'Advantage Plus FU WL Pay 100', 'S+13', 136, 0, 0),
    -- Prepared Accidental Death FYC
    (c_id, 'Prepared Accidental Death FYC', 'S+1', 95.5, 0, 0),
    (c_id, 'Prepared Accidental Death FYC', 'S+2', 101, 0, 0),
    (c_id, 'Prepared Accidental Death FYC', 'S+3', 107, 0, 0),
    (c_id, 'Prepared Accidental Death FYC', 'S+4', 112.5, 0, 0),
    (c_id, 'Prepared Accidental Death FYC', 'S+5', 118, 0, 0),
    (c_id, 'Prepared Accidental Death FYC', 'S+6', 124, 0, 0),
    (c_id, 'Prepared Accidental Death FYC', 'S+7', 129.5, 0, 0),
    (c_id, 'Prepared Accidental Death FYC', 'S+8', 135, 0, 0),
    (c_id, 'Prepared Accidental Death FYC', 'S+9', 140.5, 0, 0),
    (c_id, 'Prepared Accidental Death FYC', 'S+10', 146, 0, 0),
    (c_id, 'Prepared Accidental Death FYC', 'S+11', 152, 0, 0),
    (c_id, 'Prepared Accidental Death FYC', 'S+12', 157.5, 0, 0),
    (c_id, 'Prepared Accidental Death FYC', 'S+13', 163, 0, 0)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================
-- PRUDENTIAL — S+1(85%) through S+13(145%)
-- Also deletes wrong rows from migration 040000
-- ============================================================
DO $$
DECLARE c_id uuid;
BEGIN
  SELECT id INTO c_id FROM public.carriers WHERE name ILIKE '%prudential%' LIMIT 1;
  IF c_id IS NULL THEN RETURN; END IF;

  -- Remove incorrect rows inserted by migration 040000 (numeric level names)
  DELETE FROM public.commission_grids
  WHERE carrier_id = c_id
    AND level_name IN ('85','90','95','100','105','110','115','120','125','130','135','140','145');

  INSERT INTO public.commission_grids (carrier_id, product_name, level_name, year_1_pct, years_2_5_pct, years_6_plus_pct)
  VALUES
    -- Level Term
    (c_id, 'Level Term', 'S+1', 85, 0, 0),
    (c_id, 'Level Term', 'S+2', 90, 0, 0),
    (c_id, 'Level Term', 'S+3', 95, 0, 0),
    (c_id, 'Level Term', 'S+4', 100, 0, 0),
    (c_id, 'Level Term', 'S+5', 105, 0, 0),
    (c_id, 'Level Term', 'S+6', 110, 0, 0),
    (c_id, 'Level Term', 'S+7', 115, 0, 0),
    (c_id, 'Level Term', 'S+8', 120, 0, 0),
    (c_id, 'Level Term', 'S+9', 125, 0, 0),
    (c_id, 'Level Term', 'S+10', 130, 0, 0),
    (c_id, 'Level Term', 'S+11', 135, 0, 0),
    (c_id, 'Level Term', 'S+12', 140, 0, 0),
    (c_id, 'Level Term', 'S+13', 145, 0, 0),
    -- MP Term
    (c_id, 'MP Term', 'S+1', 85, 0, 0),
    (c_id, 'MP Term', 'S+2', 90, 0, 0),
    (c_id, 'MP Term', 'S+3', 95, 0, 0),
    (c_id, 'MP Term', 'S+4', 100, 0, 0),
    (c_id, 'MP Term', 'S+5', 105, 0, 0),
    (c_id, 'MP Term', 'S+6', 110, 0, 0),
    (c_id, 'MP Term', 'S+7', 115, 0, 0),
    (c_id, 'MP Term', 'S+8', 120, 0, 0),
    (c_id, 'MP Term', 'S+9', 125, 0, 0),
    (c_id, 'MP Term', 'S+10', 130, 0, 0),
    (c_id, 'MP Term', 'S+11', 135, 0, 0),
    (c_id, 'MP Term', 'S+12', 140, 0, 0),
    (c_id, 'MP Term', 'S+13', 145, 0, 0)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================
-- BALTIMORE LIFE — S+1(85%) through S+13(145%)
-- Also deletes wrong rows from migration 040000
-- ============================================================
DO $$
DECLARE c_id uuid;
BEGIN
  SELECT id INTO c_id FROM public.carriers WHERE name ILIKE '%baltimore life%' LIMIT 1;
  IF c_id IS NULL THEN RETURN; END IF;

  -- Remove incorrect rows inserted by migration 040000
  DELETE FROM public.commission_grids
  WHERE carrier_id = c_id
    AND level_name IN ('85','90','95','100','105','110','115','120','125','130','135','140','145');

  INSERT INTO public.commission_grids (carrier_id, product_name, level_name, year_1_pct, years_2_5_pct, years_6_plus_pct)
  VALUES
    -- iProvide (pct = level%)
    (c_id, 'iProvide', 'S+1', 85, 0, 0),
    (c_id, 'iProvide', 'S+2', 90, 0, 0),
    (c_id, 'iProvide', 'S+3', 95, 0, 0),
    (c_id, 'iProvide', 'S+4', 100, 0, 0),
    (c_id, 'iProvide', 'S+5', 105, 0, 0),
    (c_id, 'iProvide', 'S+6', 110, 0, 0),
    (c_id, 'iProvide', 'S+7', 115, 0, 0),
    (c_id, 'iProvide', 'S+8', 120, 0, 0),
    (c_id, 'iProvide', 'S+9', 125, 0, 0),
    (c_id, 'iProvide', 'S+10', 130, 0, 0),
    (c_id, 'iProvide', 'S+11', 135, 0, 0),
    (c_id, 'iProvide', 'S+12', 140, 0, 0),
    (c_id, 'iProvide', 'S+13', 145, 0, 0),
    -- A-Priority (scaled rates)
    (c_id, 'A-Priority', 'S+1', 69, 0, 0),
    (c_id, 'A-Priority', 'S+2', 73, 0, 0),
    (c_id, 'A-Priority', 'S+3', 77, 0, 0),
    (c_id, 'A-Priority', 'S+4', 81, 0, 0),
    (c_id, 'A-Priority', 'S+5', 85.5, 0, 0),
    (c_id, 'A-Priority', 'S+6', 89.5, 0, 0),
    (c_id, 'A-Priority', 'S+7', 93.5, 0, 0),
    (c_id, 'A-Priority', 'S+8', 97.5, 0, 0),
    (c_id, 'A-Priority', 'S+9', 101.5, 0, 0),
    (c_id, 'A-Priority', 'S+10', 105.5, 0, 0),
    (c_id, 'A-Priority', 'S+11', 109.5, 0, 0),
    (c_id, 'A-Priority', 'S+12', 114, 0, 0),
    (c_id, 'A-Priority', 'S+13', 118, 0, 0)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================
-- NEWBRIDGE — S+1(80%) through S+14(145%), 4 age-banded products
-- ============================================================
DO $$
DECLARE c_id uuid;
BEGIN
  SELECT id INTO c_id FROM public.carriers WHERE name ILIKE '%newbridge%' LIMIT 1;
  IF c_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.commission_grids (carrier_id, product_name, level_name, year_1_pct, years_2_5_pct, years_6_plus_pct)
  VALUES
    -- Level Death Benefit 0-79
    (c_id, 'Level Death Benefit 0-79', 'S+1', 80, 0, 0),
    (c_id, 'Level Death Benefit 0-79', 'S+2', 85, 0, 0),
    (c_id, 'Level Death Benefit 0-79', 'S+3', 90, 0, 0),
    (c_id, 'Level Death Benefit 0-79', 'S+4', 95, 0, 0),
    (c_id, 'Level Death Benefit 0-79', 'S+5', 100, 0, 0),
    (c_id, 'Level Death Benefit 0-79', 'S+6', 105, 0, 0),
    (c_id, 'Level Death Benefit 0-79', 'S+7', 110, 0, 0),
    (c_id, 'Level Death Benefit 0-79', 'S+8', 115, 0, 0),
    (c_id, 'Level Death Benefit 0-79', 'S+9', 120, 0, 0),
    (c_id, 'Level Death Benefit 0-79', 'S+10', 125, 0, 0),
    (c_id, 'Level Death Benefit 0-79', 'S+11', 130, 0, 0),
    (c_id, 'Level Death Benefit 0-79', 'S+12', 135, 0, 0),
    (c_id, 'Level Death Benefit 0-79', 'S+13', 140, 0, 0),
    (c_id, 'Level Death Benefit 0-79', 'S+14', 145, 0, 0),
    -- Level Death Benefit 80-85
    (c_id, 'Level Death Benefit 80-85', 'S+1', 42.5, 0, 0),
    (c_id, 'Level Death Benefit 80-85', 'S+2', 45.5, 0, 0),
    (c_id, 'Level Death Benefit 80-85', 'S+3', 48, 0, 0),
    (c_id, 'Level Death Benefit 80-85', 'S+4', 50.5, 0, 0),
    (c_id, 'Level Death Benefit 80-85', 'S+5', 53.5, 0, 0),
    (c_id, 'Level Death Benefit 80-85', 'S+6', 56, 0, 0),
    (c_id, 'Level Death Benefit 80-85', 'S+7', 58.5, 0, 0),
    (c_id, 'Level Death Benefit 80-85', 'S+8', 61.5, 0, 0),
    (c_id, 'Level Death Benefit 80-85', 'S+9', 64, 0, 0),
    (c_id, 'Level Death Benefit 80-85', 'S+10', 66.5, 0, 0),
    (c_id, 'Level Death Benefit 80-85', 'S+11', 69.5, 0, 0),
    (c_id, 'Level Death Benefit 80-85', 'S+12', 72, 0, 0),
    (c_id, 'Level Death Benefit 80-85', 'S+13', 74.5, 0, 0),
    (c_id, 'Level Death Benefit 80-85', 'S+14', 77.5, 0, 0),
    -- Modified Death Benefit 0-79
    (c_id, 'Modified Death Benefit 0-79', 'S+1', 69.5, 0, 0),
    (c_id, 'Modified Death Benefit 0-79', 'S+2', 73.5, 0, 0),
    (c_id, 'Modified Death Benefit 0-79', 'S+3', 78, 0, 0),
    (c_id, 'Modified Death Benefit 0-79', 'S+4', 82.5, 0, 0),
    (c_id, 'Modified Death Benefit 0-79', 'S+5', 86.5, 0, 0),
    (c_id, 'Modified Death Benefit 0-79', 'S+6', 91, 0, 0),
    (c_id, 'Modified Death Benefit 0-79', 'S+7', 95.5, 0, 0),
    (c_id, 'Modified Death Benefit 0-79', 'S+8', 99.5, 0, 0),
    (c_id, 'Modified Death Benefit 0-79', 'S+9', 104, 0, 0),
    (c_id, 'Modified Death Benefit 0-79', 'S+10', 108.5, 0, 0),
    (c_id, 'Modified Death Benefit 0-79', 'S+11', 112.5, 0, 0),
    (c_id, 'Modified Death Benefit 0-79', 'S+12', 117, 0, 0),
    (c_id, 'Modified Death Benefit 0-79', 'S+13', 121.5, 0, 0),
    (c_id, 'Modified Death Benefit 0-79', 'S+14', 125.5, 0, 0),
    -- Modified Death Benefit 80-85
    (c_id, 'Modified Death Benefit 80-85', 'S+1', 48, 0, 0),
    (c_id, 'Modified Death Benefit 80-85', 'S+2', 51, 0, 0),
    (c_id, 'Modified Death Benefit 80-85', 'S+3', 54, 0, 0),
    (c_id, 'Modified Death Benefit 80-85', 'S+4', 57, 0, 0),
    (c_id, 'Modified Death Benefit 80-85', 'S+5', 60, 0, 0),
    (c_id, 'Modified Death Benefit 80-85', 'S+6', 63, 0, 0),
    (c_id, 'Modified Death Benefit 80-85', 'S+7', 66, 0, 0),
    (c_id, 'Modified Death Benefit 80-85', 'S+8', 69, 0, 0),
    (c_id, 'Modified Death Benefit 80-85', 'S+9', 72, 0, 0),
    (c_id, 'Modified Death Benefit 80-85', 'S+10', 75, 0, 0),
    (c_id, 'Modified Death Benefit 80-85', 'S+11', 78, 0, 0),
    (c_id, 'Modified Death Benefit 80-85', 'S+12', 81, 0, 0),
    (c_id, 'Modified Death Benefit 80-85', 'S+13', 84, 0, 0),
    (c_id, 'Modified Death Benefit 80-85', 'S+14', 87, 0, 0)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================
-- ROYAL NEIGHBORS — S+1(80%) through S+14(145%), 12 products
-- ============================================================
DO $$
DECLARE c_id uuid;
BEGIN
  SELECT id INTO c_id FROM public.carriers WHERE name ILIKE '%royal neighbors%' LIMIT 1;
  IF c_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.commission_grids (carrier_id, product_name, level_name, year_1_pct, years_2_5_pct, years_6_plus_pct)
  VALUES
    -- Simplified Issue WL 50-75
    (c_id, 'Simplified Issue WL 50-75', 'S+1', 80, 0, 0),
    (c_id, 'Simplified Issue WL 50-75', 'S+2', 85, 0, 0),
    (c_id, 'Simplified Issue WL 50-75', 'S+3', 90, 0, 0),
    (c_id, 'Simplified Issue WL 50-75', 'S+4', 95, 0, 0),
    (c_id, 'Simplified Issue WL 50-75', 'S+5', 100, 0, 0),
    (c_id, 'Simplified Issue WL 50-75', 'S+6', 105, 0, 0),
    (c_id, 'Simplified Issue WL 50-75', 'S+7', 110, 0, 0),
    (c_id, 'Simplified Issue WL 50-75', 'S+8', 115, 0, 0),
    (c_id, 'Simplified Issue WL 50-75', 'S+9', 120, 0, 0),
    (c_id, 'Simplified Issue WL 50-75', 'S+10', 125, 0, 0),
    (c_id, 'Simplified Issue WL 50-75', 'S+11', 130, 0, 0),
    (c_id, 'Simplified Issue WL 50-75', 'S+12', 135, 0, 0),
    (c_id, 'Simplified Issue WL 50-75', 'S+13', 140, 0, 0),
    (c_id, 'Simplified Issue WL 50-75', 'S+14', 145, 0, 0),
    -- Simplified Issue WL 76-80
    (c_id, 'Simplified Issue WL 76-80', 'S+1', 64, 0, 0),
    (c_id, 'Simplified Issue WL 76-80', 'S+2', 68, 0, 0),
    (c_id, 'Simplified Issue WL 76-80', 'S+3', 72, 0, 0),
    (c_id, 'Simplified Issue WL 76-80', 'S+4', 76, 0, 0),
    (c_id, 'Simplified Issue WL 76-80', 'S+5', 80, 0, 0),
    (c_id, 'Simplified Issue WL 76-80', 'S+6', 84, 0, 0),
    (c_id, 'Simplified Issue WL 76-80', 'S+7', 88, 0, 0),
    (c_id, 'Simplified Issue WL 76-80', 'S+8', 92, 0, 0),
    (c_id, 'Simplified Issue WL 76-80', 'S+9', 96, 0, 0),
    (c_id, 'Simplified Issue WL 76-80', 'S+10', 100, 0, 0),
    (c_id, 'Simplified Issue WL 76-80', 'S+11', 104, 0, 0),
    (c_id, 'Simplified Issue WL 76-80', 'S+12', 108, 0, 0),
    (c_id, 'Simplified Issue WL 76-80', 'S+13', 112, 0, 0),
    (c_id, 'Simplified Issue WL 76-80', 'S+14', 116, 0, 0),
    -- Simplified Issue WL 81-85
    (c_id, 'Simplified Issue WL 81-85', 'S+1', 37.5, 0, 0),
    (c_id, 'Simplified Issue WL 81-85', 'S+2', 39.5, 0, 0),
    (c_id, 'Simplified Issue WL 81-85', 'S+3', 42, 0, 0),
    (c_id, 'Simplified Issue WL 81-85', 'S+4', 44.5, 0, 0),
    (c_id, 'Simplified Issue WL 81-85', 'S+5', 46.5, 0, 0),
    (c_id, 'Simplified Issue WL 81-85', 'S+6', 49, 0, 0),
    (c_id, 'Simplified Issue WL 81-85', 'S+7', 51.5, 0, 0),
    (c_id, 'Simplified Issue WL 81-85', 'S+8', 53.5, 0, 0),
    (c_id, 'Simplified Issue WL 81-85', 'S+9', 56, 0, 0),
    (c_id, 'Simplified Issue WL 81-85', 'S+10', 58.5, 0, 0),
    (c_id, 'Simplified Issue WL 81-85', 'S+11', 60.5, 0, 0),
    (c_id, 'Simplified Issue WL 81-85', 'S+12', 63, 0, 0),
    (c_id, 'Simplified Issue WL 81-85', 'S+13', 65.5, 0, 0),
    (c_id, 'Simplified Issue WL 81-85', 'S+14', 67.5, 0, 0),
    -- Graded Death Benefit 50-75
    (c_id, 'Graded Death Benefit 50-75', 'S+1', 53.5, 0, 0),
    (c_id, 'Graded Death Benefit 50-75', 'S+2', 56.5, 0, 0),
    (c_id, 'Graded Death Benefit 50-75', 'S+3', 60, 0, 0),
    (c_id, 'Graded Death Benefit 50-75', 'S+4', 63.5, 0, 0),
    (c_id, 'Graded Death Benefit 50-75', 'S+5', 66.5, 0, 0),
    (c_id, 'Graded Death Benefit 50-75', 'S+6', 70, 0, 0),
    (c_id, 'Graded Death Benefit 50-75', 'S+7', 73.5, 0, 0),
    (c_id, 'Graded Death Benefit 50-75', 'S+8', 76.5, 0, 0),
    (c_id, 'Graded Death Benefit 50-75', 'S+9', 80, 0, 0),
    (c_id, 'Graded Death Benefit 50-75', 'S+10', 83.5, 0, 0),
    (c_id, 'Graded Death Benefit 50-75', 'S+11', 86.5, 0, 0),
    (c_id, 'Graded Death Benefit 50-75', 'S+12', 90, 0, 0),
    (c_id, 'Graded Death Benefit 50-75', 'S+13', 93.5, 0, 0),
    (c_id, 'Graded Death Benefit 50-75', 'S+14', 96.5, 0, 0),
    -- Graded Death Benefit 76-80
    (c_id, 'Graded Death Benefit 76-80', 'S+1', 42.5, 0, 0),
    (c_id, 'Graded Death Benefit 76-80', 'S+2', 45.5, 0, 0),
    (c_id, 'Graded Death Benefit 76-80', 'S+3', 48, 0, 0),
    (c_id, 'Graded Death Benefit 76-80', 'S+4', 50.5, 0, 0),
    (c_id, 'Graded Death Benefit 76-80', 'S+5', 53.5, 0, 0),
    (c_id, 'Graded Death Benefit 76-80', 'S+6', 56, 0, 0),
    (c_id, 'Graded Death Benefit 76-80', 'S+7', 58.5, 0, 0),
    (c_id, 'Graded Death Benefit 76-80', 'S+8', 61.5, 0, 0),
    (c_id, 'Graded Death Benefit 76-80', 'S+9', 64, 0, 0),
    (c_id, 'Graded Death Benefit 76-80', 'S+10', 66.5, 0, 0),
    (c_id, 'Graded Death Benefit 76-80', 'S+11', 69.5, 0, 0),
    (c_id, 'Graded Death Benefit 76-80', 'S+12', 72, 0, 0),
    (c_id, 'Graded Death Benefit 76-80', 'S+13', 74.5, 0, 0),
    (c_id, 'Graded Death Benefit 76-80', 'S+14', 77.5, 0, 0),
    -- Graded Death Benefit 81-85
    (c_id, 'Graded Death Benefit 81-85', 'S+1', 32, 0, 0),
    (c_id, 'Graded Death Benefit 81-85', 'S+2', 34, 0, 0),
    (c_id, 'Graded Death Benefit 81-85', 'S+3', 36, 0, 0),
    (c_id, 'Graded Death Benefit 81-85', 'S+4', 38, 0, 0),
    (c_id, 'Graded Death Benefit 81-85', 'S+5', 40, 0, 0),
    (c_id, 'Graded Death Benefit 81-85', 'S+6', 42, 0, 0),
    (c_id, 'Graded Death Benefit 81-85', 'S+7', 44, 0, 0),
    (c_id, 'Graded Death Benefit 81-85', 'S+8', 46, 0, 0),
    (c_id, 'Graded Death Benefit 81-85', 'S+9', 48, 0, 0),
    (c_id, 'Graded Death Benefit 81-85', 'S+10', 50, 0, 0),
    (c_id, 'Graded Death Benefit 81-85', 'S+11', 52, 0, 0),
    (c_id, 'Graded Death Benefit 81-85', 'S+12', 54, 0, 0),
    (c_id, 'Graded Death Benefit 81-85', 'S+13', 56, 0, 0),
    (c_id, 'Graded Death Benefit 81-85', 'S+14', 58, 0, 0),
    -- Guaranteed Issue WL Band 1
    (c_id, 'Guaranteed Issue WL Band 1', 'S+1', 11.5, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 1', 'S+2', 12.5, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 1', 'S+3', 13, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 1', 'S+4', 14, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 1', 'S+5', 14.5, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 1', 'S+6', 15.5, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 1', 'S+7', 16, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 1', 'S+8', 17, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 1', 'S+9', 17.5, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 1', 'S+10', 18.5, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 1', 'S+11', 19, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 1', 'S+12', 20, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 1', 'S+13', 20.5, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 1', 'S+14', 21.5, 0, 0),
    -- Guaranteed Issue WL Band 2
    (c_id, 'Guaranteed Issue WL Band 2', 'S+1', 9, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 2', 'S+2', 9.5, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 2', 'S+3', 10, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 2', 'S+4', 10, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 2', 'S+5', 11, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 2', 'S+6', 11.5, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 2', 'S+7', 12, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 2', 'S+8', 12.5, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 2', 'S+9', 13, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 2', 'S+10', 13.5, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 2', 'S+11', 14, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 2', 'S+12', 14.5, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 2', 'S+13', 15.5, 0, 0),
    (c_id, 'Guaranteed Issue WL Band 2', 'S+14', 16.5, 0, 0),
    -- Single Premium WL
    (c_id, 'Single Premium WL', 'S+1', 7.5, 0, 0),
    (c_id, 'Single Premium WL', 'S+2', 8, 0, 0),
    (c_id, 'Single Premium WL', 'S+3', 8.5, 0, 0),
    (c_id, 'Single Premium WL', 'S+4', 9, 0, 0),
    (c_id, 'Single Premium WL', 'S+5', 9.5, 0, 0),
    (c_id, 'Single Premium WL', 'S+6', 10, 0, 0),
    (c_id, 'Single Premium WL', 'S+7', 10, 0, 0),
    (c_id, 'Single Premium WL', 'S+8', 10.5, 0, 0),
    (c_id, 'Single Premium WL', 'S+9', 11, 0, 0),
    (c_id, 'Single Premium WL', 'S+10', 11.5, 0, 0),
    (c_id, 'Single Premium WL', 'S+11', 12, 0, 0),
    (c_id, 'Single Premium WL', 'S+12', 12.5, 0, 0),
    (c_id, 'Single Premium WL', 'S+13', 13, 0, 0),
    (c_id, 'Single Premium WL', 'S+14', 13.5, 0, 0),
    -- Jet WL Band 1
    (c_id, 'Jet WL Band 1', 'S+1', 53.5, 0, 0),
    (c_id, 'Jet WL Band 1', 'S+2', 56.5, 0, 0),
    (c_id, 'Jet WL Band 1', 'S+3', 60, 0, 0),
    (c_id, 'Jet WL Band 1', 'S+4', 63.5, 0, 0),
    (c_id, 'Jet WL Band 1', 'S+5', 66.5, 0, 0),
    (c_id, 'Jet WL Band 1', 'S+6', 70, 0, 0),
    (c_id, 'Jet WL Band 1', 'S+7', 73.5, 0, 0),
    (c_id, 'Jet WL Band 1', 'S+8', 76.5, 0, 0),
    (c_id, 'Jet WL Band 1', 'S+9', 80, 0, 0),
    (c_id, 'Jet WL Band 1', 'S+10', 83.5, 0, 0),
    (c_id, 'Jet WL Band 1', 'S+11', 86.5, 0, 0),
    (c_id, 'Jet WL Band 1', 'S+12', 90, 0, 0),
    (c_id, 'Jet WL Band 1', 'S+13', 93.5, 0, 0),
    (c_id, 'Jet WL Band 1', 'S+14', 96.5, 0, 0),
    -- Jet WL Band 2
    (c_id, 'Jet WL Band 2', 'S+1', 80, 0, 0),
    (c_id, 'Jet WL Band 2', 'S+2', 85, 0, 0),
    (c_id, 'Jet WL Band 2', 'S+3', 90, 0, 0),
    (c_id, 'Jet WL Band 2', 'S+4', 95, 0, 0),
    (c_id, 'Jet WL Band 2', 'S+5', 100, 0, 0),
    (c_id, 'Jet WL Band 2', 'S+6', 105, 0, 0),
    (c_id, 'Jet WL Band 2', 'S+7', 110, 0, 0),
    (c_id, 'Jet WL Band 2', 'S+8', 115, 0, 0),
    (c_id, 'Jet WL Band 2', 'S+9', 120, 0, 0),
    (c_id, 'Jet WL Band 2', 'S+10', 125, 0, 0),
    (c_id, 'Jet WL Band 2', 'S+11', 130, 0, 0),
    (c_id, 'Jet WL Band 2', 'S+12', 135, 0, 0),
    (c_id, 'Jet WL Band 2', 'S+13', 140, 0, 0),
    (c_id, 'Jet WL Band 2', 'S+14', 145, 0, 0),
    -- Jet Youth Whole Life
    (c_id, 'Jet Youth Whole Life', 'S+1', 53.5, 0, 0),
    (c_id, 'Jet Youth Whole Life', 'S+2', 56.5, 0, 0),
    (c_id, 'Jet Youth Whole Life', 'S+3', 60, 0, 0),
    (c_id, 'Jet Youth Whole Life', 'S+4', 63.5, 0, 0),
    (c_id, 'Jet Youth Whole Life', 'S+5', 66.5, 0, 0),
    (c_id, 'Jet Youth Whole Life', 'S+6', 70, 0, 0),
    (c_id, 'Jet Youth Whole Life', 'S+7', 73.5, 0, 0),
    (c_id, 'Jet Youth Whole Life', 'S+8', 76.5, 0, 0),
    (c_id, 'Jet Youth Whole Life', 'S+9', 80, 0, 0),
    (c_id, 'Jet Youth Whole Life', 'S+10', 83.5, 0, 0),
    (c_id, 'Jet Youth Whole Life', 'S+11', 86.5, 0, 0),
    (c_id, 'Jet Youth Whole Life', 'S+12', 90, 0, 0),
    (c_id, 'Jet Youth Whole Life', 'S+13', 93.5, 0, 0),
    (c_id, 'Jet Youth Whole Life', 'S+14', 96.5, 0, 0)
  ON CONFLICT DO NOTHING;
END $$;
