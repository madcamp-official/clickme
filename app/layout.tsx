import type { Metadata, Viewport } from "next";

import "./globals.css";

function metadataBase(): URL {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title: "탕수육 부먹 vs 찍먹 — 오늘의 밸런스게임",
  description: "부먹과 찍먹, 마음 가는 쪽을 계속 눌러 불타는 취향 대결에 참여하세요.",
  openGraph: {
    title: "탕수육 부먹 vs 찍먹 — 오늘의 밸런스게임",
    description: "부먹? 찍먹? 진심을 담아 계속 눌러 보세요.",
    type: "website",
    locale: "ko_KR",
    siteName: "오늘의 밸런스게임",
  },
  twitter: {
    card: "summary",
    title: "탕수육 부먹 vs 찍먹",
    description: "마음 가는 쪽을 계속 눌러 보세요.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1a0a00",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
