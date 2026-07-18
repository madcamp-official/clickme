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
  title: "카리나 vs 장원영 — 오늘의 밸런스게임",
  description: "카리나와 장원영, 마음 가는 쪽을 계속 눌러 취향 대결에 참여하세요.",
  openGraph: {
    title: "카리나 vs 장원영 — 오늘의 밸런스게임",
    description: "카리나? 장원영? 진심을 담아 계속 눌러 보세요.",
    type: "website",
    locale: "ko_KR",
    siteName: "오늘의 밸런스게임",
  },
  twitter: {
    card: "summary",
    title: "카리나 vs 장원영",
    description: "마음 가는 쪽을 계속 눌러 보세요.",
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
