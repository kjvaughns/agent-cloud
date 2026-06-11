-- ─── Back Office & Resources content overhaul ──────────────────────────────
-- Seeds handbook_sections, scripts, and academy_courses with real APEX content.

-- academy_courses needs an external link column for courses hosted off-platform
ALTER TABLE public.academy_courses ADD COLUMN IF NOT EXISTS url text;

-- ─── HANDBOOK SECTIONS ─────────────────────────────────────────────────────
TRUNCATE public.handbook_sections CASCADE;

INSERT INTO public.handbook_sections (slug, title, sort_order, content_html) VALUES

('welcome', 'Welcome to APEX Financial Empire', 1, '
<h2>Welcome to APEX Financial Empire</h2>
<p>You''ve made one of the best decisions of your career. APEX Financial Empire is a 100% virtual life insurance FMO operating nationally, built on the belief that the right system, training, and culture can take any motivated person from zero to a thriving six-figure income.</p>
<p>This handbook is your operating manual. Read it once when you join, and refer back to it whenever you have questions. Everything from how we dial, to how commissions are paid, to how you grow your own agency is in here.</p>
<h3>Our Mission</h3>
<p>To help families across America protect what matters most, while building generational wealth for the agents and agency owners who serve them.</p>
<h3>What We Do</h3>
<p>We sell final expense and term life insurance primarily to seniors ages 50–85 via predictive dialer (Readymode). Our average sale is approximately $1,500 ALP (annual list price). Our agents work from home, set their own schedules, and are paid on commission.</p>
'),

('products', 'Our Products & Carriers', 2, '
<h2>Our Products & Carriers</h2>
<p>APEX agents are contracted with 10 carriers offering final expense and term life insurance products. Every carrier has different underwriting guidelines, commission structures, and product strengths.</p>
<h3>Final Expense Carriers</h3>
<ul>
  <li><strong>Guarantee Trust Life (GTL)</strong> — Heritage whole life. Ages 45–80. Graded and level options. Known for accepting moderate health risks. Commission advance: 50% capped at $600/policy.</li>
  <li><strong>American Home Life (AHL)</strong> — Final Expense whole life. Ages 0–80. Strong simplified issue with competitive rates. Street-level commissions start at ~55%.</li>
  <li><strong>Royal Neighbors of America</strong> — Simplified Issue WL Ages 50–75 and 76–85. One of the cleanest policies for relatively healthy seniors. Strong brand recognition.</li>
  <li><strong>Mutual of Omaha</strong> — Living Promise FE. Ages 45–85. Industry gold standard for final expense. High first-year placement rates.</li>
  <li><strong>Foresters Financial</strong> — PlanRight whole life. Ages 50–85 with age-banded rates. Member benefits (scholarship, legal, orphan benefit) add unique value proposition.</li>
  <li><strong>Baltimore Life</strong> — Final Expense whole life. Ages 40–80. Competitive for moderate health risks.</li>
  <li><strong>Newbridge</strong> — Final Expense. Ages 0–80. Good for tobacco users and higher-risk clients.</li>
  <li><strong>American Amicable</strong> — Pioneer Security whole life. Ages 50–85. Solid for clients with chronic conditions.</li>
</ul>
<h3>Term Life Carriers</h3>
<ul>
  <li><strong>Transamerica</strong> — Term life 10/15/20/30-year. Competitive for healthier clients needing larger face amounts. Requires full medical underwriting.</li>
  <li><strong>Prudential</strong> — Term Essential. Ages 18–75. One of the most recognized brands in insurance.</li>
</ul>
<h3>Carrier Selection Guidelines</h3>
<p>Use the following rules of thumb when choosing a carrier for a client:</p>
<ul>
  <li><strong>Healthy client, best rate:</strong> Royal Neighbors, Mutual of Omaha</li>
  <li><strong>Moderate health (controlled diabetes, COPD):</strong> GTL, AHL</li>
  <li><strong>High-risk / multiple conditions:</strong> Newbridge, American Amicable</li>
  <li><strong>Client wants member benefits:</strong> Foresters</li>
  <li><strong>Needs term life:</strong> Transamerica, Prudential</li>
</ul>
'),

('sales-process', 'The APEX Sales Process (Straight Line Method)', 3, '
<h2>The APEX Sales Process</h2>
<p>APEX agents follow the Straight Line Sales Method from Jordan Belfort''s <em>Way of the Wolf</em>. Every agent is expected to read this book. The method is built on one principle: move the prospect from open to close in a straight line, never allowing the conversation to go off track.</p>
<h3>The Three Tens</h3>
<p>A prospect will only buy when they have absolute certainty (a "10") on three things simultaneously:</p>
<ol>
  <li><strong>The Product</strong> — They believe this policy is the right solution for their family.</li>
  <li><strong>You (The Agent)</strong> — They trust you as an expert who has their best interests at heart.</li>
  <li><strong>The Company</strong> — They trust the insurance carrier and APEX behind the policy.</li>
</ol>
<p>Your entire presentation is designed to move each of these three scales to a 10. If you hear an objection, one of these three scales is low.</p>
<h3>The APEX Call Flow</h3>
<ol>
  <li><strong>Take control in the first 4 seconds.</strong> You are the expert. Your tonality should communicate that immediately. "Hi [Name], this is [Agent] with the Final Expense department, how are you today?"</li>
  <li><strong>Build rapport while gathering information.</strong> Use FORM (Family, Occupation, Recreation, Money). People tell their pain to people they like.</li>
  <li><strong>Needs analysis.</strong> Uncover the pain: Who depends on them? Do they have coverage? What happens to their family if they pass tonight? What is the minimum they want covered?</li>
  <li><strong>Present the solution.</strong> Match carrier to their health profile. Quote the rate. Anchor on the monthly cost ("for about the price of a dinner out, your family is protected forever").</li>
  <li><strong>Assume the close.</strong> "Let me get you qualified right now — what is your date of birth?" Not "Would you like to apply?" You''re processing their application, not asking permission.</li>
  <li><strong>Handle objections (looping).</strong> If they push back, loop back to one of the Three Tens. Every objection is handled the same way: acknowledge, deflect, re-present.</li>
</ol>
<h3>Call Standards</h3>
<ul>
  <li>Prime calling hours: 10am–6pm local time (targeting retirees at home)</li>
  <li>Weekly production standard: $5,000+ ALP</li>
  <li>Average sale target: $1,500 ALP (~$125/month)</li>
  <li>We close live on the dialer — no callback model, no appointment model</li>
</ul>
'),

('compensation', 'Compensation & Commission Structure', 4, '
<h2>Compensation & Commission Structure</h2>
<p>APEX agents are paid on commission. There is no salary. You are a 1099 independent contractor. Here is exactly how you get paid.</p>
<h3>How Commissions Work</h3>
<p>When you sell a policy, the carrier calculates your commission based on the annual premium and your contract level percentage. For example, if you are at 80% commission level and sell a $100/month policy:</p>
<ul>
  <li>Annual premium: $100 × 12 = $1,200</li>
  <li>Your Year 1 commission: $1,200 × 80% = $960</li>
  <li>Advance (paid within 2 weeks of effective date): $960 × 75% = $720</li>
  <li>Trail (months 10, 11, 12): $960 × 25% ÷ 3 = $80/month</li>
</ul>
<h3>GTL Exception</h3>
<p>Guarantee Trust Life uses a different advance schedule:</p>
<ul>
  <li>Advance = 50% of Year 1 commission, capped at $600 per policy</li>
  <li>Balance paid across months 7–12 (6 equal payments)</li>
</ul>
<h3>Renewals (Year 2+)</h3>
<p>Policies that stay on the books continue to generate renewal commissions starting in Year 2. Renewal rates are 3–8% depending on the carrier and your contract level. A book of 100 active policies paying average $50/month in renewals = $5,000/month in passive income. This is the long game.</p>
<h3>Override Commissions</h3>
<p>When you recruit and build a team, you earn override commissions on your downline''s production. You earn the spread between your commission level and their commission level. If you are at 110% and your agent is at 80%, you earn 30% override on every dollar they produce.</p>
<h3>Street Level vs. Your Level</h3>
<p>New agents typically start at 55–75% depending on production history. As you hit production milestones, you are promoted to higher contract levels. Managers typically sit at 80–100%. Agency Owners operate at 100%+.</p>
'),

('compliance', 'Compliance & Regulatory Requirements', 5, '
<h2>Compliance & Regulatory Requirements</h2>
<p>Life insurance is a heavily regulated industry. Compliance is not optional — violations can result in license suspension, carrier termination, or legal action.</p>
<h3>Licensing Requirements</h3>
<ul>
  <li>You must hold an active life insurance license in every state where you sell.</li>
  <li>Your license must be renewed on schedule (every 2 years in most states).</li>
  <li>CE (Continuing Education) requirements vary by state — typically 24 hours per 2-year cycle.</li>
  <li>Check your license status at NIPR.com using your NPN.</li>
</ul>
<h3>AML Training (Anti-Money Laundering)</h3>
<p>Federal law requires all life and annuity producers to complete AML training. The easiest way to complete this is through LIMRA''s free AML program at <strong>aml.limra.com</strong>.</p>
<ul>
  <li>Username: First 4 letters of your last name + last 6 digits of your SSN</li>
  <li>Complete the base course once, then annual refreshers</li>
  <li>LIMRA automatically notifies your carriers upon completion</li>
  <li>Current training cycle: 2024–2026. Renewal course: "AML for Insurance Review — Evolving Scam Threats"</li>
</ul>
<h3>E&O Insurance (Errors & Omissions)</h3>
<p>E&O insurance is required by all carriers before contracting. It protects you if a client claims you made an error in their policy. Minimum coverage: $1,000,000 per occurrence. Renew annually and upload your certificate to Agent Cloud.</p>
<h3>Do Not Call (DNC) Compliance</h3>
<p>Always check leads against the National DNC Registry before calling. Our dialer (Readymode) scrubs against DNC automatically, but you are personally responsible for compliance. Never call a number that has not been scrubbed.</p>
<h3>Replacement Policy</h3>
<p>Replacing an existing policy with a new one requires completing a replacement form in most states. Always disclose to the client that you are replacing existing coverage. Never discourage a client from keeping good existing coverage just to make a sale — this is a compliance violation.</p>
'),

('technology', 'Technology & Tools', 6, '
<h2>Technology & Tools</h2>
<h3>Agent Cloud (This Platform)</h3>
<p>Agent Cloud is your agency management hub. Use it for: tracking your pipeline, posting deals, viewing your commission schedule, accessing your commission grids, completing contracting, and accessing all training resources.</p>
<h3>Readymode (Predictive Dialer)</h3>
<p>Readymode is our predictive dialer. It automatically dials leads and connects you to live prospects. Key rules:</p>
<ul>
  <li>Always be logged in during your calling hours</li>
  <li>Disposition every call correctly — this data feeds your performance metrics</li>
  <li>Prime calling time: 10am–6pm local prospect time</li>
  <li>Do not make personal calls through the dialer</li>
</ul>
<h3>Discord</h3>
<p>Team communication happens on Discord. Join the APEX server and check the announcements channel daily. Sales celebrations, training calls, and contest updates are posted there.</p>
<h3>AgentLink (Legacy)</h3>
<p>If you are transitioning from another agency that used AgentLink/InsuraCloud, you can import your entire book of business into Agent Cloud using the Import from AgentLink feature on your Pipeline page. Contact your upline if you need help with this.</p>
'),

('growth', 'Growing Your Business & Building a Team', 7, '
<h2>Growing Your Business & Building a Team</h2>
<h3>The Path from Agent to Agency Owner</h3>
<p>APEX is structured so that any producing agent can build their own agency. The path looks like this:</p>
<ol>
  <li><strong>Agent</strong> — Focus on personal production. Hit $5K+ ALP weekly consistently.</li>
  <li><strong>Manager</strong> — Recruit 2–3 agents under you. Your overrides supplement your income. Begin building systems.</li>
  <li><strong>Agency Owner</strong> — Run a full agency. Your team''s production generates significant override income. White-label Agent Cloud with your brand.</li>
</ol>
<h3>Recruiting</h3>
<p>The best recruits are people who are hungry, coachable, and have some sales experience. They do not need to have insurance experience — we will train them. Use recruiting funnels in Agent Cloud to drive inbound interest.</p>
<h3>Retention</h3>
<p>The biggest leak in most agencies is not recruiting — it''s keeping agents. Keys to retention:</p>
<ul>
  <li>Onboard new agents personally — help them post their first deal within 30 days</li>
  <li>Weekly team calls via Discord to share wins and solve problems</li>
  <li>Celebrate every sale publicly — recognition drives behavior</li>
  <li>Give agents resources (this handbook, scripts, case design) so they never feel stuck</li>
</ul>
'),

('faqs', 'Frequently Asked Questions', 8, '
<h2>Frequently Asked Questions</h2>
<h3>When do I get paid?</h3>
<p>Advance commissions are paid within 2 business weeks of the policy effective date. Trail commissions are paid in months 10, 11, and 12 for standard carriers (months 7–12 for GTL). Renewal commissions start in month 13 of the policy. You can see your exact projected payment schedule in Agent Cloud under Finances.</p>
<h3>What happens if a policy lapses?</h3>
<p>If a policy lapses within the first 12 months, you will receive a chargeback for any advance commissions that were paid for that policy. This is standard in the industry and why placing clients in the right policy at the right price is critical. A policy the client can''t afford will chargeback. A properly placed policy builds your residuals.</p>
<h3>Do I need to get licensed before I can sell?</h3>
<p>Yes. You must hold an active life insurance license in the state where your client resides. You cannot sell without a license. If you are not yet licensed, contact your upline for study material recommendations. The exam typically takes 1–3 weeks of study.</p>
<h3>How do I get contracted with a carrier?</h3>
<p>Go to Contracting → Carriers in Agent Cloud. Click "Request Contracting" for any carrier. Your upline will process the contracting paperwork through SureLC. You will need: active license, E&O certificate, AML completion, driver''s license, and banking info for direct deposit.</p>
<h3>What is my commission level?</h3>
<p>Go to Contracting → Commission Grids in Agent Cloud. Your assigned level for each carrier is highlighted in gold. If you don''t see a level assigned, contact your upline.</p>
<h3>Can I work part time?</h3>
<p>Yes. Many agents start part time. The minimum production standard to remain active is $5K ALP per week, but this is measured over a rolling period. If life happens, communicate with your manager.</p>
');

-- ─── SCRIPTS ───────────────────────────────────────────────────────────────
TRUNCATE public.scripts CASCADE;

INSERT INTO public.scripts (title, category, short_description, long_description, content_html, accent_color, sort_order) VALUES

('APEX Opening Script (Straight Line)', 'basic', 'The APEX standard opener for outbound final expense calls. Designed to take control in the first 4 seconds and move directly into rapport.', 'Based on the Straight Line Sales Method from Way of the Wolf. Used by top APEX producers daily.', '
<h3>Opening Statement</h3>
<p><strong>Agent:</strong> "Hi, [First Name]? Hi there, this is [Your Name] calling from the Final Expense department — how are you doing today?"</p>
<p><em>[Wait for response, build on it briefly]</em></p>
<p><strong>Agent:</strong> "Great! The reason I''m reaching out is that you had requested some information about life insurance coverage for final expenses — making sure your family wouldn''t be burdened with any costs if something were to happen to you. Does that sound about right?"</p>
<p><em>[If yes: move to needs analysis. If confused: clarify the lead source.]</em></p>
<p><strong>Agent:</strong> "Perfect. What I''d like to do is just take 2–3 minutes, ask you a few quick questions to understand what you''re looking for, and I can show you exactly what you''d qualify for. Does that work for you?"</p>

<h3>Tonality Notes</h3>
<ul>
<li>Be warm but confident — you are the expert, not a telemarketer</li>
<li>Speak at a measured pace — don''t rush</li>
<li>Smile — it comes through in your voice</li>
<li>Use their first name once in the opener — it establishes personalization</li>
</ul>
', '#C9A227', 1),

('Needs Analysis — Final Expense', 'needs_analysis', 'Uncover the prospect''s pain, budget, and beneficiary in under 5 minutes. Designed for final expense senior market calls.', 'This script identifies the Three Tens: product fit, trust in you, and trust in the carrier. Use it after your opener.', '
<h3>The Needs Analysis Flow</h3>

<p><strong>Health Questions (qualify for carrier):</strong></p>
<p>"To make sure I get you the right plan and the best rates, I need to ask you a few health questions. These are simple — just yes or no. Ready?"</p>
<ul>
<li>"Have you been hospitalized in the last 2 years?"</li>
<li>"Are you currently on oxygen or in a nursing facility?"</li>
<li>"In the last 2 years, have you been diagnosed with cancer, a heart attack, stroke, or kidney failure?"</li>
<li>"Do you currently use tobacco or nicotine products?"</li>
</ul>

<p><strong>Coverage Discovery:</strong></p>
<p>"Do you currently have any life insurance?"</p>
<p><em>[If yes:]</em> "How much coverage do you have, and do you feel that''s enough to cover everything — burial, medical bills, any debts you might leave behind?"</p>
<p><em>[If no:]</em> "What''s your main concern — making sure the burial is covered, or leaving something for your family?"</p>

<p><strong>Budget Discovery:</strong></p>
<p>"Most of our clients are looking to keep the coverage affordable — somewhere between $30–$80 a month. Does that range work for what you had in mind?"</p>

<p><strong>Beneficiary:</strong></p>
<p>"And who would you want the policy to go to if something were to happen to you? Spouse, children?"</p>

<p><strong>Transition to Presentation:</strong></p>
<p>"Based on everything you''ve told me, I have a really good plan I want to show you. It''s going to cover [their stated concern] and the monthly cost is going to be very manageable. Let me put the numbers together for you right now."</p>
', '#10b981', 2),

('The APEX Close', 'basic', 'The standard assumptive close for final expense sales. Designed to assume the sale and move directly into the application without asking permission.', 'Never ask "Would you like to apply?" — instead assume the sale and process the application. This script shows you exactly how.', '
<h3>Presenting the Rate</h3>
<p>"Okay [Name], based on your health and what you''re looking for, I have you qualifying for [Carrier] — they''re one of the top-rated companies in the country, A-rated, and they''ve been around for [X] years. The coverage is $[Face Amount], and your monthly premium is going to be $[Premium]."</p>
<p>"That''s less than a dollar a day to make sure your family never has to worry about this. How does that sound?"</p>

<h3>The Assumptive Close</h3>
<p>"Great, let me get you locked in while I have you on the line. I just need to verify a few things for the application. What is your full legal name as it appears on your ID?"</p>
<p><em>[Take them through the application — date of birth, address, beneficiary, payment info]</em></p>
<p>"And for the payment, most of our clients set it up on automatic draft — it comes right out of your checking account on whatever date works best for you. What date is good for you, like the 1st, the 15th?"</p>

<h3>Confirming the Sale</h3>
<p>"Alright [Name], you''re all set. Your policy is going to be [Carrier], $[Face Amount] in coverage, $[Premium] per month, starting [Effective Date]. Your beneficiary is [Beneficiary Name]. I''m going to send you a confirmation email at [Email] — is that the right address?"</p>
<p>"You made a great decision today. Your family is protected. Do you have any final questions for me?"</p>
', '#C9A227', 3),

('Objection: "I need to think about it"', 'objection_handling', 'The most common final expense objection. Use the loop-back method from Straight Line to re-present and close.', 'This objection means one of the Three Tens is below a 10. Your job is to find which one and address it.', '
<h3>Step 1: Acknowledge and Deflect</h3>
<p><strong>Agent:</strong> "That''s completely understandable, [Name] — this is an important decision and I want to make sure you feel comfortable. Can I ask — what specifically did you want to think over? Is it the cost, the coverage amount, or something about the company?"</p>
<p><em>[Listen carefully — their answer tells you which of the Three Tens is low]</em></p>

<h3>If it''s about cost:</h3>
<p>"I understand. Let me ask you this — if the price were a little lower, would you feel comfortable moving forward today?"</p>
<p><em>[If yes]</em> "Let me see if I can find an option at a lower face amount that still gives your family meaningful protection. What''s the absolute minimum you''d want covered?"</p>
<p>"Something is always better than nothing, and we can always add more later. Who did you want the beneficiary to be?"</p>

<h3>If it''s about the company:</h3>
<p>"I completely understand wanting to know you''re working with a reputable company. [Carrier] has been in business for [X] years, they''re A-rated by AM Best, and they''ve paid out over [X] billion in claims. Your family is going to be protected — that''s a guarantee."</p>

<h3>If they want to talk to family:</h3>
<p>"That makes total sense — this is a family decision. Quick question though: is there a chance your [spouse/child] would say anything that would change your mind about protecting your family? Because at the end of the day, this is for them — it''s your gift to them."</p>
<p>"If they had any concerns, what do you think those might be? Let me address them right now while I have you."</p>
', '#ef4444', 4),

('Objection: "I can''t afford it"', 'objection_handling', 'The budget objection — almost always a deflection, not a real barrier. Use this script to reframe cost and find the true objection.', 'In most cases "I can''t afford it" means the prospect does not yet see enough value. Reinforce value, then right-size the coverage.', '
<h3>Acknowledge and Reframe</h3>
<p><strong>Agent:</strong> "I completely understand — and I hear that a lot. Can I ask you something? Is it that the budget truly isn''t there, or is it more that you''re not sure if it''s worth the cost?"</p>
<p><em>[Wait for their answer]</em></p>

<h3>If it''s a real budget concern:</h3>
<p>"I get it, and that''s exactly why we have options starting as low as $20–$25 a month. It might not be $50,000 in coverage, but even $10,000 covers a full funeral and leaves a little something for the family. Can I show you what that looks like?"</p>

<h3>If it''s a value concern:</h3>
<p>"Let me ask you this: if something were to happen to you tonight, do you know what a funeral costs right now? The average in the US is between $9,000 and $15,000 — and that''s before any medical bills or debts. For less than $1.50 a day, your family never has to worry about that. That''s not a cost — that''s a gift."</p>

<h3>The Close</h3>
<p>"Here''s what I''d suggest — let''s start with the lowest option, something in the $25–$30 range, get you covered for something rather than nothing. We can always increase it later. Who is your beneficiary?"</p>
', '#f59e0b', 5),

('Mortgage Protection Script', 'mortgage_protection', 'Script for selling mortgage protection term life to homeowners. Designed for warm leads who recently purchased a home.', 'Mortgage protection is a term policy sized to pay off the mortgage if the breadwinner dies. Leads typically come from property records.', '
<h3>Opening</h3>
<p><strong>Agent:</strong> "Hi [Name], this is [Agent] calling. I''m reaching out because our records show you recently purchased a home at [Address] — congratulations! I''m calling from the mortgage protection department. How are you doing today?"</p>
<p><em>[Build rapport briefly]</em></p>

<h3>Value Proposition</h3>
<p>"The reason I''m reaching out is that you should have received a letter about protecting your mortgage — making sure that if something were to happen to you or your spouse, your family gets to keep the home. Did you receive that letter, or did it get lost in the shuffle of the move?"</p>

<h3>Needs Analysis</h3>
<ul>
<li>"What is your current mortgage balance — roughly?"</li>
<li>"Do you and your spouse both work, or is one of you primarily supporting the household?"</li>
<li>"Do you have any existing life insurance that would cover the mortgage?"</li>
<li>"How long is your mortgage term — 15 or 30 years?"</li>
</ul>

<h3>Presentation</h3>
<p>"What I can do is match a term policy to your exact mortgage — so if anything happens, the policy pays off the home directly. The rates are tied to your age and health, and most people your age and health profile qualify for as low as $[Rate]/month to cover a $[Amount] mortgage. That''s [monthly cost] to guarantee your family keeps the home. Let me show you the numbers."</p>
', '#6366f1', 6),

('Beneficiary Review Call', 'beneficiary', 'Script for calling existing clients to review and update their beneficiary designations. Great for building retention and uncovering new sales opportunities.', 'A quick, non-salesy touch that builds trust and often uncovers new coverage needs. Call your sold clients every 12 months.', '
<h3>Opening</h3>
<p><strong>Agent:</strong> "Hi [Name], this is [Agent] calling — I helped you set up your [Carrier] policy back in [Month/Year]. How have you been?"</p>
<p><em>[Brief catch-up]</em></p>

<h3>Purpose of Call</h3>
<p>"The reason I''m calling is that we touch base with clients once a year to make sure your policy information is still current — especially your beneficiary. Life changes — marriages, divorces, children, grandchildren — and we want to make sure the right people are protected. Do you have a quick minute?"</p>

<h3>Review Questions</h3>
<ul>
<li>"Is [Beneficiary Name] still the person you want on the policy?"</li>
<li>"Is your mailing address still [Address]?"</li>
<li>"Has anything changed with your health that I should know about?"</li>
<li>"Do you have any other family members — kids, grandkids — who might need some coverage? Rates are especially low for younger people, and it locks in forever."</li>
</ul>

<h3>Referral Ask</h3>
<p>"One more thing — I''m always looking to help more families in your community. Is there anyone in your family or circle of friends who you think could benefit from what we did for you? I promise I''ll treat them with the same care I gave you."</p>
', '#8b5cf6', 7),

('Follow-Up Call (Callback Lead)', 'check_in', 'Script for calling back a prospect who asked to be contacted at a later date. Designed to re-engage without being pushy.', 'Callback leads are warm. They said yes to a future conversation. Treat them accordingly — not like a cold lead.', '
<h3>Opening</h3>
<p><strong>Agent:</strong> "Hi [Name], this is [Agent] calling — we spoke [X days] ago about your final expense coverage. You had asked me to follow up today. Did I catch you at a good time?"</p>

<h3>Re-Establish Context</h3>
<p>"When we last spoke, you were interested in coverage around $[Amount] to make sure [concern — burial/family protection/etc.]. Has anything changed since then, or are you still in the same place?"</p>

<h3>If Still Interested</h3>
<p>"Great — I''ve actually pulled up your information right here. Based on what you told me, I have [Carrier] as the best fit. The monthly cost is still $[Premium] for $[Face Amount] in coverage. The rates are the same — these are locked in for life once we activate it. Can we take 3 minutes and get this set up right now?"</p>

<h3>If Hesitant</h3>
<p>"I understand — and I want to make sure this feels right for you. What''s the one thing that''s been holding you back? Is it the timing, the cost, or something specific about the coverage?"</p>
<p><em>[Address their concern, then close assumptively]</em></p>
', '#0ea5e9', 8);

-- ─── ACADEMY COURSES ───────────────────────────────────────────────────────
TRUNCATE public.academy_courses CASCADE;

INSERT INTO public.academy_courses (title, slug, description, category, instructor_name, duration_minutes, module_count, featured, published, sort_order, url) VALUES

('Way of the Wolf — Straight Line Mastery', 'way-of-the-wolf', 'The foundation of the APEX sales system. Jordan Belfort''s Straight Line Persuasion method applied specifically to final expense and term life insurance telesales. Every APEX agent is required to complete this.', 'Sales Skills', 'Jordan Belfort / APEX Team', 90, 6, true, true, 1, 'https://www.amazon.com/Way-Wolf-Straight-Line-Selling/dp/1501164775'),

('Final Expense Sales Mastery', 'final-expense-sales-mastery', 'A complete walkthrough of the APEX final expense call from opener to close. Includes live call recordings, role play examples, and carrier selection guidelines. Best for agents in their first 90 days.', 'Sales Skills', 'APEX Training Team', 75, 5, false, true, 2, null),

('Objection Handling Playbook', 'objection-handling-playbook', 'Every major objection you will face on the phone — I need to think about it, I can''t afford it, I need to talk to my kids, I already have insurance — handled with exact word-for-word responses using the loop-back method.', 'Sales Skills', 'APEX Training Team', 45, 4, false, true, 3, null),

('Product Knowledge: Final Expense Carriers', 'product-knowledge-carriers', 'Deep dive into our 10 carrier portfolio. Underwriting guidelines, rate bands, product strengths, claim reputation, and when to use each carrier. Critical for placing clients correctly.', 'Product Knowledge', 'APEX Training Team', 60, 10, false, true, 4, null),

('AML Training (Required — Free via LIMRA)', 'aml-training-limra', 'Anti-Money Laundering training is required by federal regulation before you can be contracted with most carriers. Complete the free base course at aml.limra.com. Login: first 4 letters of last name + last 6 digits of SSN.', 'Compliance', 'LIMRA', 60, 1, false, true, 5, 'https://aml.limra.com'),

('Getting Licensed: The Insurance Exam', 'getting-licensed', 'A step-by-step guide to getting your life insurance license. Study resources, exam tips, state-specific requirements, and what to do after you pass. Recommended for unlicensed recruits.', 'Compliance', 'APEX Training Team', 30, 3, false, true, 6, null),

('Agent Cloud Walkthrough', 'agent-cloud-walkthrough', 'A complete tour of the Agent Cloud platform — pipeline management, posting deals, viewing commissions, accessing commission grids, contracting, and importing your existing book from AgentLink.', 'Technology', 'APEX Training Team', 40, 8, false, true, 7, null),

('Readymode Dialer Setup & Best Practices', 'readymode-dialer', 'How to set up Readymode, configure your agent profile, work leads efficiently, and disposition calls correctly. Includes call time optimization and how to avoid DNC violations.', 'Technology', 'APEX Training Team', 25, 4, false, true, 8, null),

('Recruiting Your First Agent', 'recruiting-first-agent', 'The exact system APEX uses to recruit new agents — where to find them, what to say, how to vet them, and how to onboard them in their first 30 days to maximize retention.', 'Recruiting', 'APEX Leadership', 50, 5, false, true, 9, null),

('Building Residual Income: The Long Game', 'building-residual-income', 'How override commissions and policy renewals compound over time. Real numbers from APEX agency owners showing $5K/month, $10K/month, and $20K+/month in passive income. The math, the timeline, and the system.', 'Sales Skills', 'Samuel James', 35, 3, false, true, 10, null);
