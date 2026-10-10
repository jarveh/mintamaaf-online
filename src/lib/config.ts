export const APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:3000";
export const PUBLIC_PAGE_ORIGIN = process.env.PUBLIC_PAGE_ORIGIN || "http://localhost:3000";
export const COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-mintamaaf-owner" : "mintamaaf-owner";
// Beta mode: effectively unlimited. Counters still record every attempt, so
// re-tightening later is only an env-var/defaults change (see .env.example).
const UNLIMITED = 999_999;
export const LIMITS = {
  generationsPerSessionDay: Number(process.env.GENERATIONS_PER_SESSION_DAY || UNLIMITED),
  revisionsPerPage: Number(process.env.REVISIONS_PER_PAGE || UNLIMITED),
  globalDailyGenerationCap: Number(process.env.GLOBAL_DAILY_GENERATION_CAP || UNLIMITED),
  generationsPerIpDay: Number(process.env.GENERATIONS_PER_IP_DAY || UNLIMITED),
  expiryDays: Number(process.env.PAGE_EXPIRY_DAYS || 7),
};

export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
