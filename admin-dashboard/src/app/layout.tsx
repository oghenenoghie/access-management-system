import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Royal Palms Estate — Management Administration Dashboard",
  description:
    "Centralised Estate Management Administration Dashboard for Resident Approval, Unit Control, Visitor Access Code Monitoring, Security Gate Reports & Investigations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
