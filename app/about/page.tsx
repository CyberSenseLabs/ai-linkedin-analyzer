import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";

export const metadata = {
  title: "About · AI LinkedIn Analyzer",
  description: "What the AI LinkedIn Analyzer does, how it works, and why it's private by design.",
};

const STEPS = [
  {
    icon: "ti-upload",
    title: "1 · Upload your export — in your browser",
    body: "You drop in the .zip you download from LinkedIn. Your browser opens it and reads your Connections.csv locally. The file never leaves your device — there is no upload to a server.",
  },
  {
    icon: "ti-affiliate",
    title: "2 · See your network mapped",
    body: "It builds an interactive graph of your connections, clustered by company and coloured by industry sector, so you can see at a glance who you know and where.",
  },
  {
    icon: "ti-shield-search",
    title: "3 · Run an authenticity scan",
    body: "A set of heuristics flags connections that look fake, spammy or low-information — scam terms, emoji names, duplicate or empty profiles, missing details, and more.",
  },
];

const PRIVACY = [
  {
    icon: "ti-browser",
    title: "Processed in your browser",
    body: "Unzipping, parsing, the network map and the scan all run client-side, in your browser tab. Your connections are never sent to our server.",
  },
  {
    icon: "ti-database-off",
    title: "Nothing is stored",
    body: "There is no database of your data. Names, companies and connections live only in your browser's memory — close the tab and they're gone. Sign-in only controls who can open the app.",
  },
  {
    icon: "ti-key",
    title: "Optional enrichment, your key",
    body: "The optional Apify enrichment is the only thing that can leave your browser. It's opt-in, uses your own Apify key (kept only in your browser), sends just the profile links you chose, and the relay that forwards it stores and logs nothing.",
  },
];

export default function AboutPage() {
  return (
    <div style={{ position: "relative", zIndex: 1 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1rem 1.5rem",
          borderBottom: "0.5px solid var(--color-border-tertiary)",
        }}
      >
        <Link
          href="/"
          style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500, textDecoration: "none", color: "var(--color-text-primary)" }}
        >
          <i className="ti ti-brand-linkedin" style={{ color: "var(--color-text-info)", fontSize: 22 }} />
          AI LinkedIn Analyzer
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SignedOut>
            <Link href="/sign-up">
              <button className="primary">Get started</button>
            </Link>
          </SignedOut>
          <SignedIn>
            <Link href="/dashboard">
              <button className="primary">Open dashboard</button>
            </Link>
          </SignedIn>
        </div>
      </header>

      <main className="container" style={{ maxWidth: 760 }}>
        <section style={{ padding: "2.5rem 0 1rem" }}>
          <h1 style={{ fontSize: 34, lineHeight: 1.15, margin: "0 0 1rem" }}>About AI LinkedIn Analyzer</h1>
          <p style={{ fontSize: 18, color: "var(--color-text-secondary)", margin: 0 }}>
            A tool that turns your LinkedIn connections export into an interactive network map and an
            authenticity scan — to help you understand your network and spot fake or spammy
            connections. It&apos;s built privacy-first: your data is analysed entirely in your own
            browser.
          </p>
        </section>

        <section style={{ margin: "1.5rem 0" }}>
          <h2 style={{ fontSize: 22, margin: "0 0 1rem" }}>How it works</h2>
          <div style={{ display: "grid", gap: 14 }}>
            {STEPS.map((s) => (
              <div
                key={s.title}
                style={{
                  border: "0.5px solid var(--color-border-tertiary)",
                  borderRadius: "var(--border-radius-lg)",
                  padding: "1.1rem 1.25rem",
                  background: "var(--color-background-secondary)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <i className={`ti ${s.icon}`} style={{ fontSize: 20, color: "var(--color-text-info)" }} />
                  <h3 style={{ margin: 0, fontSize: 16 }}>{s.title}</h3>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-secondary)" }}>{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ margin: "2rem 0" }}>
          <h2 style={{ fontSize: 22, margin: "0 0 0.4rem" }}>Your privacy</h2>
          <p style={{ fontSize: 15, color: "var(--color-text-secondary)", margin: "0 0 1rem" }}>
            For the main use case — the network map and authenticity scan — <strong style={{ color: "var(--color-text-primary)" }}>no
            sensitive data ever touches our server.</strong> Here&apos;s why.
          </p>
          <div style={{ display: "grid", gap: 14 }}>
            {PRIVACY.map((p) => (
              <div
                key={p.title}
                style={{
                  border: "0.5px solid var(--color-border-tertiary)",
                  borderRadius: "var(--border-radius-lg)",
                  padding: "1.1rem 1.25rem",
                  background: "var(--color-background-secondary)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <i className={`ti ${p.icon}`} style={{ fontSize: 20, color: "var(--color-text-info)" }} />
                  <h3 style={{ margin: 0, fontSize: 16 }}>{p.title}</h3>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-secondary)" }}>{p.body}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: "1.25rem 0 0" }}>
            In short: your LinkedIn data is processed inside your own browser and is never uploaded or
            stored. The only thing that can ever leave your device is the optional enrichment — and
            even then it&apos;s just the profile links you chose, sent with your own key.
          </p>
        </section>

        <section style={{ margin: "1rem 0 0.5rem", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <SignedOut>
            <Link href="/sign-up">
              <button className="primary" style={{ padding: "10px 20px", fontSize: 15 }}>Get started free</button>
            </Link>
          </SignedOut>
          <SignedIn>
            <Link href="/dashboard">
              <button className="primary" style={{ padding: "10px 20px", fontSize: 15 }}>Open dashboard</button>
            </Link>
          </SignedIn>
          <a
            href="/synthetic_network_report.pdf"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 14, color: "var(--color-text-info)", textDecoration: "none" }}
          >
            <i className="ti ti-file-type-pdf" style={{ verticalAlign: -2, marginRight: 5 }} />
            View a sample report (PDF)
          </a>
        </section>
      </main>

      <footer
        style={{
          textAlign: "center",
          padding: "1.5rem",
          fontSize: 12,
          color: "var(--color-text-tertiary)",
          borderTop: "0.5px solid var(--color-border-tertiary)",
          marginTop: "2rem",
        }}
      >
        <Link href="/" style={{ color: "var(--color-text-secondary)", textDecoration: "none" }}>← Back to home</Link>
        <br />
        AI LinkedIn Analyzer · Your data never leaves your browser. · © 2026 Cyber Sense
      </footer>
    </div>
  );
}
