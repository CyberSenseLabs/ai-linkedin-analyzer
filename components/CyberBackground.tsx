// Subtle cybersecurity-themed backdrop for the landing page: a faint hex grid,
// a network constellation (nodes + links, echoing the product), and a couple of
// barely-there lock/shield glyphs. Deliberately low-contrast so it never
// competes with foreground content. Purely decorative — aria-hidden, no pointer
// events, sits behind everything.
//
// Animation is CSS-only (opacity / r / transform / stroke-dashoffset, all GPU- or
// compositor-friendly) and is fully disabled under prefers-reduced-motion.

// Constellation graph data: links [x1, y1, x2, y2], then nodes [x, y, r].
const LINKS: [number, number, number, number][] = [
  [120, 160, 260, 240],
  [260, 240, 180, 380],
  [260, 240, 420, 180],
  [180, 380, 320, 470],
  [1280, 180, 1160, 300],
  [1160, 300, 1300, 420],
  [1160, 300, 1040, 200],
  [1300, 420, 1220, 560],
  [200, 720, 360, 660],
  [360, 660, 300, 800],
  [1120, 700, 1240, 760],
];

const NODES: [number, number, number][] = [
  [120, 160, 3], [260, 240, 5], [180, 380, 4], [420, 180, 3], [320, 470, 4],
  [1280, 180, 4], [1160, 300, 5], [1300, 420, 4], [1040, 200, 3], [1220, 560, 4],
  [200, 720, 4], [360, 660, 5], [300, 800, 3], [1120, 700, 4], [1240, 760, 3],
];

const CSS = `
@keyframes cb-twinkle {
  0%, 100% { opacity: 0.35; }
  50%      { opacity: 1; }
}
@keyframes cb-pulse {
  0%   { opacity: 0.2; }
  50%  { opacity: 0.85; }
  100% { opacity: 0.2; }
}
@keyframes cb-flow {
  to { stroke-dashoffset: -220; }
}
@keyframes cb-drift {
  0%   { transform: translate(0px, 0px); }
  50%  { transform: translate(14px, -10px); }
  100% { transform: translate(0px, 0px); }
}
@keyframes cb-drift2 {
  0%   { transform: translate(0px, 0px); }
  50%  { transform: translate(-12px, 8px); }
  100% { transform: translate(0px, 0px); }
}
@keyframes cb-breathe {
  0%, 100% { opacity: 0.04; }
  50%      { opacity: 0.09; }
}
@keyframes cb-flicker {
  0%, 100%   { opacity: 0.02; }
  45%        { opacity: 0.06; }
  55%        { opacity: 0.03; }
  70%        { opacity: 0.07; }
}

.cb-cluster-a { animation: cb-drift 26s ease-in-out infinite; }
.cb-cluster-b { animation: cb-drift2 32s ease-in-out infinite; }
.cb-node { animation: cb-twinkle 4s ease-in-out infinite; }
.cb-link-static { opacity: 0.5; }
.cb-link-flow {
  stroke-dasharray: 5 215;
  animation: cb-flow 3.2s linear infinite, cb-pulse 3.2s ease-in-out infinite;
}
.cb-glyph { animation: cb-breathe 7s ease-in-out infinite; }
.cb-bits { animation: cb-flicker 6s steps(1, end) infinite; }

@media (prefers-reduced-motion: reduce) {
  .cb-cluster-a, .cb-cluster-b, .cb-node, .cb-link-flow, .cb-glyph, .cb-bits {
    animation: none;
  }
  .cb-link-flow { stroke-dasharray: none; opacity: 0.6; }
  .cb-glyph { opacity: 0.05; }
  .cb-bits { opacity: 0.045; }
}
`;

export default function CyberBackground() {
  // Split the constellation into two clusters so each can drift independently
  // for a subtle parallax feel.
  const leftLinks = LINKS.filter(([x1]) => x1 < 720);
  const rightLinks = LINKS.filter(([x1]) => x1 >= 720);
  const leftNodes = NODES.filter(([x]) => x < 720);
  const rightNodes = NODES.filter(([x]) => x >= 720);

  const renderCluster = (
    links: typeof LINKS,
    nodes: typeof NODES,
    className: string,
    seed: number,
  ) => (
    <g className={className}>
      <g strokeWidth="0.8" fill="none">
        {links.map(([x1, y1, x2, y2], i) => (
          <g key={i}>
            {/* faint always-on wire */}
            <line className="cb-link-static" x1={x1} y1={y1} x2={x2} y2={y2} />
            {/* travelling data pulse along the same wire */}
            <line
              className="cb-link-flow"
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              style={{ animationDelay: `${((i + seed) % 6) * 0.5}s` }}
            />
          </g>
        ))}
      </g>
      {nodes.map(([cx, cy, r], i) => (
        <circle
          key={i}
          className="cb-node"
          cx={cx}
          cy={cy}
          r={r}
          stroke="none"
          style={{
            animationDelay: `${((i * 7 + seed) % 40) / 10}s`,
            animationDuration: `${3.5 + (i % 5) * 0.6}s`,
          }}
        />
      ))}
    </g>
  );

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
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
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

        {/* Network constellation — two drifting clusters of nodes + links */}
        <g opacity="0.10" stroke="currentColor" fill="currentColor">
          {renderCluster(leftLinks, leftNodes, "cb-cluster-a", 0)}
          {renderCluster(rightLinks, rightNodes, "cb-cluster-b", 3)}
        </g>

        {/* Faint shield + padlock glyphs, gently breathing */}
        <g className="cb-glyph" stroke="currentColor" fill="none" strokeWidth="2">
          {/* shield */}
          <path d="M620 760 L620 700 Q660 684 700 700 L700 760 Q700 812 660 832 Q620 812 620 760 Z" />
          <path d="M644 752 L656 766 L682 728" strokeWidth="2.5" />
          {/* padlock */}
          <rect x="1000" y="120" width="64" height="48" rx="6" />
          <path d="M1012 120 L1012 104 Q1012 80 1032 80 Q1052 80 1052 104 L1052 120" />
          <circle cx="1032" cy="142" r="5" fill="currentColor" stroke="none" />
        </g>

        {/* A couple of binary streams for texture, faintly flickering */}
        <g className="cb-bits" fill="currentColor" fontFamily="monospace" fontSize="13" letterSpacing="3">
          <text x="60" y="540">01001100 01001001</text>
          <text x="1140" y="500">10110010 01000101</text>
          <text x="500" y="120">0100 1110</text>
        </g>
      </svg>
    </div>
  );
}
