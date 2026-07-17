import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export const randomBase64Url = (bytes = 32): string => randomBytes(bytes).toString("base64url");
export const randomId = (): string => randomUUID();
export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
