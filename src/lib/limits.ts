import { LIMITS } from "./config";
import { supabase } from "./supabase";
import { createHash } from "node:crypto";

function day(): string { return new Date().toISOString().slice(0, 10); }

async function incrementLimited(scope: string, limit: number): Promise<boolean> {
  const { data, error } = await supabase.rpc("bump_counter", { p_scope: scope, p_period: day(), p_amount: 1 });
  if (error) throw error;
  return Number(data) <= limit;
}

export async function generationAllowed(ownerHash: string): Promise<boolean> {
  const ownerOk = await incrementLimited(`limit:owner:${ownerHash}`, LIMITS.generationsPerSessionDay);
  if (!ownerOk) return false;
  return incrementLimited("limit:global", LIMITS.globalDailyGenerationCap);
}

export async function ipAllowed(ip: string, action: string, limit: number): Promise<boolean> {
  const digest = createHash("sha256").update(ip).digest("hex");
  return incrementLimited(`limit:ip:${action}:${digest}`, limit);
}

export async function recordMetric(name: string): Promise<void> {
  const { error } = await supabase.rpc("bump_counter", { p_scope: `metric:${name}`, p_period: day(), p_amount: 1 });
  if (error) throw error;
}

export async function recordStorageBytes(bytes: number): Promise<void> {
  const { error } = await supabase.rpc("bump_counter", { p_scope: "metric:storage_bytes", p_period: day(), p_amount: bytes });
  if (error) throw error;
}
