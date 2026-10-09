import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { required } from "./config";

let client: SupabaseClient | undefined;
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    client ||= createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  }
});
