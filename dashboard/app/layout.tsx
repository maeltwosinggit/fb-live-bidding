import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FB Live Bidding — Seller Dashboard",
  description: "Real-time auction leaderboard for Facebook Live sellers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
