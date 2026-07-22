import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { TeamVoteArena } from "@/components/team-vote-arena";
import { CRITICAL_DATABASE_RESERVE, shareResolveCapacity, tryAcquireDatabase } from "@/lib/server/capacity";
import { resolveShareToken, resolveTeamShareToken, TEAM_CARD_INFO } from "@/lib/server/shares";

const REFERRAL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

// Korean object-marker particle (을/를): 을 follows a syllable with a final
// consonant (받침), 를 follows one without. Team names aren't fixed English
// strings, so this can't be hardcoded per choice the way "찍먹"/"부먹" were.
function objectParticle(word: string): "을" | "를" {
  const code = word.codePointAt(word.length - 1) ?? 0;
  if (code < 0xac00 || code > 0xd7a3) return "를";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}

export const dynamic = "force-dynamic";

// The live site is now the team-voting page (see app/page.tsx), but share
// links created before that switch still point here. team_share_links and
// the older share_links table are fully separate (20260722010000), so a
// token might resolve against either one -- try team first since that's the
// common case now, then fall back to the binary table for legacy links.
const getReferral = cache(async (token: string) => {
  // Keep this check ahead of resolution: malformed-token floods must not
  // perform a database lookup.
  if (!REFERRAL_TOKEN_PATTERN.test(token)) return null;
  if (
    process.env.NODE_ENV !== "production"
    && process.env.PLAYWRIGHT_REFERRAL_TOKEN === token
  ) {
    return { kind: "team" as const, choice: "kia" as const, image_path: null };
  }
  const release = tryAcquireDatabase(shareResolveCapacity, CRITICAL_DATABASE_RESERVE);
  if (!release) throw new Error("Referral lookup is temporarily unavailable");
  try {
    const team = await resolveTeamShareToken(token);
    if (team.error) throw new Error("Referral lookup is temporarily unavailable");
    if (team.data) return { kind: "team" as const, choice: team.data.choice, image_path: team.data.image_path };

    const binary = await resolveShareToken(token);
    if (binary.error) throw new Error("Referral lookup is temporarily unavailable");
    if (binary.data) return { kind: "binary" as const, choice: binary.data.choice, image_path: binary.data.image_path };

    return null;
  } catch {
    throw new Error("Referral lookup is temporarily unavailable");
  } finally {
    release();
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const referral = await getReferral(token);
  if (!referral) return { robots: { index: false, follow: false, noarchive: true } };

  const label = referral.kind === "team"
    ? TEAM_CARD_INFO[referral.choice].name
    : (referral.choice === "dip" ? "찍먹" : "부먹");
  const title = `친구는 ${label}${objectParticle(label)} 골랐어요 — 당신의 선택은?`;
  const description = referral.kind === "team"
    ? "가장 좋아하는 KBO 야구팀, 직접 선택해서 참여해 보세요."
    : "부먹과 찍먹, 직접 선택해서 취향 대결을 이어가세요.";
  const image = referral.image_path ? `/api/share-images/${token}.png` : null;

  return {
    title,
    description,
    robots: { index: false, follow: false, noarchive: true },
    openGraph: {
      title,
      description,
      type: "website",
      locale: "ko_KR",
      siteName: "오늘의 밸런스게임",
      ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: `${label} 선택 결과` }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function ReferralPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!await getReferral(token)) notFound();

  // The live page is always the current team-voting arena regardless of
  // which table the token resolved against -- a legacy binary share link
  // still lands visitors on today's actual topic, it just doesn't carry
  // referral-attribution analytics the way a same-system share would.
  return <TeamVoteArena referralToken={token} />;
}
