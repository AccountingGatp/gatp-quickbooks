import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "GATP Ledger", template: "%s · GATP Ledger" },
  description: "Bulk import, export and delete for QuickBooks Online, across every GATP client company.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
