import type { Metadata } from "next";
import type { ReactNode } from "react";
import shareCard from "../../public/brand/share-card.png";
import "./globals.css";

const siteTitle = "나무와열매 | TREE & BERRY FARM";
const siteDescription =
  "산지에서 갓 수확한 신선함 그대로. 농장에서 준비한 과일을 구매하거나 직접 체험한 과일을 소중한 사람에게 보내세요.";
const shareImage = {
  url: shareCard.src,
  width: shareCard.width,
  height: shareCard.height,
  alt: "나무와열매 TREE & BERRY FARM · 상품 구매와 체험 과일 보내기",
  type: "image/png",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "https://www.2180.co.kr"),
  title: {
    default: siteTitle,
    template: "%s | 나무와열매",
  },
  description: siteDescription,
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "나무와열매 · TREE & BERRY FARM",
    title: siteTitle,
    description: siteDescription,
    url: "./",
    images: [shareImage],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: [shareImage],
  },
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
