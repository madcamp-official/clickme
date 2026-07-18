import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { normalizeReferralToken } from "./analytics-validation";
import { getVisitorHashSecret } from "./env";

const RECEIPT_TTL_MS = 10 * 60 * 1_000;
const RECEIPT_PATTERN = /^[A-Za-z0-9_-]{100,512}\.[A-Za-z0-9_-]{43}$/;

type ReceiptPayload = {
  exp: number;
  nonce: string;
  tokenHash: string;
};

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function signature(encodedPayload: string): string {
  return createHmac("sha256", getVisitorHashSecret())
    .update(`clickme-referral-receipt:v1:${encodedPayload}`, "utf8")
    .digest("base64url");
}

export function createReferralReceipt(token: string, now = Date.now()): string {
  const normalizedToken = normalizeReferralToken(token);
  if (!normalizedToken) throw new Error("Cannot sign an invalid referral token");
  const payload: ReceiptPayload = {
    exp: now + RECEIPT_TTL_MS,
    nonce: randomBytes(16).toString("base64url"),
    tokenHash: tokenHash(normalizedToken),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyReferralReceipt(
  receipt: unknown,
  token: string,
  now = Date.now(),
): boolean {
  if (typeof receipt !== "string" || !RECEIPT_PATTERN.test(receipt)) return false;
  const separator = receipt.lastIndexOf(".");
  const encoded = receipt.slice(0, separator);
  const receivedSignature = receipt.slice(separator + 1);
  const expectedSignature = signature(encoded);
  const received = Buffer.from(receivedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;

  let payload: ReceiptPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ReceiptPayload;
  } catch {
    return false;
  }
  const normalizedToken = normalizeReferralToken(token);
  if (
    !normalizedToken
    || !Number.isSafeInteger(payload.exp)
    || payload.exp <= now
    || payload.exp > now + RECEIPT_TTL_MS
    || typeof payload.nonce !== "string"
    || !/^[A-Za-z0-9_-]{22}$/.test(payload.nonce)
    || typeof payload.tokenHash !== "string"
    || !/^[0-9a-f]{64}$/.test(payload.tokenHash)
    || payload.tokenHash !== tokenHash(normalizedToken)
  ) {
    return false;
  }
  return true;
}
