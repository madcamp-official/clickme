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
  title: "스페인 vs 아르헨티나 — 오늘의 밸런스게임",
  description: "FIFA 월드컵 2026 결승, 스페인과 아르헨티나 중 우승 예측을 계속 눌러 참여하세요.",
  openGraph: {
    title: "스페인 vs 아르헨티나 — 오늘의 밸런스게임",
    description: "스페인? 아르헨티나? 우승 예측을 계속 눌러 보세요.",
    type: "website",
    locale: "ko_KR",
    siteName: "오늘의 밸런스게임",
  },
  twitter: {
    card: "summary",
    title: "스페인 vs 아르헨티나",
    description: "우승 예측을 계속 눌러 보세요.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
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
