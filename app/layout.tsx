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
  title: "가장 좋아하는 KBO 야구팀은? — 오늘의 밸런스게임",
  description: "KBO 10개 구단 중 가장 좋아하는 팀을 계속 눌러 참여하세요.",
  openGraph: {
    title: "가장 좋아하는 KBO 야구팀은? — 오늘의 밸런스게임",
    description: "좋아하는 팀을 클릭하세요! 클릭할수록 더 많이 투표돼요.",
    type: "website",
    locale: "ko_KR",
    siteName: "오늘의 밸런스게임",
  },
  twitter: {
    card: "summary",
    title: "가장 좋아하는 KBO 야구팀은?",
    description: "좋아하는 팀을 계속 눌러 보세요.",
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
