import { createHash, createHmac } from "node:crypto";

const REFERRAL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const EVENT_NAMES = new Set([
  "section_impression",
  "share_card_impression",
  "share_cta_clicked",
  "share_sheet_resolved",
  "share_sheet_cancelled",
  "share_link_copied",
  "share_image_downloaded",
  "referral_banner_impression",
  "rapid_click_lock_shown",
  "rapid_click_lock_confirmed",
  "vote_rate_limited",
  "vote_request_failed",
]);
const CHOICES = new Set(["dip", "pour"]);
const VARIANTS = new Set(["A", "B"]);
const SECTIONS = new Set(["scoreboard", "choice-dip", "choice-pour"]);
const EVENT_CODES = new Set([
  "RATE_LIMITED",
  "NETWORK_RATE_LIMITED",
  "CAPACITY_EXCEEDED",
  "SERVICE_UNAVAILABLE",
  "CAMPAIGN_ENDED",
  "SESSION_EXPIRED",
  "INVALID_VOTE",
  "CLIENT_ERROR",
  "HTTP_400",
  "HTTP_403",
  "HTTP_404",
  "HTTP_409",
  "HTTP_410",
  "HTTP_413",
  "HTTP_415",
  "HTTP_429",
  "HTTP_500",
  "HTTP_502",
  "HTTP_503",
  "HTTP_504",
]);

type EventPropertyRule = Record<string, (value: unknown) => string | number | boolean | null>;

const choice = (value: unknown) => typeof value === "string" && CHOICES.has(value) ? value : null;
const variant = (value: unknown) => typeof value === "string" && VARIANTS.has(value) ? value : null;
const nativeMethod = (value: unknown) => value === "native" ? value : null;
const section = (value: unknown) => typeof value === "string" && SECTIONS.has(value) ? value : null;
const eventCode = (value: unknown) => typeof value === "string" && EVENT_CODES.has(value) ? value : null;
const queueLength = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 30
  ? Number(value)
  : null;
const retrySeconds = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 60
  ? Number(value)
  : null;

const EVENT_PROPERTY_RULES: Record<string, EventPropertyRule> = {
  section_impression: { section },
  share_card_impression: { choice, variant },
  share_cta_clicked: { choice, variant },
  share_sheet_resolved: { choice, method: nativeMethod },
  share_sheet_cancelled: { choice, method: nativeMethod },
  share_link_copied: { choice },
  share_image_downloaded: { choice },
  referral_banner_impression: {},
  rapid_click_lock_shown: { queueLength },
  rapid_click_lock_confirmed: { queueLength },
  vote_rate_limited: { code: eventCode, retryAfterSeconds: retrySeconds },
  vote_request_failed: { code: eventCode },
};

const UTM_SOURCES = new Map([
  ["kakao", "kakao"],
  ["kakaotalk", "kakao"],
  ["instagram", "instagram"],
  ["facebook", "facebook"],
  ["twitter", "x"],
  ["x", "x"],
  ["youtube", "youtube"],
  ["naver", "naver"],
  ["google", "google"],
  ["discord", "discord"],
  ["slack", "slack"],
  ["email", "email"],
  ["qr", "qr"],
  ["offline", "offline"],
]);
const UTM_MEDIA = new Set(["social", "messenger", "referral", "cpc", "organic", "email", "qr", "offline"]);
const LANGUAGE_GROUPS = new Set(["ko", "en", "ja", "zh"]);

export function shortString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

export function optionalShortString(value: unknown, maxLength: number): string | null {
  return value === undefined || value === null || value === "" ? null : shortString(value, maxLength);
}

export function normalizePath(value: unknown): string | null {
  const path = shortString(value, 256);
  if (!path || !path.startsWith("/") || path.includes("?") || path.includes("#")) return null;
  if (/^\/r\/[A-Za-z0-9_-]{22}\/?$/.test(path)) return "/r/:token";
  return path === "/" ? path : null;
}

export function classifyReferrerHost(value: unknown, ownHost: string): string | null {
  const host = optionalShortString(value, 253);
  if (!host) return null;
  try {
    const parsed = new URL(`https://${host}`);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === ownHost || hostname.endsWith(`.${ownHost}`)) return "self";
    if (hostname === "t.co" || hostname === "x.com" || hostname.endsWith(".twitter.com")) return "x";
    if (hostname === "youtu.be" || hostname.endsWith(".youtube.com")) return "youtube";
    for (const known of ["kakao.com", "instagram.com", "facebook.com", "naver.com", "google.com", "discord.com", "slack.com"]) {
      if (hostname === known || hostname.endsWith(`.${known}`)) return known.replace(".com", "");
    }
    return "external";
  } catch {
    return null;
  }
}

export function classifyUtmSource(value: unknown): string | null {
  const normalized = optionalShortString(value, 100)?.toLowerCase();
  return normalized ? (UTM_SOURCES.get(normalized) ?? "other") : null;
}

export function classifyUtmMedium(value: unknown): string | null {
  const normalized = optionalShortString(value, 100)?.toLowerCase();
  return normalized ? (UTM_MEDIA.has(normalized) ? normalized : "other") : null;
}

export function opaqueAnalyticsLabel(
  value: unknown,
  namespace: "campaign" | "content" | "term",
  secret: string,
): string | null {
  const normalized = optionalShortString(value, 100);
  if (!normalized) return null;
  return `h_${createHmac("sha256", secret)
    .update(`clickme-utm:${namespace}:v1:${normalized}`, "utf8")
    .digest("hex")
    .slice(0, 24)}`;
}

export function normalizeLanguage(value: unknown): string | null {
  const normalized = optionalShortString(value, 16)?.replaceAll("_", "-");
  if (!normalized || !/^[A-Za-z]{2,3}(?:-[A-Za-z]{2})?$/.test(normalized)) return null;
  const primary = normalized.split("-", 1)[0].toLowerCase();
  return LANGUAGE_GROUPS.has(primary) ? primary : "Other";
}

export function classifyTimeZone(value: unknown): string | null {
  const normalized = optionalShortString(value, 64);
  if (!normalized) return null;
  return normalized === "Asia/Seoul" ? "Asia/Seoul" : "Other";
}

export function dimensionBucket(value: unknown): number | null {
  const dimension = boundedInteger(value, 1, 20_000);
  if (dimension === null) return null;
  if (dimension < 480) return 1;
  if (dimension < 768) return 2;
  if (dimension < 1_024) return 3;
  if (dimension < 1_440) return 4;
  return 5;
}

export function normalizeReferralToken(value: unknown): string | null {
  return typeof value === "string" && REFERRAL_TOKEN_PATTERN.test(value) ? value : null;
}

export function hashReferralToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function classifyClient(userAgent: string | null): {
  browserFamily: string;
  osFamily: string;
  deviceType: string;
} {
  const ua = userAgent ?? "";
  const browserFamily = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Other";
  const osFamily = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Other";
  const deviceType = /iPad|Tablet/.test(ua)
    ? "tablet"
    : /Mobile|Android|iPhone|iPod/.test(ua)
      ? "mobile"
      : "desktop";
  return { browserFamily, osFamily, deviceType };
}

export function boundedInteger(value: unknown, min: number, max: number): number | null {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max
    ? Number(value)
    : null;
}

export type ValidAnalyticsEvent = {
  id: string;
  eventName: string;
  occurredAt: string;
  pageViewId: string;
  properties: Record<string, string | number | boolean>;
};

export function validateEvents(
  value: unknown,
  pageViewId: string,
  isUuid: (candidate: unknown) => candidate is string,
): ValidAnalyticsEvent[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return null;
  const now = Date.now();
  const result: ValidAnalyticsEvent[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const raw = item as Record<string, unknown>;
    if (!isUuid(raw.id) || typeof raw.name !== "string" || !EVENT_NAMES.has(raw.name)) return null;
    if (typeof raw.occurredAt !== "string") return null;
    const occurredAt = Date.parse(raw.occurredAt);
    if (!Number.isFinite(occurredAt) || occurredAt < now - 86_400_000 || occurredAt > now + 60_000) return null;
    const rawProperties = raw.properties ?? {};
    if (!rawProperties || typeof rawProperties !== "object" || Array.isArray(rawProperties)) return null;
    const properties: Record<string, string | number | boolean> = {};
    const rules = EVENT_PROPERTY_RULES[raw.name];
    const entries = Object.entries(rawProperties as Record<string, unknown>);
    if (!rules || entries.length !== Object.keys(rules).length) return null;
    for (const [key, propertyValue] of entries) {
      if (!Object.hasOwn(rules, key)) return null;
      const validator = rules[key];
      if (typeof validator !== "function") return null;
      const normalized = validator(propertyValue);
      if (normalized === null || normalized === undefined) return null;
      properties[key] = normalized;
    }
    result.push({
      id: raw.id,
      eventName: raw.name,
      occurredAt: new Date(occurredAt).toISOString(),
      pageViewId,
      properties,
    });
  }
  return result;
}

export { REFERRAL_TOKEN_PATTERN };
