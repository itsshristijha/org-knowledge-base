import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Northstar — Organizational Memory",
  description: "Grounded answers and source-linked organizational knowledge.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
