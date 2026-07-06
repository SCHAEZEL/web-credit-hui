function cashflows({ members, contribution, payoutPeriod, fee = 0 }) {
  const totalPeriods = members;
  const pool = members * contribution;
  const flows = [];
  for (let period = 1; period <= totalPeriods; period += 1) {
    const payout = period === payoutPeriod ? pool - fee : 0;
    flows.push(payout - contribution);
  }
  return flows;
}

function npv(rate, flows) {
  return flows.reduce((sum, cf, index) => sum + cf / Math.pow(1 + rate, index + 1), 0);
}

function solveRoot(flows, low, high, iterations = 100) {
  let lo = low;
  let hi = high;
  for (let i = 0; i < iterations; i += 1) {
    const mid = (lo + hi) / 2;
    const left = npv(lo, flows);
    const center = npv(mid, flows);
    if (Math.abs(center) < 1e-10) return mid;
    if (left * center <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

function possibleIrrs(flows, low = -0.95, high = 5, steps = 2000) {
  const roots = [];
  let previousRate = low;
  let previousValue = npv(previousRate, flows);
  for (let i = 1; i <= steps; i += 1) {
    const rate = low + ((high - low) * i) / steps;
    const value = npv(rate, flows);
    if (Math.abs(value) < 1e-8) roots.push(rate);
    if (previousValue * value < 0) roots.push(solveRoot(flows, previousRate, rate));
    previousRate = rate;
    previousValue = value;
  }
  return [...new Set(roots.map((rate) => Number(rate.toFixed(10))))];
}

function annualize(periodicRate, periodsPerYear = 12) {
  return Math.pow(1 + periodicRate, periodsPerYear) - 1;
}

const example = cashflows({ members: 10, contribution: 1000, payoutPeriod: 3 });
const roots = possibleIrrs(example);
console.log({
  cashflows: example,
  netCashflow: example.reduce((sum, cf) => sum + cf, 0),
  possibleMonthlyIrrs: roots,
  possibleAnnualIrrs: roots.map((rate) => annualize(rate, 12)),
  warning: "ROSCA cashflows may be non-conventional, so IRR can be zero, multiple, or economically misleading. Use cashflow timing and NPV scenarios together.",
});
