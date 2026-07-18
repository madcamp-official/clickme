import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { VoteArena } from "@/components/vote-arena";
import { CRITICAL_DATABASE_RESERVE, shareResolveCapacity, tryAcquireDatabase } from "@/lib/server/capacity";
import { createReferralReceipt } from "@/lib/server/referral-receipt";
import { resolveShareToken } from "@/lib/server/shares";

const REFERRAL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export const dynamic = "force-dynamic";

const getReferral = cache(async (token: string) => {
  // Keep this check ahead of resolution: malformed-token floods must not
  // perform a database lookup.
  if (!REFERRAL_TOKEN_PATTERN.test(token)) return null;
  if (
    process.env.NODE_ENV !== "production"
    && process.env.PLAYWRIGHT_REFERRAL_TOKEN === token
  ) {
    return { choice: "dip" as const, image_path: null };
  }
  const release = tryAcquireDatabase(shareResolveCapacity, CRITICAL_DATABASE_RESERVE);
  if (!release) throw new Error("Referral lookup is temporarily unavailable");
  try {
    const { data, error } = await resolveShareToken(token);
    if (error) throw new Error("Referral lookup is temporarily unavailable");
    return data;
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

  const label = referral.choice === "dip" ? "찍먹" : "부먹";
  const title = `친구는 ${label}을 골랐어요 — 당신의 선택은?`;
  const description = "부먹과 찍먹, 직접 선택해서 취향 대결을 이어가세요.";
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

  return <VoteArena referralReceipt={createReferralReceipt(token)} referralToken={token} />;
}
