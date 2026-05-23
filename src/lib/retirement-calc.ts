// Pure deterministic retirement projection engine.
// All inputs in real dollars / annual % values.

export type AccountRow = {
  id: string;
  type: string;
  name: string;
  balance: number;
  monthly_contrib: number;
  return_pct: number;
  tax_class: "qualified" | "non_qualified" | "roth" | "taxable";
};

export type IncomeSource = {
  id: string;
  type: "social_security" | "pension" | "annuity" | "other";
  label: string;
  monthly_amount: number;
  start_age?: number | null;
};

export type RetirementInputs = {
  current_age: number;
  retirement_age: number;
  life_expectancy: number;
  current_savings: number;
  monthly_contribution: number;
  expected_return_pct: number;
  inflation_pct: number;
  healthcare_inflation_pct: number;
  accounts: AccountRow[];
  income_sources: IncomeSource[];
  expenses_monthly: number;
  healthcare_monthly: number;
  parttime_income_monthly?: number;
  parttime_until_age?: number;
};

export type YearRow = {
  age: number;
  year: number;
  portfolio_start: number;
  contributions: number;
  growth: number;
  withdrawals: number;
  guaranteed_income: number;
  portfolio_end: number;
};

export type ProjectionResult = {
  years: YearRow[];
  nest_egg: number;            // portfolio value at retirement
  monthly_income: number;       // safe monthly withdrawal at retirement
  withdrawal_rate_pct: number;
  success_probability_pct: number;
  lasts_to_age: number;
  weighted_return_pct: number;
  total_balance: number;
  total_monthly_contrib: number;
  qualified_total: number;
  non_qualified_total: number;
};

export function aggregateAccounts(inputs: RetirementInputs) {
  const totalBalance = inputs.accounts.reduce((s, a) => s + a.balance, 0) + inputs.current_savings;
  const totalContrib = inputs.accounts.reduce((s, a) => s + a.monthly_contrib, 0) + inputs.monthly_contribution;
  const weighted = totalBalance > 0
    ? inputs.accounts.reduce((s, a) => s + a.balance * a.return_pct, 0) / Math.max(1, totalBalance - inputs.current_savings || totalBalance)
    : inputs.expected_return_pct;
  const qualified = inputs.accounts.filter((a) => a.tax_class === "qualified" || a.tax_class === "roth").reduce((s, a) => s + a.balance, 0);
  const non_qualified = inputs.accounts.filter((a) => a.tax_class === "non_qualified" || a.tax_class === "taxable").reduce((s, a) => s + a.balance, 0);
  return { totalBalance, totalContrib, weighted, qualified, non_qualified };
}

function annualizedReturn(pct: number) {
  return 1 + pct / 100;
}

export function project(inputs: RetirementInputs): ProjectionResult {
  const { totalBalance, totalContrib, weighted, qualified, non_qualified } = aggregateAccounts(inputs);
  const annualReturn = annualizedReturn(weighted || inputs.expected_return_pct);
  const inflation = annualizedReturn(inputs.inflation_pct);
  const hcInflation = annualizedReturn(inputs.healthcare_inflation_pct);

  const startYear = new Date().getFullYear();
  const years: YearRow[] = [];
  let portfolio = totalBalance;
  let baseExpense = inputs.expenses_monthly * 12;
  let hcExpense = inputs.healthcare_monthly * 12;
  let lastsTo = inputs.life_expectancy;
  let nestEgg = 0;
  let monthlyIncome = 0;

  for (let age = inputs.current_age; age <= inputs.life_expectancy; age++) {
    const year = startYear + (age - inputs.current_age);
    const portfolioStart = portfolio;
    const isAccumulating = age < inputs.retirement_age;
    const contributions = isAccumulating ? totalContrib * 12 : 0;
    let guaranteed = 0;
    for (const src of inputs.income_sources) {
      const startAge = src.start_age ?? inputs.retirement_age;
      if (age >= startAge) guaranteed += src.monthly_amount * 12;
    }
    if (inputs.parttime_income_monthly && age >= inputs.retirement_age && (!inputs.parttime_until_age || age < inputs.parttime_until_age)) {
      guaranteed += inputs.parttime_income_monthly * 12;
    }
    const totalExpenses = isAccumulating ? 0 : baseExpense + hcExpense;
    const withdrawals = Math.max(0, totalExpenses - guaranteed);

    const growth = (portfolio + contributions / 2 - withdrawals / 2) * (annualReturn - 1);
    portfolio = portfolio + contributions + growth - withdrawals;
    if (portfolio < 0) {
      lastsTo = Math.min(lastsTo, age);
      portfolio = 0;
    }
    years.push({
      age, year,
      portfolio_start: portfolioStart,
      contributions, growth, withdrawals,
      guaranteed_income: guaranteed,
      portfolio_end: portfolio,
    });

    if (age === inputs.retirement_age - 1 || (age === inputs.current_age && inputs.retirement_age <= inputs.current_age)) {
      nestEgg = portfolio;
      // safe withdrawal: 4% rule on portfolio
      monthlyIncome = (portfolio * 0.04) / 12;
    }
    if (!isAccumulating) baseExpense *= inputs.inflation_pct / 100 + 1;
    if (!isAccumulating) hcExpense *= inputs.healthcare_inflation_pct / 100 + 1;
  }

  if (!nestEgg) {
    const yrToRetire = inputs.retirement_age - inputs.current_age;
    if (yrToRetire <= 0) {
      nestEgg = totalBalance;
      monthlyIncome = (totalBalance * 0.04) / 12;
    } else {
      const r = years.find((y) => y.age === inputs.retirement_age - 1) ?? years[0];
      nestEgg = r.portfolio_end;
      monthlyIncome = (r.portfolio_end * 0.04) / 12;
    }
  }

  const withdrawalRate = nestEgg > 0 ? (monthlyIncome * 12 / nestEgg) * 100 : 0;

  // Heuristic success probability: stress-test at -2% return
  const stress = projectStress(inputs, -2);
  const baseSuccess = lastsTo >= inputs.life_expectancy ? 90 : 50 - (inputs.life_expectancy - lastsTo);
  const stressPenalty = stress < inputs.life_expectancy ? Math.min(40, (inputs.life_expectancy - stress) * 4) : 0;
  const successProb = Math.max(5, Math.min(99, baseSuccess - stressPenalty));

  return {
    years,
    nest_egg: nestEgg,
    monthly_income: monthlyIncome,
    withdrawal_rate_pct: withdrawalRate,
    success_probability_pct: successProb,
    lasts_to_age: lastsTo,
    weighted_return_pct: weighted || inputs.expected_return_pct,
    total_balance: totalBalance,
    total_monthly_contrib: totalContrib,
    qualified_total: qualified + inputs.current_savings,
    non_qualified_total: non_qualified,
  };
}

function projectStress(inputs: RetirementInputs, returnDelta: number): number {
  const stressed: RetirementInputs = {
    ...inputs,
    expected_return_pct: inputs.expected_return_pct + returnDelta,
    accounts: inputs.accounts.map((a) => ({ ...a, return_pct: a.return_pct + returnDelta })),
  };
  const result = project({ ...stressed, accounts: stressed.accounts });
  return result.lasts_to_age;
}

export function readinessScore(r: ProjectionResult): number {
  // 0-100 composite
  const success = r.success_probability_pct;
  const lastsBonus = r.lasts_to_age >= 90 ? 10 : 0;
  return Math.max(0, Math.min(100, Math.round(success * 0.9 + lastsBonus)));
}

export function defaultInputs(): RetirementInputs {
  return {
    current_age: 45,
    retirement_age: 65,
    life_expectancy: 90,
    current_savings: 125000,
    monthly_contribution: 500,
    expected_return_pct: 6,
    inflation_pct: 2.5,
    healthcare_inflation_pct: 5.5,
    accounts: [],
    income_sources: [],
    expenses_monthly: 4500,
    healthcare_monthly: 600,
  };
}
