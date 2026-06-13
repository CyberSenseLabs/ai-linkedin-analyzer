"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { COMPANY_SECTOR, SECTORS } from "@/lib/constants";
import type { PeopleByCompany } from "@/lib/types";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  me?: boolean;
  count?: number;
  sector?: string;
  color?: string;
  r: number;
}
interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  w: number;
}

const W = 680;
const H = 470;

export default function NetworkGraph({
  people,
  activeSectors,
  onSelectCompany,
}: {
  people: PeopleByCompany;
  activeSectors: Set<string>;
  onSelectCompany: (company: string, sector: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const nodeSelRef = useRef<d3.Selection<SVGGElement, GraphNode, SVGGElement, unknown> | null>(null);
  const linkSelRef = useRef<d3.Selection<SVGLineElement, GraphLink, SVGGElement, unknown> | null>(null);
  // Keep the latest activeSectors readable inside d3 callbacks without rebuilding.
  const activeRef = useRef(activeSectors);
  activeRef.current = activeSectors;

  // Build / rebuild the graph whenever the dataset changes.
  useEffect(() => {
    const svgEl = svgRef.current;
    const tip = tipRef.current;
    if (!svgEl || !tip) return;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    const companies = Object.keys(people)
      .map((name) => [name, people[name].length, COMPANY_SECTOR[name] || "Other"] as [string, number, string])
      .sort((a, b) => b[1] - a[1]);

    const nodes: GraphNode[] = [{ id: "__me", label: "You", me: true, r: 26 }];
    const links: GraphLink[] = [];
    companies.forEach(([name, n, sec]) => {
      nodes.push({ id: name, label: name, count: n, sector: sec, color: SECTORS[sec], r: 6 + Math.sqrt(n) * 2.4 });
      links.push({ source: "__me", target: name, w: n });
    });

    const g = svg.append("g");
    const link = g
      .append("g")
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(links)
      .join("line")
      .attr("stroke-opacity", 0.5)
      .attr("stroke", "var(--color-border-secondary)")
      .attr("stroke-width", (d) => 0.5 + Math.sqrt(d.w) / 3);

    const node = g
      .append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .style("cursor", "pointer");

    node
      .append("circle")
      .attr("r", (d) => d.r)
      .attr("fill", (d) => (d.me ? "var(--color-text-primary)" : d.color!))
      .attr("stroke", (d) => (d.me ? "var(--color-text-primary)" : "#fff"))
      .attr("stroke-width", (d) => (d.me ? 0 : 1.2));

    node
      .append("text")
      .text((d) => (d.me ? "YOU" : (d.count || 0) >= 12 ? d.label : ""))
      .attr("text-anchor", "middle")
      .attr("dy", (d) => (d.me ? 4 : -d.r - 4))
      .attr("font-size", (d) => (d.me ? 11 : 10))
      .attr("font-weight", 500)
      .attr("font-family", "Arial, Helvetica, sans-serif")
      .attr("fill", (d) => (d.me ? "var(--color-background-primary)" : "var(--color-text-primary)"))
      .style("pointer-events", "none");

    node
      .on("mousemove", function (e: MouseEvent, d: GraphNode) {
        if (d.me) return;
        const r = svgEl.getBoundingClientRect();
        tip.style.opacity = "1";
        tip.style.left = e.clientX - r.left + 12 + "px";
        tip.style.top = e.clientY - r.top + 12 + "px";
        // textContent assignments below avoid any HTML injection from names.
        const strong = document.createElement("strong");
        strong.textContent = d.label;
        const meta = document.createElement("div");
        meta.style.color = "var(--color-text-secondary)";
        meta.textContent = `${d.count} connections · ${d.sector}`;
        const hint = document.createElement("div");
        hint.style.color = "var(--color-text-tertiary)";
        hint.textContent = "click to drill in";
        tip.replaceChildren(strong, meta, hint);
      })
      .on("mouseleave", () => {
        tip.style.opacity = "0";
      })
      .on("click", (_e: MouseEvent, d: GraphNode) => {
        if (!d.me) onSelectCompany(d.label, d.sector!);
      });

    const sim = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance((d) => 70 + (d.target as GraphNode).r),
      )
      .force("charge", d3.forceManyBody().strength(-160))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collide", d3.forceCollide<GraphNode>().radius((d) => d.r + 6))
      .on("tick", () => {
        nodes[0].fx = W / 2;
        nodes[0].fy = H / 2;
        link
          .attr("x1", (d) => (d.source as GraphNode).x!)
          .attr("y1", (d) => (d.source as GraphNode).y!)
          .attr("x2", (d) => (d.target as GraphNode).x!)
          .attr("y2", (d) => (d.target as GraphNode).y!);
        node.attr("transform", (d) => `translate(${d.x},${d.y})`);
      });

    node.call(
      d3
        .drag<SVGGElement, GraphNode>()
        .on("start", (e, d) => {
          if (!e.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (e, d) => {
          d.fx = e.x;
          d.fy = e.y;
        })
        .on("end", (e, d) => {
          if (!e.active) sim.alphaTarget(0);
          if (!d.me) {
            d.fx = null;
            d.fy = null;
          }
        }),
    );

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 4])
      .on("zoom", (e) => g.attr("transform", e.transform));
    svg.call(zoom);

    // Wire zoom buttons (rendered as siblings, looked up by id).
    const zin = document.getElementById("zin");
    const zout = document.getElementById("zout");
    const zreset = document.getElementById("zreset");
    if (zin) zin.onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 1.4);
    if (zout) zout.onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 0.7);
    if (zreset) zreset.onclick = () => svg.transition().duration(350).call(zoom.transform, d3.zoomIdentity);

    nodeSelRef.current = node;
    linkSelRef.current = link;

    // Apply initial filter styling.
    const active = activeRef.current;
    node.style("opacity", (d) => (d.me ? 1 : active.has(d.sector!) ? 1 : 0.08));
    link.style("opacity", (d) => (active.has((d.target as GraphNode).sector!) ? 0.5 : 0.04));

    return () => {
      sim.stop();
    };
  }, [people, onSelectCompany]);

  // Update opacity when sector filters change (no rebuild).
  useEffect(() => {
    const node = nodeSelRef.current;
    const link = linkSelRef.current;
    if (!node || !link) return;
    node.style("opacity", (d) => (d.me ? 1 : activeSectors.has(d.sector!) ? 1 : 0.08));
    link.style("opacity", (d) => (activeSectors.has((d.target as GraphNode).sector!) ? 0.5 : 0.04));
  }, [activeSectors]);

  return (
    <div
      style={{
        position: "relative",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-lg)",
        overflow: "hidden",
        background: "var(--color-background-primary)",
      }}
    >
      <div style={{ position: "absolute", top: 10, right: 10, zIndex: 5, display: "flex", flexDirection: "column", gap: 6 }}>
        <button id="zin" aria-label="Zoom in" style={iconBtn}>
          <i className="ti ti-plus" />
        </button>
        <button id="zout" aria-label="Zoom out" style={iconBtn}>
          <i className="ti ti-minus" />
        </button>
        <button id="zreset" aria-label="Reset view" style={iconBtn}>
          <i className="ti ti-focus-centered" />
        </button>
      </div>
      <div
        ref={tipRef}
        style={{
          position: "absolute",
          pointerEvents: "none",
          opacity: 0,
          background: "var(--color-background-primary)",
          border: "0.5px solid var(--color-border-secondary)",
          borderRadius: "var(--border-radius-md)",
          padding: "6px 10px",
          fontSize: 12,
          zIndex: 6,
          transition: "opacity .1s",
          maxWidth: 210,
        }}
      />
      <svg id="netGraph" ref={svgRef} viewBox="0 0 680 470" width="100%" style={{ display: "block", cursor: "grab" }} />
      <div style={{ position: "absolute", left: 10, bottom: 8, fontSize: 11, color: "var(--color-text-tertiary)" }}>
        Click a company to drill into people · drag to rearrange
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--color-background-primary)",
};
