import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareClosure — Recovery Rail",
  description:
    "Turns a discharge plan into a live chain of obligations across hospital, GP, pharmacy, community and home, and surfaces only the exceptions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
