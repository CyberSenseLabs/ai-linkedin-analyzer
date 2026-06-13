// Subtle cybersecurity-themed backdrop for the landing page: a faint hex grid,
// a network constellation (nodes + links, echoing the product), and a couple of
// barely-there lock/shield glyphs. Deliberately low-contrast so it never
// competes with foreground content. Purely decorative — aria-hidden, no pointer
// events, sits behind everything.
export default function CyberBackground() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
        color: "var(--color-text-info)",
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        style={{ display: "block" }}
      >
        <defs>
          {/* Hex grid tile */}
          <pattern id="hex" width="56" height="48" patternUnits="userSpaceOnUse" patternTransform="scale(1.4)">
            <path
              d="M14 0 L42 0 L56 24 L42 48 L14 48 L0 24 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
            />
          </pattern>
          {/* Vignette so the pattern fades toward the centre where text sits */}
          <radialGradient id="fade" cx="50%" cy="38%" r="75%">
            <stop offset="0%" stopColor="#000" stopOpacity="0" />
            <stop offset="55%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="1" />
          </radialGradient>
          <mask id="fadeMask">
            <rect width="1440" height="900" fill="url(#fade)" />
          </mask>
        </defs>

        {/* Hex grid, faded toward the edges */}
        <g opacity="0.05" mask="url(#fadeMask)">
          <rect width="1440" height="900" fill="url(#hex)" />
        </g>

        {/* Network constellation — nodes + links */}
        <g opacity="0.10" stroke="currentColor" fill="currentColor">
          <g strokeWidth="0.8">
            <line x1="120" y1="160" x2="260" y2="240" />
            <line x1="260" y1="240" x2="180" y2="380" />
            <line x1="260" y1="240" x2="420" y2="180" />
            <line x1="180" y1="380" x2="320" y2="470" />
            <line x1="1280" y1="180" x2="1160" y2="300" />
            <line x1="1160" y1="300" x2="1300" y2="420" />
            <line x1="1160" y1="300" x2="1040" y2="200" />
            <line x1="1300" y1="420" x2="1220" y2="560" />
            <line x1="200" y1="720" x2="360" y2="660" />
            <line x1="360" y1="660" x2="300" y2="800" />
            <line x1="1120" y1="700" x2="1240" y2="760" />
          </g>
          {[
            [120, 160, 3], [260, 240, 5], [180, 380, 4], [420, 180, 3], [320, 470, 4],
            [1280, 180, 4], [1160, 300, 5], [1300, 420, 4], [1040, 200, 3], [1220, 560, 4],
            [200, 720, 4], [360, 660, 5], [300, 800, 3], [1120, 700, 4], [1240, 760, 3],
          ].map(([cx, cy, r], i) => (
            <circle key={i} cx={cx} cy={cy} r={r} />
          ))}
        </g>

        {/* Faint shield + padlock glyphs */}
        <g opacity="0.05" stroke="currentColor" fill="none" strokeWidth="2">
          {/* shield */}
          <path d="M620 760 L620 700 Q660 684 700 700 L700 760 Q700 812 660 832 Q620 812 620 760 Z" />
          <path d="M644 752 L656 766 L682 728" strokeWidth="2.5" />
          {/* padlock */}
          <rect x="1000" y="120" width="64" height="48" rx="6" />
          <path d="M1012 120 L1012 104 Q1012 80 1032 80 Q1052 80 1052 104 L1052 120" />
          <circle cx="1032" cy="142" r="5" fill="currentColor" stroke="none" />
        </g>

        {/* A couple of binary streams for texture */}
        <g opacity="0.045" fill="currentColor" fontFamily="monospace" fontSize="13" letterSpacing="3">
          <text x="60" y="540">01001100 01001001</text>
          <text x="1140" y="500">10110010 01000101</text>
          <text x="500" y="120">0100 1110</text>
        </g>
      </svg>
    </div>
  );
}
