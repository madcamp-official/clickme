export class ServerConfigurationError extends Error {
  constructor(variableName: string) {
    super(`Required server configuration is unavailable: ${variableName}`);
    this.name = "ServerConfigurationError";
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ServerConfigurationError(name);
  }
  return value;
}

export function getSupabaseConfig(): { url: string; secretKey: string } {
  const url = required("SUPABASE_URL");
  const secretKey = required("SUPABASE_SECRET_KEY");

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
      throw new Error("Unsupported protocol");
    }
  } catch {
    throw new ServerConfigurationError("SUPABASE_URL");
  }

  return { url, secretKey };
}

export function getVisitorHashSecret(): string {
  const secret = required("VISITOR_HASH_SECRET");
  if (secret.length < 32) {
    throw new ServerConfigurationError("VISITOR_HASH_SECRET");
  }
  return secret;
}

export function getSiteUrl(): string {
  const raw = required("NEXT_PUBLIC_SITE_URL");
  try {
    const value = new URL(raw);
    if (value.protocol !== "https:" && value.hostname !== "localhost" && value.hostname !== "127.0.0.1") {
      throw new Error("Unsupported site URL");
    }
    value.pathname = "/";
    value.search = "";
    value.hash = "";
    return value.toString().replace(/\/$/, "");
  } catch {
    throw new ServerConfigurationError("NEXT_PUBLIC_SITE_URL");
  }
}
