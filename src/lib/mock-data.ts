// Centralized mock data for v1 UI

export type PipelineStage =
  | "new_lead"
  | "contacted"
  | "appointment_set"
  | "presentation"
  | "application"
  | "issued"
  | "lost";

export type Temperature = "hot" | "warm" | "cold";

export type PolicyStatus =
  | "active" | "in_review" | "lapse_pending" | "lapsed"
  | "cancelled" | "withdrawn" | "not_taken" | "postponed" | "carrier_na";

export interface MockClient {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  stage: PipelineStage;
  temperature: Temperature;
  source: string;
  created_at: string;
  next_followup?: string;
  notes_count: number;
  annual_premium: number;
}

export interface MockPolicy {
  id: string;
  client_id: string;
  client_name: string;
  carrier: string;
  product: string;
  policy_number: string;
  status: PolicyStatus;
  annual_premium: number;
  monthly_premium: number;
  face_amount: number;
  issued_date: string;
  agent_name: string;
}

export const CARRIERS = [
  "Mutual of Omaha", "Americo", "Foresters Financial", "American Amicable",
  "Aetna", "Transamerica", "Gerber Life", "SBLI", "Royal Neighbors", "Liberty Bankers",
];

const FIRST = ["James","Mary","Robert","Patricia","John","Jennifer","Michael","Linda","David","Barbara","Richard","Susan","Joseph","Jessica","Thomas","Sarah","Charles","Karen","Christopher","Nancy","Daniel","Lisa","Matthew","Betty","Anthony","Helen","Mark","Sandra","Donald","Donna"];
const LAST = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin","Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson"];
const CITIES = [
  ["Dallas","TX"],["Houston","TX"],["Austin","TX"],["Miami","FL"],["Orlando","FL"],
  ["Phoenix","AZ"],["Atlanta","GA"],["Charlotte","NC"],["Nashville","TN"],["Denver","CO"],
  ["Las Vegas","NV"],["Chicago","IL"],["Columbus","OH"],["Indianapolis","IN"],["Tampa","FL"],
];
const STAGES: PipelineStage[] = ["new_lead","contacted","appointment_set","presentation","application","issued","lost"];
const TEMPS: Temperature[] = ["hot","warm","cold"];
const SOURCES = ["Facebook Ad","Direct Mail","Referral","Door Knock","Cold Call","Web Lead"];
const STATUSES: PolicyStatus[] = ["active","in_review","lapse_pending","lapsed","cancelled","withdrawn","not_taken","postponed"];

// Simple seeded RNG so renders are stable
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

function phoneNum(i: number) {
  const a = 200 + Math.floor(rand() * 700);
  const b = 200 + Math.floor(rand() * 700);
  const c = 1000 + ((i * 137) % 9000);
  return `${a}${b}${c}`;
}

export const MOCK_CLIENTS: MockClient[] = Array.from({ length: 48 }, (_, i) => {
  const fn = pick(FIRST);
  const ln = pick(LAST);
  const [city, state] = pick(CITIES);
  const stage = pick(STAGES);
  const days = Math.floor(rand() * 60);
  return {
    id: `cl-${i + 1}`,
    first_name: fn,
    last_name: ln,
    email: `${fn.toLowerCase()}.${ln.toLowerCase()}@example.com`,
    phone: phoneNum(i),
    city, state,
    stage,
    temperature: pick(TEMPS),
    source: pick(SOURCES),
    created_at: new Date(Date.now() - days * 86400000).toISOString(),
    next_followup: rand() > 0.5 ? new Date(Date.now() + Math.floor(rand() * 14) * 86400000).toISOString() : undefined,
    notes_count: Math.floor(rand() * 8),
    annual_premium: stage === "issued" ? Math.floor(600 + rand() * 4400) : 0,
  };
});

export const MOCK_POLICIES: MockPolicy[] = MOCK_CLIENTS
  .filter((c) => c.stage === "issued" || rand() > 0.6)
  .map((c, i) => {
    const annual = Math.floor(600 + rand() * 4400);
    return {
      id: `pol-${i + 1}`,
      client_id: c.id,
      client_name: `${c.first_name} ${c.last_name}`,
      carrier: pick(CARRIERS),
      product: pick(["Term 20","Term 30","Whole Life","Final Expense","IUL","Annuity"]),
      policy_number: `POL-${(100000 + i).toString()}`,
      status: c.stage === "issued" ? "active" : pick(STATUSES),
      annual_premium: annual,
      monthly_premium: Math.round((annual / 12) * 100) / 100,
      face_amount: Math.floor(10000 + rand() * 490000),
      issued_date: c.created_at,
      agent_name: "You",
    };
  });

export const STAGE_META: Record<PipelineStage, { label: string; color: string }> = {
  new_lead:        { label: "New Lead",         color: "bg-slate-500" },
  contacted:       { label: "Contacted",        color: "bg-[#C9A227]" },
  appointment_set: { label: "Appointment Set",  color: "bg-indigo-500" },
  presentation:    { label: "Presentation",     color: "bg-purple-500" },
  application:     { label: "Application",      color: "bg-amber-500" },
  issued:          { label: "Issued",           color: "bg-emerald-500" },
  lost:            { label: "Lost",             color: "bg-rose-500" },
};

export const TEMP_META: Record<Temperature, { label: string; cls: string }> = {
  hot:  { label: "Hot",  cls: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30" },
  warm: { label: "Warm", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  cold: { label: "Cold", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
};
