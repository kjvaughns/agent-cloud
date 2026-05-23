export type LandingTemplate = {
  slug: string;
  name: string;
  category: string;
  gradient: string; // tailwind classes for background
  accent: string; // accent text color class
  headline: string;
  subhead: string;
  bullets: string[];
  ctaLabel: string;
  shortDesc: string;
};

export const LANDING_TEMPLATES: LandingTemplate[] = [
  {
    slug: "life-insurance-calculator",
    name: "Life Insurance Calculator",
    category: "Lead Capture",
    gradient: "from-indigo-900 via-purple-800 to-violet-900",
    accent: "text-violet-300",
    headline: "How Much Life Insurance Do You Actually Need?",
    subhead: "Use our 60-second calculator to find your ideal coverage amount.",
    bullets: [
      "Personalized coverage estimate",
      "Based on income, debts, and dependents",
      "No obligation, totally free",
    ],
    ctaLabel: "Calculate My Coverage",
    shortDesc: "Interactive calculator to find coverage amount",
  },
  {
    slug: "family-protection",
    name: "Family Protection",
    category: "Life Insurance",
    gradient: "from-purple-950 via-purple-800 to-fuchsia-900",
    accent: "text-fuchsia-300",
    headline: "Protect What Matters Most",
    subhead: "Life insurance designed to keep your family financially secure no matter what.",
    bullets: [
      "Coverage tailored to your family's needs",
      "Locked-in rates for decades",
      "Get a quote in minutes",
    ],
    ctaLabel: "Protect My Family",
    shortDesc: "Emotional appeal for protecting loved ones",
  },
  {
    slug: "free-quote",
    name: "Free Quote",
    category: "Lead Capture",
    gradient: "from-teal-700 via-emerald-700 to-green-800",
    accent: "text-emerald-200",
    headline: "Get Your Free Quote Today",
    subhead: "Compare top-rated carriers and find the policy that fits your budget.",
    bullets: [
      "No fees, no obligation",
      "Quotes from A-rated carriers",
      "Instant pricing in most cases",
    ],
    ctaLabel: "Get My Free Quote",
    shortDesc: "Clean, modern lead capture form",
  },
  {
    slug: "final-expense",
    name: "Final Expense",
    category: "Senior Market",
    gradient: "from-pink-700 via-rose-700 to-coral-700",
    accent: "text-pink-200",
    headline: "Final Expense Coverage With Guaranteed Acceptance",
    subhead: "Fast 24-hour payouts so your family is never left with the bill.",
    bullets: [
      "Guaranteed acceptance ages 50-85",
      "No medical exam required",
      "Policies that pay claims within 24 hours",
    ],
    ctaLabel: "Get My Final Expense Quote",
    shortDesc: "Tailored for seniors seeking burial coverage",
  },
  {
    slug: "retirement-planning",
    name: "Retirement Planning",
    category: "Retirement",
    gradient: "from-orange-700 via-amber-700 to-yellow-700",
    accent: "text-amber-200",
    headline: "Building Income Streams That Last a Lifetime",
    subhead: "Discover how indexed annuities and IUL can secure your retirement income.",
    bullets: [
      "Guaranteed lifetime income options",
      "Tax-advantaged growth",
      "Protection from market downturns",
    ],
    ctaLabel: "Plan My Retirement",
    shortDesc: "Retirement income planning for prospects",
  },
  {
    slug: "young-family",
    name: "Young Family",
    category: "Term Life",
    gradient: "from-blue-700 via-indigo-700 to-purple-700",
    accent: "text-blue-200",
    headline: "Your Little One Deserves a Secure Future",
    subhead: "Affordable term life insurance built for new and growing families.",
    bullets: [
      "Coverage starting as low as $20/month",
      "30-year locked rates available",
      "Quick approval, no exam plans",
    ],
    ctaLabel: "Get My Quote",
    shortDesc: "For new and expecting parents",
  },
  {
    slug: "business-tax-strategies",
    name: "Business Tax Strategies",
    category: "Business",
    gradient: "from-slate-900 via-blue-950 to-amber-900",
    accent: "text-amber-300",
    headline: "5 Tax-Advantaged Life Insurance Strategies for Business Owners",
    subhead: "Reduce your tax burden while building wealth for you and your business.",
    bullets: [
      "Section 162 executive bonus plans",
      "Buy-sell agreement funding",
      "Tax-free retirement income",
    ],
    ctaLabel: "Get My Strategy Guide",
    shortDesc: "Tax-advantaged strategies for business owners",
  },
  {
    slug: "veterans-benefits",
    name: "Veterans Benefits",
    category: "Veterans",
    gradient: "from-red-800 via-blue-900 to-slate-900",
    accent: "text-red-200",
    headline: "Life Insurance for Those Who Served",
    subhead: "Specialized coverage and benefits for military veterans and their families.",
    bullets: [
      "VGLI conversion expertise",
      "Carriers that understand military service",
      "Service-connected condition friendly",
    ],
    ctaLabel: "Get Veteran Quote",
    shortDesc: "Specialized coverage for military veterans",
  },
  {
    slug: "mortgage-protection",
    name: "Mortgage Protection",
    category: "Mortgage",
    gradient: "from-emerald-800 via-teal-700 to-cyan-800",
    accent: "text-emerald-200",
    headline: "Don't Let Your Family Lose Their Home",
    subhead: "Mortgage protection life insurance pays off your home if something happens to you.",
    bullets: [
      "Coverage matched to your mortgage",
      "Living benefits for critical illness",
      "Premium-back guarantees available",
    ],
    ctaLabel: "Protect My Mortgage",
    shortDesc: "Protect the family home if something happens",
  },
  {
    slug: "indexed-universal-life",
    name: "Indexed Universal Life",
    category: "Life Insurance",
    gradient: "from-yellow-700 via-amber-700 to-orange-800",
    accent: "text-yellow-200",
    headline: "Build Tax-Free Wealth With Indexed Universal Life",
    subhead: "Market-linked growth, downside protection, and tax-free retirement income.",
    bullets: [
      "Linked to S&P 500 with 0% floor",
      "Tax-free income via policy loans",
      "Living benefits included",
    ],
    ctaLabel: "Learn About IUL",
    shortDesc: "Market-linked growth with downside protection",
  },
];

export function getTemplate(slug: string): LandingTemplate | undefined {
  return LANDING_TEMPLATES.find((t) => t.slug === slug);
}
