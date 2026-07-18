import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { getSupabaseConfig } from "./env";

let client: SupabaseClient<Database> | undefined;

async function fetchWithDeadline(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const timeout = AbortSignal.timeout(3_000);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (!client) {
    const { url, secretKey } = getSupabaseConfig();
    client = createClient<Database>(url, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: { "X-Client-Info": "clickme-server" },
        fetch: fetchWithDeadline,
      },
    });
  }

  return client;
}
