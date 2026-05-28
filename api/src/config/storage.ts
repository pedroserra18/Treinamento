import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

// Singleton Supabase client for Storage. Created lazily so the API still
// boots in development without the Storage env vars set — endpoints that
// need it surface a 503 with a clear message instead.

let client: SupabaseClient | null = null;

export function isStorageConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey && env.supabaseStorageBucket);
}

export function getStorageClient(): SupabaseClient {
  if (!client) {
    if (!isStorageConfigured()) {
      throw new Error("Supabase Storage is not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET.");
    }
    client = createClient(env.supabaseUrl as string, env.supabaseServiceRoleKey as string, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client;
}

export function getStorageBucket(): string {
  if (!env.supabaseStorageBucket) {
    throw new Error("SUPABASE_STORAGE_BUCKET is not configured");
  }
  return env.supabaseStorageBucket;
}
