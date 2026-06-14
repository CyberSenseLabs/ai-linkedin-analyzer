"use client";

// Live network-simulation backdrop for the landing page. A force-directed-ish
// constellation that drifts with gentle physics: nodes float, links form between
// nearby nodes and flex as they move, data packets travel along the links, nodes
// occasionally re-seed with a pulse ring, and the whole field reacts subtly to
// the cursor. Rendered on a <canvas> behind everything, low-contrast, with a
// centre fade so it never competes with foreground text.
//
// Purely decorative (aria-hidden, no pointer events). Fully static under
// prefers-reduced-motion. Pauses when the tab is hidden.

import { useEffect, useRef } from "react";

// Brand-ish node palette (sector colours from the product), used at low alpha.
const PALETTE = ["#378ADD", "#1D9E75", "#7F77DD", "#D85A30", "#BA7517", "#D4537E"];

const LINK_DIST = 168; // px: nodes closer than this draw a link
const FOCAL = { x: 0.5, y: 0.34 }; // where the headline sits — fade the field here

type Node = {
  x: number; y: number; vx: number; vy: number;
  r: number; color: string;
  alpha: number; target: number; // fade-in / fade-out
  pulse: number; // 0..1 expanding ring after a re-seed
};

type Packet = { a: number; b: number; t: number; speed: number };

export default function CyberBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let nodes: Node[] = [];
    let packets: Packet[] = [];
    const mouse = { x: -9999, y: -9999, active: false };
    let raf = 0;
    let lastReseed = 0;
    let lastPacket = 0;

    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    function nodeCount() {
      return Math.max(24, Math.min(64, Math.round((W * H) / 26000)));
    }

    function makeNode(fadeIn = false): Node {
      return {
        x: rand(0, W), y: rand(0, H),
        vx: rand(-0.18, 0.18), vy: rand(-0.18, 0.18),
        r: rand(1.6, 4.2),
        color: PALETTE[(Math.random() * PALETTE.length) | 0],
        alpha: fadeIn ? 0 : 1,
        target: 1,
        pulse: fadeIn ? 1 : 0,
      };
    }

    // Soft fade near the focal point so text stays readable.
    function focalFade(x: number, y: number) {
      const fx = FOCAL.x * W, fy = FOCAL.y * H;
      const d = Math.hypot(x - fx, y - fy);
      const inner = Math.min(W, H) * 0.18;
      const outer = Math.min(W, H) * 0.55;
      if (d <= inner) return 0.08;
      if (d >= outer) return 1;
      return 0.08 + 0.92 * ((d - inner) / (outer - inner));
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      W = rect.width; H = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.floor(W * dpr);
      canvas!.height = Math.floor(H * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const want = nodeCount();
      if (!nodes.length) {
        nodes = Array.from({ length: want }, () => makeNode(false));
      } else {
        while (nodes.length < want) nodes.push(makeNode(true));
        while (nodes.length > want) nodes.pop();
      }
    }

    function step(now: number) {
      ctx!.clearRect(0, 0, W, H);

      // --- update physics ---
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        // gentle wandering
        n.vx += rand(-0.012, 0.012);
        n.vy += rand(-0.012, 0.012);
        // speed cap + damping
        const sp = Math.hypot(n.vx, n.vy);
        const max = 0.4;
        if (sp > max) { n.vx = (n.vx / sp) * max; n.vy = (n.vy / sp) * max; }
        n.vx *= 0.995; n.vy *= 0.995;
        // wrap around edges
        if (n.x < -20) n.x = W + 20; else if (n.x > W + 20) n.x = -20;
        if (n.y < -20) n.y = H + 20; else if (n.y > H + 20) n.y = -20;
        // cursor attraction
        if (mouse.active) {
          const dx = mouse.x - n.x, dy = mouse.y - n.y;
          const d = Math.hypot(dx, dy);
          if (d < 220 && d > 1) {
            const f = (1 - d / 220) * 0.06;
            n.vx += (dx / d) * f; n.vy += (dy / d) * f;
          }
        }
        // fades + pulse decay
        n.alpha += (n.target - n.alpha) * 0.04;
        if (n.pulse > 0) n.pulse = Math.max(0, n.pulse - 0.012);
      }

      // --- re-seed a node every ~2.6s (fade old out, birth a new one) ---
      if (now - lastReseed > 2600 && nodes.length) {
        lastReseed = now;
        const idx = (Math.random() * nodes.length) | 0;
        nodes[idx] = makeNode(true);
      }

      // --- links (proximity) ---
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < LINK_DIST) {
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            const fade = focalFade(mx, my);
            const closeness = 1 - d / LINK_DIST;
            const alpha = 0.16 * closeness * fade * Math.min(a.alpha, b.alpha);
            if (alpha > 0.004) {
              ctx!.strokeStyle = `rgba(120,170,235,${alpha})`;
              ctx!.lineWidth = 0.7;
              ctx!.beginPath();
              ctx!.moveTo(a.x, a.y); ctx!.lineTo(b.x, b.y);
              ctx!.stroke();
            }
          }
        }
      }

      // --- spawn a data packet on a live edge every ~520ms ---
      const maxPackets = Math.max(4, (nodes.length / 6) | 0);
      if (now - lastPacket > 520 && packets.length < maxPackets) {
        lastPacket = now;
        // find a random pair currently linked
        for (let tries = 0; tries < 12; tries++) {
          const i = (Math.random() * nodes.length) | 0;
          const j = (Math.random() * nodes.length) | 0;
          if (i === j) continue;
          const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
          if (d < LINK_DIST) { packets.push({ a: i, b: j, t: 0, speed: rand(0.006, 0.013) }); break; }
        }
      }

      // --- draw + advance packets ---
      packets = packets.filter((p) => {
        const a = nodes[p.a], b = nodes[p.b];
        if (!a || !b) return false;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > LINK_DIST * 1.35) return false; // endpoints drifted apart
        p.t += p.speed;
        if (p.t >= 1) return false;
        const x = a.x + (b.x - a.x) * p.t;
        const y = a.y + (b.y - a.y) * p.t;
        const fade = focalFade(x, y);
        const fl = Math.sin(p.t * Math.PI); // fade in/out along the wire
        ctx!.fillStyle = `rgba(150,200,255,${0.5 * fl * fade})`;
        ctx!.beginPath();
        ctx!.arc(x, y, 1.7, 0, Math.PI * 2);
        ctx!.fill();
        return true;
      });

      // --- draw nodes (+ pulse rings) ---
      for (const n of nodes) {
        const fade = focalFade(n.x, n.y);
        const a = n.alpha * fade;
        if (n.pulse > 0) {
          const pr = n.r + (1 - n.pulse) * 26;
          ctx!.strokeStyle = hexA(n.color, 0.45 * n.pulse * fade);
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.arc(n.x, n.y, pr, 0, Math.PI * 2);
          ctx!.stroke();
        }
        ctx!.fillStyle = hexA(n.color, 0.55 * a);
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      // --- cursor: link nearby nodes to the pointer ---
      if (mouse.active) {
        for (const n of nodes) {
          const dx = mouse.x - n.x, dy = mouse.y - n.y;
          const d = Math.hypot(dx, dy);
          if (d < 200) {
            const alpha = 0.22 * (1 - d / 200) * focalFade(n.x, n.y);
            ctx!.strokeStyle = `rgba(150,200,255,${alpha})`;
            ctx!.lineWidth = 0.7;
            ctx!.beginPath();
            ctx!.moveTo(mouse.x, mouse.y); ctx!.lineTo(n.x, n.y);
            ctx!.stroke();
          }
        }
      }

      raf = requestAnimationFrame(step);
    }

    function hexA(hex: string, a: number) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${a})`;
    }

    function onMove(e: MouseEvent) { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; }
    function onLeave() { mouse.active = false; mouse.x = -9999; mouse.y = -9999; }
    function onVisibility() {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
      else if (!reduce && !raf) { raf = requestAnimationFrame(step); }
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseout", onLeave, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    if (reduce) {
      // one static frame, no loop
      step(0);
      cancelAnimationFrame(raf); raf = 0;
    } else {
      raf = requestAnimationFrame(step);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        display: "block",
      }}
    />
  );
}
