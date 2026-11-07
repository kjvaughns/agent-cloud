UPDATE public.organizations SET accent_color = CASE accent_color
 WHEN 'oklch(0.65 0.11 80)' THEN '#CBA35A' WHEN 'oklch(0.45 0.12 255)' THEN '#2F5DA8'
 WHEN 'oklch(0.5 0.13 155)' THEN '#2E8B57' WHEN 'oklch(0.52 0.18 25)' THEN '#C0392B'
 WHEN 'oklch(0.45 0.15 300)' THEN '#7B3FA0' WHEN 'oklch(0.25 0.01 85)' THEN '#2B2925' ELSE accent_color END
WHERE accent_color LIKE 'oklch(%';