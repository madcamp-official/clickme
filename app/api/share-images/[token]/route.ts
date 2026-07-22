import { NextResponse } from "next/server";

import { REFERRAL_TOKEN_PATTERN } from "../../../../lib/server/analytics-validation";
import {
  CRITICAL_DATABASE_RESERVE,
  shareImageCapacity,
  tryAcquireDatabase,
} from "../../../../lib/server/capacity";
import { downloadShareCard, resolveShareToken, resolveTeamShareToken } from "../../../../lib/server/shares";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function unavailable() {
  return new NextResponse(null, {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": "1",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const rawToken = (await context.params).token;
  const token = rawToken.endsWith(".png") ? rawToken.slice(0, -4) : "";
  if (!REFERRAL_TOKEN_PATTERN.test(token)) return new NextResponse(null, { status: 404 });
  const releaseImage = shareImageCapacity.tryAcquire();
  if (!releaseImage) return unavailable();

  try {
    const releaseDatabase = tryAcquireDatabase(undefined, CRITICAL_DATABASE_RESERVE);
    if (!releaseDatabase) return unavailable();
    const resolved = await (async () => {
      try {
        const binary = await resolveShareToken(token);
        if (binary.data || binary.error) return binary;
        // team_share_links is a separate table (see 20260722010000); a token
        // that isn't a binary share might still be a team one.
        return await resolveTeamShareToken(token);
      } finally {
        releaseDatabase();
      }
    })();
    const { data, error } = resolved;
    if (error) return unavailable();
    if (!data) return new NextResponse(null, { status: 404 });
    if (!data.image_path) return new NextResponse(null, { status: 404 });
    const stored = await downloadShareCard(data.image_path);
    if (!stored.data) {
      return stored.status === 404 ? new NextResponse(null, { status: 404 }) : unavailable();
    }
    return new NextResponse(stored.data, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "image/png",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return unavailable();
  } finally {
    releaseImage();
  }
}
