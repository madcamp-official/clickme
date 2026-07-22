import { createHash, createHmac } from "node:crypto";

import sharp from "sharp";

import { CRITICAL_DATABASE_RESERVE, tryAcquireDatabase } from "./capacity";
import type { Choice, TeamChoice } from "./contracts";
import { getSiteUrl, getVisitorHashSecret } from "./env";
import { getSupabaseAdmin } from "./supabase";

export const TEAM_CARD_INFO: Record<TeamChoice, { name: string; color: string }> = {
  kia: { name: "KIA 타이거즈", color: "#E61E23" },
  samsung: { name: "삼성 라이온즈", color: "#0066B3" },
  lg: { name: "LG 트윈스", color: "#C60C30" },
  doosan: { name: "두산 베어스", color: "#5A7FC2" },
  kt: { name: "KT 위즈", color: "#D0021B" },
  ssg: { name: "SSG 랜더스", color: "#CE0E2D" },
  lotte: { name: "롯데 자이언츠", color: "#0055A4" },
  hanwha: { name: "한화 이글스", color: "#FF6600" },
  nc: { name: "NC 다이노스", color: "#315288" },
  kiwoom: { name: "키움 히어로즈", color: "#820024" },
};

export const SHARE_CARD_BUCKET = "share-cards";
const SHARE_CARD_MAX_BYTES = 524_288;
const SHARE_CARD_MIME_TYPES = ["image/png"];
const NEGATIVE_TOKEN_TTL_MS = 60_000;
const NEGATIVE_TOKEN_CACHE_MAX = 10_000;
const negativeTokenCache = new Map<string, number>();
let shareCardBucketReady: Promise<boolean> | undefined;

function isMissingBucketError(error: {
  status?: number;
  statusCode?: string;
} | null): boolean {
  // Supabase Storage can wrap its own 404 payload in an HTTP 400 response.
  // `statusCode` carries the Storage-domain status in that case.
  return error?.status === 404 || error?.statusCode === "404";
}

export function createShareToken(visitorHash: string, idempotencyKey: string): string {
  return createHmac("sha256", getVisitorHashSecret())
    .update(`clickme-share:v1:${visitorHash}:${idempotencyKey}`, "utf8")
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function shareUrl(token: string): string {
  return `${getSiteUrl()}/r/${token}`;
}

export function shareImageUrl(token: string): string {
  return `${getSiteUrl()}/api/share-images/${token}.png`;
}

function safeCount(value: unknown): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

export async function renderShareCard(
  choice: Choice,
  dipValue: unknown,
  pourValue: unknown,
): Promise<Buffer> {
  const dip = safeCount(dipValue);
  const pour = safeCount(pourValue);
  const total = dip + pour;
  const dipPercent = total === 0 ? 50 : Math.round((dip / total) * 100);
  const pourPercent = 100 - dipPercent;
  const picked = choice === "dip" ? "DIP" : "POUR";
  const pickedColor = choice === "dip" ? "#24a8ff" : "#ff3c16";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#1a0700"/><stop offset="1" stop-color="#5b1300"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#bg)"/>
      <rect x="38" y="38" width="1124" height="554" rx="28" fill="none" stroke="#ffd800" stroke-width="8"/>
      <text x="600" y="128" fill="#fff1cf" font-family="Arial,sans-serif" font-size="42" font-weight="700" text-anchor="middle">TANGSUYUK BALANCE</text>
      <text x="600" y="226" fill="${pickedColor}" font-family="Arial Black,Arial,sans-serif" font-size="96" font-weight="900" text-anchor="middle">I PICK ${picked}</text>
      <rect x="120" y="300" width="960" height="74" rx="37" fill="#2b0c05" stroke="#fff1cf" stroke-width="4"/>
      <rect x="120" y="300" width="${Math.max(1, Math.round(960 * pourPercent / 100))}" height="74" rx="37" fill="#ff3c16"/>
      <text x="130" y="447" fill="#ff8b73" font-family="Arial Black,Arial,sans-serif" font-size="58">POUR ${pourPercent}%</text>
      <text x="1070" y="447" fill="#6cc6ff" font-family="Arial Black,Arial,sans-serif" font-size="58" text-anchor="end">DIP ${dipPercent}%</text>
      <text x="600" y="535" fill="#fff1cf" font-family="Arial,sans-serif" font-size="34" text-anchor="middle">MAKE YOUR CHOICE</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

export async function renderTeamShareCard(
  choice: TeamChoice,
  voteCountValue: unknown,
  totalCountValue: unknown,
): Promise<Buffer> {
  const voteCount = safeCount(voteCountValue);
  const total = safeCount(totalCountValue);
  const percent = total === 0 ? 0 : Math.round((voteCount / total) * 100);
  const team = TEAM_CARD_INFO[choice];
  const barWidth = Math.max(1, Math.round(960 * percent / 100));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#09090f"/><stop offset="1" stop-color="#12121e"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#bg)"/>
      <rect x="38" y="38" width="1124" height="554" rx="28" fill="none" stroke="${team.color}" stroke-width="8"/>
      <text x="600" y="128" fill="#f5f5fa" font-family="sans-serif" font-size="34" font-weight="700" text-anchor="middle" letter-spacing="6">⚡ 오늘의 밸런스게임 ⚡</text>
      <text x="600" y="240" fill="${team.color}" font-family="sans-serif" font-size="80" font-weight="900" text-anchor="middle">나는 ${team.name}파!</text>
      <rect x="120" y="320" width="960" height="74" rx="37" fill="#1c1c2c" stroke="#f5f5fa" stroke-width="4"/>
      <rect x="120" y="320" width="${barWidth}" height="74" rx="37" fill="${team.color}"/>
      <text x="600" y="470" fill="${team.color}" font-family="sans-serif" font-size="64" font-weight="900" text-anchor="middle">${team.name} ${percent}%</text>
      <text x="600" y="520" fill="#8a8aa0" font-family="sans-serif" font-size="30" text-anchor="middle">전체 ${total.toLocaleString("ko-KR")}표 중</text>
      <text x="600" y="575" fill="#f5f5fa" font-family="sans-serif" font-size="30" text-anchor="middle">당신의 최애 구단은?</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

async function configureShareCardBucket(): Promise<boolean> {
  const storage = getSupabaseAdmin().storage;
  const existing = await storage.getBucket(SHARE_CARD_BUCKET);
  if (existing.error && !isMissingBucketError(existing.error)) return false;

  if (!existing.data) {
    const created = await storage.createBucket(SHARE_CARD_BUCKET, {
      public: false,
      fileSizeLimit: SHARE_CARD_MAX_BYTES,
      allowedMimeTypes: SHARE_CARD_MIME_TYPES,
    });
    // A concurrent worker may create the bucket after our read. In either
    // case, updateBucket below is the authoritative privacy/size check.
    if (created.error && created.error.status !== 409) return false;
  }

  const updated = await storage.updateBucket(SHARE_CARD_BUCKET, {
    public: false,
    fileSizeLimit: SHARE_CARD_MAX_BYTES,
    allowedMimeTypes: SHARE_CARD_MIME_TYPES,
  });
  return !updated.error;
}

async function ensureShareCardBucket(): Promise<boolean> {
  if (!shareCardBucketReady) {
    shareCardBucketReady = configureShareCardBucket().catch(() => false);
  }

  const pending = shareCardBucketReady;
  const ready = await pending;
  if (!ready && shareCardBucketReady === pending) {
    // Let a later share retry a transient Storage outage, while coalescing
    // concurrent requests during a single attempt.
    shareCardBucketReady = undefined;
  }
  return ready;
}

export async function storeShareCard(
  campaignId: string,
  shareId: string,
  png: Buffer,
  table: "share_links" | "team_share_links" = "share_links",
): Promise<string | null> {
  if (!(await ensureShareCardBucket())) return null;

  const path = `${shareId}.png`;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(SHARE_CARD_BUCKET).upload(path, png, {
    cacheControl: "31536000",
    contentType: "image/png",
    upsert: true,
  });
  if (error) return null;

  const releaseDatabase = tryAcquireDatabase(undefined, CRITICAL_DATABASE_RESERVE);
  if (!releaseDatabase) {
    await supabase.storage.from(SHARE_CARD_BUCKET).remove([path]);
    return null;
  }

  let updateWasUncertain = false;
  const updateResult = await (async () => {
    try {
      return await supabase
        .from(table)
        .update({ image_path: path })
        .eq("id", shareId)
        .eq("campaign_id", campaignId)
        .select("id")
        .abortSignal(AbortSignal.timeout(3_000))
        .maybeSingle();
    } finally {
      releaseDatabase();
    }
  })().catch(() => {
    updateWasUncertain = true;
    return null;
  });
  if (updateResult?.data && !updateResult.error) return path;

  const updateHadTransportFailure = updateWasUncertain || updateResult?.status === 0;
  if (!updateHadTransportFailure) {
    await supabase.storage.from(SHARE_CARD_BUCKET).remove([path]);
    return null;
  }

  // A timeout can happen after Postgres committed the UPDATE. Confirm before
  // deleting; if confirmation is also unavailable, an orphan object is safer
  // than a permanent DB reference to an object we removed.
  const releaseConfirmation = tryAcquireDatabase(undefined, CRITICAL_DATABASE_RESERVE);
  if (!releaseConfirmation) return null;
  let confirmationWasUncertain = false;
  const confirmation = await (async () => {
    try {
      return await supabase
        .from(table)
        .select("image_path")
        .eq("id", shareId)
        .eq("campaign_id", campaignId)
        .abortSignal(AbortSignal.timeout(3_000))
        .maybeSingle();
    } finally {
      releaseConfirmation();
    }
  })().catch(() => {
    confirmationWasUncertain = true;
    return null;
  });
  if (confirmation?.data?.image_path === path && !confirmation.error) return path;
  if (confirmationWasUncertain || confirmation?.error) return null;

  await supabase.storage.from(SHARE_CARD_BUCKET).remove([path]);
  return null;
}

export async function downloadShareCard(path: string): Promise<{
  data: ArrayBuffer | null;
  status: number | null;
}> {
  const { data, error } = await getSupabaseAdmin().storage.from(SHARE_CARD_BUCKET).download(path);
  return error || !data
    ? { data: null, status: error?.status ?? null }
    : { data: await data.arrayBuffer(), status: 200 };
}

export async function resolveShareToken(token: string) {
  const now = Date.now();
  const tokenHash = hashShareToken(token);
  const cachedUntil = negativeTokenCache.get(tokenHash);
  if (cachedUntil && cachedUntil > now) {
    return { data: null, error: null };
  }
  if (cachedUntil) negativeTokenCache.delete(tokenHash);

  const result = await getSupabaseAdmin()
    .rpc("resolve_share_link", { p_token_hash: tokenHash })
    .abortSignal(AbortSignal.timeout(2_000))
    .maybeSingle();
  if (!result.data && !result.error) {
    if (negativeTokenCache.size >= NEGATIVE_TOKEN_CACHE_MAX) {
      const oldest = negativeTokenCache.keys().next().value;
      if (oldest) negativeTokenCache.delete(oldest);
    }
    negativeTokenCache.set(tokenHash, now + NEGATIVE_TOKEN_TTL_MS);
  }
  return result;
}

// team_share_links is a fully separate table from share_links (see the
// 20260722010000 migration), but token hashes from both systems share one
// 128-bit HMAC token space -- collision odds are negligible, so reusing the
// same negativeTokenCache Map for both resolvers is safe and avoids a
// redundant DB hit on a token that's already known-missing from either side.
export async function resolveTeamShareToken(token: string) {
  const now = Date.now();
  const tokenHash = hashShareToken(token);
  const cachedUntil = negativeTokenCache.get(tokenHash);
  if (cachedUntil && cachedUntil > now) {
    return { data: null, error: null };
  }
  if (cachedUntil) negativeTokenCache.delete(tokenHash);

  const result = await getSupabaseAdmin()
    .rpc("resolve_team_share_link", { p_token_hash: tokenHash })
    .abortSignal(AbortSignal.timeout(2_000))
    .maybeSingle();
  if (!result.data && !result.error) {
    if (negativeTokenCache.size >= NEGATIVE_TOKEN_CACHE_MAX) {
      const oldest = negativeTokenCache.keys().next().value;
      if (oldest) negativeTokenCache.delete(oldest);
    }
    negativeTokenCache.set(tokenHash, now + NEGATIVE_TOKEN_TTL_MS);
  }
  return result;
}
