// Money is an integer number of minor units (cents) plus an ISO 4217 currency code.
// The API exchanges decimal strings ("15.99"), so floating-point never touches amounts.

const KNOWN_CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

export const isValidCurrency = (code: string) => KNOWN_CURRENCIES.has(code);

// Digits after the decimal point: USD 2, JPY 0, BHD 3
export function currencyExponent(currency: string): number {
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

// "15.99" USD -> 1599, "1500" JPY -> 1500. Throws on more decimals than the currency has
// ("15.999" USD) instead of silently rounding someone's price.
export function parseAmount(amount: string, currency: string): number {
  const match = DECIMAL.exec(amount.trim());
  if (!match) throw new Error('Amount must be a non-negative number like 9.99');

  const exponent = currencyExponent(currency);
  const whole = match[1]!;
  const fraction = match[2] ?? '';
  if (fraction.length > exponent) {
    throw new Error(
      exponent === 0
        ? `${currency} amounts can't have decimals`
        : `${currency} amounts have at most ${exponent} decimal places`,
    );
  }

  const minor = Number(whole + fraction.padEnd(exponent, '0'));
  if (!Number.isSafeInteger(minor)) throw new Error('Amount is too large');
  return minor;
}

// 1599 USD -> "15.99", 1500 JPY -> "1500"
export function formatAmount(minor: number, currency: string): string {
  const exponent = currencyExponent(currency);
  if (exponent === 0) return String(minor);
  const digits = String(minor).padStart(exponent + 1, '0');
  return `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

// ---------------------------------------------------------------------------------------------
// Recurring-cost math. Weekly plans make fractions of a cent (1.00/week = 4.3333.../month), so
// each subscription's cost is kept as an exact fraction of minor units (BigInt numerator and
// denominator). Fractions are summed per currency and rounded once, half up, at the end: three
// weekly 1.00 plans total exactly 13.00/month, not 3 x 4.33 = 12.99.
// ---------------------------------------------------------------------------------------------

export type BillingInterval = 'week' | 'month' | 'year';

interface Fraction {
  num: bigint;
  den: bigint;
}

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b));

function addFractions(a: Fraction, b: Fraction): Fraction {
  const num = a.num * b.den + b.num * a.den;
  const den = a.den * b.den;
  const divisor = gcd(num, den) || 1n;
  return { num: num / divisor, den: den / divisor };
}

// Half up to a whole number of minor units (amounts are never negative)
const roundHalfUp = ({ num, den }: Fraction): number => Number((2n * num + den) / (2n * den));

// Payments per year as a fraction. Weekly uses 52 weeks a year, as specified, so it slightly
// underestimates (a year has ~52.18 weeks).
export function paymentsPerYear(interval: BillingInterval, count: number): Fraction {
  const perYear = { week: 52n, month: 12n, year: 1n }[interval];
  return { num: perYear, den: BigInt(count) };
}

export interface RecurringCost {
  amountMinor: number;
  currency: string;
  interval: BillingInterval;
  count: number;
}

const annualFraction = (cost: RecurringCost): Fraction => {
  const perYear = paymentsPerYear(cost.interval, cost.count);
  return { num: BigInt(cost.amountMinor) * perYear.num, den: perYear.den };
};

export interface CurrencyTotal {
  currency: string;
  subscriptionCount: number;
  monthlyMinor: number;
  annualMinor: number;
}

// Totals per currency. Different currencies are never added together (no exchange rates).
export function totalsByCurrency(costs: RecurringCost[]): CurrencyTotal[] {
  const groups = new Map<string, { count: number; annual: Fraction }>();
  for (const cost of costs) {
    const group = groups.get(cost.currency) ?? { count: 0, annual: { num: 0n, den: 1n } };
    group.count += 1;
    group.annual = addFractions(group.annual, annualFraction(cost));
    groups.set(cost.currency, group);
  }

  return [...groups].map(([currency, { count, annual }]) => ({
    currency,
    subscriptionCount: count,
    monthlyMinor: roundHalfUp({ num: annual.num, den: annual.den * 12n }),
    annualMinor: roundHalfUp(annual),
  }));
}
