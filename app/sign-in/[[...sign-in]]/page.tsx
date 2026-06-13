import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: "2rem 1rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500, fontSize: 18 }}>
        <i className="ti ti-brand-linkedin" style={{ color: "var(--color-text-info)", fontSize: 24 }} />
        AI LinkedIn Analyzer
      </div>
      <SignIn signUpUrl="/sign-up" fallbackRedirectUrl="/dashboard" />
    </div>
  );
}
