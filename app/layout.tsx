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
  title: "이채영 vs 백지헌 — 오늘의 밸런스게임",
  description: "FROMIS_9 이채영과 백지헌, 최애를 계속 눌러 참여하세요.",
  openGraph: {
    title: "이채영 vs 백지헌 — 오늘의 밸런스게임",
    description: "이채영? 백지헌? 최애를 계속 눌러 보세요.",
    type: "website",
    locale: "ko_KR",
    siteName: "오늘의 밸런스게임",
  },
  twitter: {
    card: "summary",
    title: "이채영 vs 백지헌",
    description: "최애를 계속 눌러 보세요.",
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
