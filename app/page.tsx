import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import CyberBackground from "@/components/CyberBackground";

const FEATURES = [
  {
    icon: "ti-affiliate",
    title: "Network map",
    body: "An interactive force-graph of your connections clustered by company and coloured by sector. Drag, zoom and drill into any organisation.",
  },
  {
    icon: "ti-shield-search",
    title: "Authenticity scan",
    body: "Heuristically flags connections that look fake, spammy or low-information — scam terms, emoji names, duplicate profiles and more.",
  },
  {
    icon: "ti-lock",
    title: "Private by design",
    body: "Your LinkedIn export is parsed entirely in your browser. Nothing is uploaded, stored or sent anywhere.",
  },
];

export default function LandingPage() {
  return (
    <div style={{ position: "relative", zIndex: 1 }}>
      <CyberBackground />
      <header
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1rem 1.5rem",
          borderBottom: "0.5px solid var(--color-border-tertiary)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
          <i className="ti ti-brand-linkedin" style={{ color: "var(--color-text-info)", fontSize: 22 }} />
          AI LinkedIn Analyzer
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SignedOut>
            <Link href="/sign-in">
              <button>Log in</button>
            </Link>
            <Link href="/sign-up">
              <button className="primary">Get started</button>
            </Link>
          </SignedOut>
          <SignedIn>
            <Link href="/dashboard">
              <button className="primary">Open dashboard</button>
            </Link>
            <UserButton />
          </SignedIn>
        </div>
      </header>

      <main className="container" style={{ maxWidth: 880 }}>
        <section style={{ textAlign: "center", padding: "3rem 0 2rem" }}>
          <h1 style={{ fontSize: 40, lineHeight: 1.15, margin: "0 0 1rem" }}>
            See your LinkedIn network
            <br />
            the way a security analyst would.
          </h1>
          <p
            style={{
              fontSize: 18,
              color: "var(--color-text-secondary)",
              maxWidth: 620,
              margin: "0 auto 2rem",
            }}
          >
            Upload your LinkedIn data export and instantly map who you know by company and sector —
            then run an authenticity scan to surface fake or spammy connections. Parsed privately in
            your browser.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <SignedOut>
              <Link href="/sign-up">
                <button className="primary" style={{ padding: "10px 20px", fontSize: 15 }}>
                  Get started free
                </button>
              </Link>
              <Link href="/sign-in">
                <button style={{ padding: "10px 20px", fontSize: 15 }}>Log in</button>
              </Link>
            </SignedOut>
            <SignedIn>
              <Link href="/dashboard">
                <button className="primary" style={{ padding: "10px 20px", fontSize: 15 }}>
                  Open dashboard
                </button>
              </Link>
            </SignedIn>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 20,
            margin: "2rem 0 3rem",
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "var(--border-radius-lg)",
                padding: "1.25rem",
                background: "var(--color-background-secondary)",
              }}
            >
              <i className={`ti ${f.icon}`} style={{ fontSize: 24, color: "var(--color-text-info)" }} />
              <h3 style={{ margin: "0.75rem 0 0.4rem", fontSize: 17 }}>{f.title}</h3>
              <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-secondary)" }}>{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer
        style={{
          textAlign: "center",
          padding: "1.5rem",
          fontSize: 12,
          color: "var(--color-text-tertiary)",
          borderTop: "0.5px solid var(--color-border-tertiary)",
        }}
      >
        AI LinkedIn Analyzer · Your data never leaves your browser.
        <br />
        © 2026 Cyber Sense
      </footer>
    </div>
  );
}
