import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI LinkedIn Analyzer",
  description:
    "Map your LinkedIn network by company and sector, and flag suspicious connections — all parsed privately in your browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <link
            rel="stylesheet"
            href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3/dist/tabler-icons.min.css"
          />
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
