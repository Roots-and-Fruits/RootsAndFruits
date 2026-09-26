import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "나무와열매 | 농장의 마음을 전해요",
    template: "%s | 나무와열매",
  },
  description: "농장에서 고른 과일을 소중한 사람에게. 나무와열매 택배 주문.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased font-sans">
      <body className="min-h-full">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:p-4 focus:text-primary-foreground"
        >
          본문으로 건너뛰기
        </a>
        {children}
      </body>
    </html>
  );
}
