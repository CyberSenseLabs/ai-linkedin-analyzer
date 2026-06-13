import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import AnalyzerApp from "@/components/AnalyzerApp";

// Per-user, auth-gated route — never statically prerendered.
export const dynamic = "force-dynamic";

// Protected by middleware.ts — only signed-in users reach this route.
export default function DashboardPage() {
  return (
    <div>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.85rem 1.5rem",
          borderBottom: "0.5px solid var(--color-border-tertiary)",
          position: "sticky",
          top: 0,
          background: "var(--color-background-primary)",
          zIndex: 10,
        }}
      >
        <Link
          href="/"
          style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500, textDecoration: "none", color: "var(--color-text-primary)" }}
        >
          <i className="ti ti-brand-linkedin" style={{ color: "var(--color-text-info)", fontSize: 22 }} />
          AI LinkedIn Analyzer
        </Link>
        <UserButton afterSignOutUrl="/" />
      </header>
      <main className="container">
        <AnalyzerApp />
      </main>
    </div>
  );
}
