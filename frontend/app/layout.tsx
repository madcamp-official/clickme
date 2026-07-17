import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WishMatch',
  description: '팬사인회 프리퀀시 공동구매 매칭 플랫폼',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
