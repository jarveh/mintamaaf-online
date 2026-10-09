export const APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:3000";
export const PUBLIC_PAGE_ORIGIN = process.env.PUBLIC_PAGE_ORIGIN || "http://localhost:3000";
export const COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-mintamaaf-owner" : "mintamaaf-owner";
export const LIMITS = {
  generationsPerSessionDay: Number(process.env.GENERATIONS_PER_SESSION_DAY || 1),
  revisionsPerPage: Number(process.env.REVISIONS_PER_PAGE || 1),
  globalDailyGenerationCap: Number(process.env.GLOBAL_DAILY_GENERATION_CAP || 20),
  expiryDays: Number(process.env.PAGE_EXPIRY_DAYS || 7),
};

export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
