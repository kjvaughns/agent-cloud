
-- 1. Profile columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS npn_number text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS street_address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS zip_code text;

-- 2. Scripts extensions
ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS long_description text,
  ADD COLUMN IF NOT EXISTS content_html text,
  ADD COLUMN IF NOT EXISTS accent_color text,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- 3. Handbook sections
CREATE TABLE IF NOT EXISTS public.handbook_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  content_html text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.handbook_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS handbook_read ON public.handbook_sections;
CREATE POLICY handbook_read ON public.handbook_sections FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS handbook_admin_write ON public.handbook_sections;
CREATE POLICY handbook_admin_write ON public.handbook_sections FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4. Academy courses
CREATE TABLE IF NOT EXISTS public.academy_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  category text NOT NULL,
  instructor_name text,
  duration_minutes integer DEFAULT 0,
  module_count integer DEFAULT 0,
  thumbnail_url text,
  description text,
  sort_order integer DEFAULT 0,
  published boolean DEFAULT true,
  featured boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.academy_courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS academy_courses_read ON public.academy_courses;
CREATE POLICY academy_courses_read ON public.academy_courses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS academy_courses_admin_write ON public.academy_courses;
CREATE POLICY academy_courses_admin_write ON public.academy_courses FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 5. Academy modules
CREATE TABLE IF NOT EXISTS public.academy_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.academy_courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order integer DEFAULT 0,
  video_url text,
  content_html text,
  quiz jsonb,
  resource_urls jsonb
);
ALTER TABLE public.academy_modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS academy_modules_read ON public.academy_modules;
CREATE POLICY academy_modules_read ON public.academy_modules FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS academy_modules_admin_write ON public.academy_modules;
CREATE POLICY academy_modules_admin_write ON public.academy_modules FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 6. Course progress
CREATE TABLE IF NOT EXISTS public.course_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES public.academy_courses(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.academy_modules(id) ON DELETE CASCADE,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  quiz_score integer,
  UNIQUE(agent_id, module_id)
);
ALTER TABLE public.course_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS course_progress_owner_select ON public.course_progress;
CREATE POLICY course_progress_owner_select ON public.course_progress FOR SELECT TO authenticated
  USING ((agent_id = auth.uid()) OR is_in_downline(auth.uid(), agent_id) OR has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS course_progress_owner_modify ON public.course_progress;
CREATE POLICY course_progress_owner_modify ON public.course_progress FOR ALL TO authenticated
  USING ((agent_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK ((agent_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- 7. Seed handbook
INSERT INTO public.handbook_sections (sort_order, title, slug, content_html) VALUES
(1, 'Welcome to Agent Cloud', 'welcome', '<h2>Welcome to Agent Cloud</h2><p>You''ve joined a community of independent life insurance agents committed to protecting families and building generational wealth. This handbook is your reference for everything you need to succeed.</p><h3>Our Mission</h3><p>To empower independent agents with the technology, training, and carrier relationships to build thriving practices serving middle-American families.</p><h3>What You Get</h3><ul><li>Access to 40+ top-rated carriers</li><li>Industry-leading commission levels</li><li>Built-in CRM, dialer, and AI assistant</li><li>Free training and ongoing coaching</li><li>Same-day commission advances on most carriers</li></ul>'),
(2, 'Your Commission Structure', 'commissions', '<h2>Your Commission Structure</h2><p>Agent Cloud agents earn commissions based on contract level with each carrier. New agents typically start at 80-90% and graduate to 110%+ as production grows.</p><h3>How You Get Paid</h3><ul><li><strong>Advances:</strong> Up to 75% of annual premium paid within 24-48 hours of policy issue</li><li><strong>As-Earned:</strong> Remaining commission paid monthly as premium is collected</li><li><strong>Renewals:</strong> Years 2+ commissions paid on persisting business</li></ul><h3>Chargebacks</h3><p>If a client cancels in the first 12 months, advanced commission is charged back proportionally. Maintaining 75%+ persistency is critical to long-term earnings.</p>'),
(3, 'Carrier Guidelines', 'carriers', '<h2>Carrier Guidelines</h2><p>Each carrier has unique underwriting, products, and submission requirements. Always check the carrier portal before quoting.</p><h3>Top Final Expense Carriers</h3><ul><li>Mutual of Omaha</li><li>Royal Neighbors</li><li>Aetna/CVS</li><li>Liberty Bankers</li></ul><h3>Best Practices</h3><ul><li>Always run a drug check before quoting</li><li>Match medications to carrier underwriting</li><li>Submit clean apps the first time</li><li>Follow up within 24 hours of any underwriting request</li></ul>'),
(4, 'Client Interaction Standards', 'client-standards', '<h2>Client Interaction Standards</h2><p>How you treat clients reflects on you, your team, and every Agent Cloud agent. We hold ourselves to a higher standard.</p><h3>Required Practices</h3><ul><li>Always identify yourself as an independent broker</li><li>Disclose that you''re recording calls before recording</li><li>Use approved scripts as your foundation</li><li>Never pressure a client into a sale</li><li>Always present the lowest-cost option that meets their needs</li></ul><h3>Communication Standards</h3><ul><li>Return all client calls within 4 business hours</li><li>Respond to texts within 1 hour during business hours</li><li>Send a thank-you message after every appointment</li></ul>'),
(5, 'Compliance Requirements', 'compliance', '<h2>Compliance Requirements</h2><p>Staying compliant protects your license, your clients, and your business.</p><h3>Required Documents</h3><ul><li>Active life insurance license in every state you write</li><li>Current E&O insurance ($1M minimum)</li><li>Annual AML certification</li><li>Carrier-specific product training (Annuities, IUL)</li></ul><h3>Reportable Events</h3><p>You must notify Agent Cloud within 7 days of:</p><ul><li>Any DOI complaint</li><li>License suspension or revocation</li><li>Criminal charges</li><li>Bankruptcy filing</li></ul>'),
(6, 'Recruiting Best Practices', 'recruiting', '<h2>Recruiting Best Practices</h2><p>Building a team is the fastest path to financial freedom in this business. But recruiting the wrong people will sink you.</p><h3>What to Look For</h3><ul><li>Coachable attitude (not a know-it-all)</li><li>Strong work ethic</li><li>Financial motivation (skin in the game)</li><li>Clean background</li></ul><h3>The First 30 Days</h3><p>Set clear expectations on day one: daily activity, weekly check-ins, monthly production targets. Agents who don''t hit minimum activity in 30 days rarely make it.</p>'),
(7, 'Technology Tools', 'tools', '<h2>Technology Tools</h2><p>Agent Cloud includes everything you need in one platform.</p><h3>Core Tools</h3><ul><li><strong>Pipeline:</strong> Track every client from lead to issued policy</li><li><strong>My Phone:</strong> Call and text from a business number</li><li><strong>AI Assistant:</strong> Get instant answers on products and underwriting</li><li><strong>Calendar:</strong> Schedule appointments with auto-reminders</li><li><strong>Book of Business:</strong> Manage your active policies and renewals</li></ul><h3>Wallet & Billing</h3><p>SMS, calls, and AI features draw from your wallet. Keep a $20+ balance to avoid service interruption.</p>')
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title, content_html = EXCLUDED.content_html, sort_order = EXCLUDED.sort_order, updated_at = now();

-- 8. Seed scripts — clear and re-insert
DELETE FROM public.scripts WHERE category IN ('basic','needs_analysis','objection_handling','mortgage_protection','beneficiary','check_in');
INSERT INTO public.scripts (title, category, short_description, long_description, content_html, accent_color, sort_order, content_markdown) VALUES
('Basic Sales Script', 'basic', 'Your starting point for every client conversation.', 'A simple, proven opening script that establishes rapport, explains who you are, and gets clients talking. Perfect for new agents still building confidence.', '<h3>OPENING</h3><p><strong>Agent:</strong> Hi, is this [Client Name]? Great — this is [Your Name] with Agent Cloud. The reason I''m calling is you recently requested information about life insurance. Do you remember filling that out?</p><p><em>(If yes, continue. If no, gently remind them: "It was the form about protecting your family — does that ring a bell?")</em></p><blockquote><strong>💡 TIP:</strong> Pause here and let them answer fully. Don''t rush.</blockquote><h3>TRANSITION</h3><p><strong>Agent:</strong> Perfect. The reason for the call today is simply to find out what you''re looking to do. Have you ever had life insurance before, or would this be your first policy?</p><h3>PRESENTATION</h3><p><strong>Agent:</strong> Based on what you''ve told me, I think [Carrier] would be a great fit. Their coverage is [X], the monthly premium is [Y], and they can have you covered as soon as today. How does that sound?</p><h3>CLOSE</h3><p><strong>Agent:</strong> The next step is just a quick application — about 10 minutes over the phone. Are you in front of a computer or do you have your driver''s license handy?</p>', '#3b82f6', 1, ''),
('Script with Needs Analysis', 'needs_analysis', 'Guide clients through their coverage needs step by step.', 'Combines your opening script with a structured needs analysis to uncover income, health, and family situation. Leads naturally into presenting solutions.', '<h3>OPENING</h3><p><strong>Agent:</strong> Hi [Client Name], this is [Your Name] with Agent Cloud. You recently asked for some info on life insurance — got a minute to chat?</p><h3>NEEDS ANALYSIS</h3><p><strong>Agent:</strong> Before I give you any numbers, I want to make sure we get you the right coverage. Mind if I ask a few quick questions?</p><ul><li>Are you currently married? Any children at home?</li><li>Do you own your home or rent?</li><li>What''s your approximate monthly income?</li><li>Do you have any existing life insurance?</li><li>Any major health issues I should know about?</li></ul><blockquote><strong>💡 TIP:</strong> Take notes. Repeat their answers back to confirm.</blockquote><h3>PRESENTATION</h3><p><strong>Agent:</strong> Based on what you shared, here''s what I''d recommend...</p><h3>CLOSE</h3><p><strong>Agent:</strong> Ready to lock this in today? I just need a few minutes to fill out the application.</p>', '#10b981', 2, ''),
('Objection Handling Guide', 'objection_handling', 'Turn "I need to think about it" into a closed deal.', 'The most common objections with proven word-for-word responses. Covers price, timing, spouse objections, and "I already have coverage."', '<h2>"I Need to Think About It"</h2><p><strong>Agent:</strong> I totally understand. Just so I''m clear — is there something specific about the coverage you want to think over, or is it more about whether to do it at all?</p><h2>"It''s Too Expensive"</h2><p><strong>Agent:</strong> I hear you. Let me ask — if money weren''t the issue, would the coverage make sense? Okay, so let''s find an option that fits the budget. What''s comfortable per month?</p><h2>"I Need to Talk to My Spouse"</h2><p><strong>Agent:</strong> Absolutely, that''s smart. Is your spouse available now? Let''s get them on the line — that way you can decide together and not have to call me back.</p><h2>"I Already Have Coverage"</h2><p><strong>Agent:</strong> Great! Can you tell me what you have? Often we find folks are paying too much or underinsured. Worth a 5-minute comparison to make sure you''re in the best spot, right?</p>', '#ef4444', 3, ''),
('Mortgage Protection Script', 'mortgage_protection', 'Purpose-built for homeowners who just purchased.', 'Opens with the mortgage connection, explains what happens to the home if something happens to them, and positions life insurance as home protection — not life insurance.', '<h3>OPENING</h3><p><strong>Agent:</strong> Hi [Client], this is [Your Name]. I''m reaching out because you recently purchased a home — congratulations! The reason for the call is to talk about protecting that home in case something happens to you. Got a quick minute?</p><h3>EDUCATION</h3><p><strong>Agent:</strong> Here''s the thing most homeowners don''t realize — if something happens to you, the mortgage doesn''t go away. Your family would still owe [$XXX,XXX]. What we do is set up a policy that pays off the mortgage in full, so your family keeps the home no matter what.</p><h3>PRESENTATION</h3><p><strong>Agent:</strong> For someone your age in good health, this typically runs [$X-Y]/month for full mortgage coverage. That''s less than your cable bill.</p><h3>CLOSE</h3><p><strong>Agent:</strong> Let''s get you protected today. I just need a few minutes for the application.</p>', '#a855f7', 4, ''),
('Beneficiary Script', 'beneficiary', 'Re-engage existing clients and protect policy retention.', 'Check in with existing clients about their beneficiary designations, review coverage needs, and identify opportunities for additional policies or referrals.', '<h3>OPENING</h3><p><strong>Agent:</strong> Hi [Client], this is [Your Name] from Agent Cloud — your life insurance agent. Just doing my annual check-in to make sure everything''s still good with your policy. Got 5 minutes?</p><h3>BENEFICIARY REVIEW</h3><p><strong>Agent:</strong> First thing I want to confirm — your beneficiary on file is [Name]. Any changes there? New marriage, divorce, kids, anything like that?</p><h3>COVERAGE REVIEW</h3><p><strong>Agent:</strong> Has anything changed in your life since we set this up? New home, new baby, raise at work? Those are all good reasons to look at increasing coverage.</p><h3>REFERRAL ASK</h3><p><strong>Agent:</strong> One last thing — who do you know that just bought a home or had a baby? I''d love to help them out the same way I helped you.</p>', '#f97316', 5, ''),
('Client Check-In Script', 'check_in', 'Stay top of mind with your existing book of business.', 'A 3-minute check-in call that builds loyalty, uncovers life changes that create new insurance needs, and generates referrals organically.', '<h3>OPENING</h3><p><strong>Agent:</strong> Hey [Client], it''s [Your Name]. No emergency — just my quarterly check-in. How have you been?</p><h3>RELATIONSHIP BUILDING</h3><p><strong>Agent:</strong> How''s the family? How''s work? Anything new going on?</p><blockquote><strong>💡 TIP:</strong> Genuinely listen. Take notes for next time.</blockquote><h3>SOFT CHECK</h3><p><strong>Agent:</strong> Quick question — is everything still good with the policy? Premium still working in the budget?</p><h3>REFERRAL ASK</h3><p><strong>Agent:</strong> Last thing — I''m taking on a few new clients this month. Anyone come to mind that could use what I do?</p>', '#14b8a6', 6, '');

-- 9. Seed academy
INSERT INTO public.academy_courses (title, slug, category, instructor_name, duration_minutes, module_count, description, sort_order, featured) VALUES
('Final Expense Mastery', 'final-expense-mastery', 'Sales Skills', 'Mark Johnson', 150, 6, 'Learn the proven system for closing final expense cases.', 1, true),
('Mortgage Protection Blueprint', 'mortgage-protection-blueprint', 'Sales Skills', 'Sarah Chen', 90, 4, 'The complete playbook for selling mortgage protection to homeowners.', 2, false),
('IUL Deep Dive', 'iul-deep-dive', 'Product Knowledge', 'David Martinez', 180, 8, 'Master indexed universal life — products, illustrations, and presentations.', 3, false),
('Objection Handling Workshop', 'objection-handling-workshop', 'Sales Skills', 'Mark Johnson', 60, 3, 'Word-for-word responses to the 20 most common objections.', 4, false),
('Medicare Sales 101', 'medicare-sales-101', 'Product Knowledge', 'Linda Park', 120, 5, 'Get started selling Medicare Advantage and Supplement plans.', 5, false),
('Recruiting & Building Your Team', 'recruiting-building-team', 'Recruiting', 'James Wilson', 120, 6, 'How to attract, hire, and retain top-producing agents.', 6, false),
('Compliance Essentials', 'compliance-essentials', 'Compliance', 'Rachel Adams', 60, 4, 'Stay compliant and protect your license.', 7, false),
('Agent Cloud Platform Training', 'platform-training', 'Technology', 'Agent Cloud Team', 45, 3, 'Get the most out of every feature in Agent Cloud.', 8, false)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title, category = EXCLUDED.category, duration_minutes = EXCLUDED.duration_minutes,
  module_count = EXCLUDED.module_count, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order,
  featured = EXCLUDED.featured;

-- 10. Seed states_reference
INSERT INTO public.states_reference (state_code, state_name, timezone, license_fee_cents, doi_url, prelicensing_url) VALUES
('AL','Alabama','Central',7000,'https://aldoi.gov','https://www.kaplan.com/insurance/alabama'),
('AK','Alaska','Pacific',8000,'https://www.commerce.alaska.gov/web/ins','https://www.kaplan.com/insurance/alaska'),
('AZ','Arizona','Mountain',6000,'https://difi.az.gov','https://www.kaplan.com/insurance/arizona'),
('AR','Arkansas','Central',7000,'https://insurance.arkansas.gov','https://www.kaplan.com/insurance/arkansas'),
('CA','California','Pacific',18800,'https://insurance.ca.gov','https://www.kaplan.com/insurance/california'),
('CO','Colorado','Mountain',6000,'https://doi.colorado.gov','https://www.kaplan.com/insurance/colorado'),
('CT','Connecticut','Eastern',8000,'https://portal.ct.gov/cid','https://www.kaplan.com/insurance/connecticut'),
('DE','Delaware','Eastern',7000,'https://insurance.delaware.gov','https://www.kaplan.com/insurance/delaware'),
('DC','District of Columbia','Eastern',8000,'https://disb.dc.gov','https://www.kaplan.com/insurance/dc'),
('FL','Florida','Eastern',10500,'https://www.myfloridacfo.com','https://www.kaplan.com/insurance/florida'),
('GA','Georgia','Eastern',7000,'https://oci.georgia.gov','https://www.kaplan.com/insurance/georgia'),
('HI','Hawaii','Pacific',6500,'https://cca.hawaii.gov/ins','https://www.kaplan.com/insurance/hawaii'),
('ID','Idaho','Mountain',8000,'https://doi.idaho.gov','https://www.kaplan.com/insurance/idaho'),
('IL','Illinois','Central',18000,'https://idoi.illinois.gov','https://www.kaplan.com/insurance/illinois'),
('IN','Indiana','Eastern',4000,'https://www.in.gov/idoi','https://www.kaplan.com/insurance/indiana'),
('IA','Iowa','Central',5000,'https://iid.iowa.gov','https://www.kaplan.com/insurance/iowa'),
('KS','Kansas','Central',3000,'https://insurance.kansas.gov','https://www.kaplan.com/insurance/kansas'),
('KY','Kentucky','Eastern',6000,'https://insurance.ky.gov','https://www.kaplan.com/insurance/kentucky'),
('LA','Louisiana','Central',5000,'https://ldi.la.gov','https://www.kaplan.com/insurance/louisiana'),
('ME','Maine','Eastern',5500,'https://www.maine.gov/pfr/insurance','https://www.kaplan.com/insurance/maine'),
('MD','Maryland','Eastern',5400,'https://insurance.maryland.gov','https://www.kaplan.com/insurance/maryland'),
('MA','Massachusetts','Eastern',22500,'https://www.mass.gov/orgs/division-of-insurance','https://www.kaplan.com/insurance/massachusetts'),
('MI','Michigan','Eastern',500,'https://www.michigan.gov/difs','https://www.kaplan.com/insurance/michigan'),
('MN','Minnesota','Central',4000,'https://www.commerce.state.mn.us','https://www.kaplan.com/insurance/minnesota'),
('MS','Mississippi','Central',5000,'https://mid.ms.gov','https://www.kaplan.com/insurance/mississippi'),
('MO','Missouri','Central',10000,'https://insurance.mo.gov','https://www.kaplan.com/insurance/missouri'),
('MT','Montana','Mountain',4000,'https://csimt.gov','https://www.kaplan.com/insurance/montana'),
('NE','Nebraska','Central',5000,'https://doi.nebraska.gov','https://www.kaplan.com/insurance/nebraska'),
('NV','Nevada','Pacific',12500,'https://doi.nv.gov','https://www.kaplan.com/insurance/nevada'),
('NH','New Hampshire','Eastern',21000,'https://www.nh.gov/insurance','https://www.kaplan.com/insurance/new-hampshire'),
('NJ','New Jersey','Eastern',17000,'https://www.state.nj.us/dobi','https://www.kaplan.com/insurance/new-jersey'),
('NM','New Mexico','Mountain',6000,'https://www.osi.state.nm.us','https://www.kaplan.com/insurance/new-mexico'),
('NY','New York','Eastern',8000,'https://www.dfs.ny.gov','https://www.kaplan.com/insurance/new-york'),
('NC','North Carolina','Eastern',5000,'https://www.ncdoi.gov','https://www.kaplan.com/insurance/north-carolina'),
('ND','North Dakota','Central',10000,'https://www.insurance.nd.gov','https://www.kaplan.com/insurance/north-dakota'),
('OH','Ohio','Eastern',6500,'https://insurance.ohio.gov','https://www.kaplan.com/insurance/ohio'),
('OK','Oklahoma','Central',9000,'https://www.oid.ok.gov','https://www.kaplan.com/insurance/oklahoma'),
('OR','Oregon','Pacific',5500,'https://dfr.oregon.gov','https://www.kaplan.com/insurance/oregon'),
('PA','Pennsylvania','Eastern',5500,'https://www.insurance.pa.gov','https://www.kaplan.com/insurance/pennsylvania'),
('RI','Rhode Island','Eastern',7500,'https://dbr.ri.gov/insurance','https://www.kaplan.com/insurance/rhode-island'),
('SC','South Carolina','Eastern',4000,'https://doi.sc.gov','https://www.kaplan.com/insurance/south-carolina'),
('SD','South Dakota','Central',3000,'https://dlr.sd.gov/insurance','https://www.kaplan.com/insurance/south-dakota'),
('TN','Tennessee','Central',5000,'https://www.tn.gov/commerce/insurance','https://www.kaplan.com/insurance/tennessee'),
('TX','Texas','Central',5000,'https://www.tdi.texas.gov','https://www.kaplan.com/insurance/texas'),
('UT','Utah','Mountain',7500,'https://insurance.utah.gov','https://www.kaplan.com/insurance/utah'),
('VT','Vermont','Eastern',6000,'https://dfr.vermont.gov','https://www.kaplan.com/insurance/vermont'),
('VA','Virginia','Eastern',1300,'https://scc.virginia.gov/pages/Insurance','https://www.kaplan.com/insurance/virginia'),
('WA','Washington','Pacific',5500,'https://www.insurance.wa.gov','https://www.kaplan.com/insurance/washington'),
('WV','West Virginia','Eastern',2500,'https://www.wvinsurance.gov','https://www.kaplan.com/insurance/west-virginia'),
('WI','Wisconsin','Central',3500,'https://oci.wi.gov','https://www.kaplan.com/insurance/wisconsin'),
('WY','Wyoming','Mountain',10000,'https://doi.wyo.gov','https://www.kaplan.com/insurance/wyoming')
ON CONFLICT (state_code) DO UPDATE SET
  state_name = EXCLUDED.state_name, timezone = EXCLUDED.timezone, license_fee_cents = EXCLUDED.license_fee_cents,
  doi_url = EXCLUDED.doi_url, prelicensing_url = EXCLUDED.prelicensing_url;
