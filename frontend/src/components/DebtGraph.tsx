import { useMemo } from "react";
import type { DebtEdge, Entity, NetObligation } from "../api/client";
import { COUNTRY_FLAGS, initials } from "../lib/theme";

// ──────────────────────────────────────────────
// SVG debt graph. Nodes sit on a circle; edges are
// smooth glowing curves (animated "money flow" when
// netted). Shows raw pairwise debts or the collapsed
// net obligations depending on mode.
// ──────────────────────────────────────────────

interface Props {
  entities: Entity[];
  debtEdges: DebtEdge[];
  obligations: NetObligation[];
  mode: "raw" | "netted";
}

const RAIL_COLORS: Record<string, string> = {
  local: "#34d399",
  linked: "#60a5fa",
  claim_link: "#fbbf24",
  stable_bridge: "#a78bfa",
};
const RAW_COLOR = "#5b6b82";

const GRADIENTS: [string, string][] = [
  ["#22d3ee", "#3b82f6"],
  ["#a855f7", "#6366f1"],
  ["#34d399", "#10b981"],
  ["#f59e0b", "#f97316"],
  ["#f43f5e", "#ec4899"],
  ["#8b5cf6", "#a855f7"],
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

const W = 620;
const H = 480;
const CX = W / 2;
const CY = H / 2;
const R = 168;
const NODE_R = 30;

export function DebtGraph({ entities, debtEdges, obligations, mode }: Props) {
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const n = entities.length;
    entities.forEach((e, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      map.set(e.id, { x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) });
    });
    return map;
  }, [entities]);

  const edges = mode === "raw" ? debtEdges : obligations;

  // Fan out parallel edges between the same pair.
  const edgeOffsets = useMemo(() => {
    const pairCount = new Map<string, number>();
    const offsets = new Map<string, number>();
    for (const edge of edges) {
      const key = [edge.from, edge.to].sort().join("|");
      const idx = pairCount.get(key) ?? 0;
      pairCount.set(key, idx + 1);
      offsets.set(edge.id, idx);
    }
    return offsets;
  }, [edges]);

  return (
    <div className="glass rounded-2xl p-3 relative overflow-hidden">
      {entities.length === 0 ? (
        <div className="flex items-center justify-center h-[420px] text-slate-500 text-sm">
          No entities loaded.
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none">
          <defs>
            {entities.map((e) => {
              const [a, b] = GRADIENTS[hash(e.id) % GRADIENTS.length];
              return (
                <linearGradient key={e.id} id={`node-${e.id}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={a} />
                  <stop offset="100%" stopColor={b} />
                </linearGradient>
              );
            })}
            <radialGradient id="node-sheen" cx="0.3" cy="0.25" r="0.9">
              <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
              <stop offset="45%" stopColor="rgba(255,255,255,0.05)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
            <filter id="soft-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {Object.entries(RAIL_COLORS).map(([type, color]) => (
              <marker key={type} id={`arrow-${type}`} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill={color} />
              </marker>
            ))}
            <marker id="arrow-raw" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill={RAW_COLOR} />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((edge) => {
            const a = positions.get(edge.from);
            const b = positions.get(edge.to);
            if (!a || !b) return null;

            const isNet = mode === "netted";
            const rail = (edge as NetObligation).chosenRail;
            const color = isNet ? RAIL_COLORS[rail ?? "stable_bridge"] : RAW_COLOR;

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const px = -uy;
            const py = ux;

            // Trim to node rims so arrowheads stay visible.
            const sx = a.x + ux * (NODE_R + 2);
            const sy = a.y + uy * (NODE_R + 2);
            const ex = b.x - ux * (NODE_R + 7);
            const ey = b.y - uy * (NODE_R + 7);

            const offsetIdx = edgeOffsets.get(edge.id) ?? 0;
            const bend = (isNet ? 0.16 : 0.1) * len + offsetIdx * 16;
            const cx = (sx + ex) / 2 + px * bend;
            const cy = (sy + ey) / 2 + py * bend;
            const d = `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`;

            // Quadratic midpoint for the label.
            const mx = 0.25 * sx + 0.5 * cx + 0.25 * ex;
            const my = 0.25 * sy + 0.5 * cy + 0.25 * ey;

            return (
              <g key={edge.id}>
                {/* soft under-glow */}
                <path d={d} fill="none" stroke={color} strokeWidth={isNet ? 5 : 3} opacity={isNet ? 0.16 : 0.08} filter="url(#soft-glow)" />
                {/* crisp line */}
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={isNet ? 2 : 1.1}
                  opacity={isNet ? 0.95 : 0.4}
                  markerEnd={`url(#${isNet ? `arrow-${rail ?? "stable_bridge"}` : "arrow-raw"})`}
                  className={isNet ? "edge-flow" : undefined}
                />
                {isNet && (
                  <g>
                    <rect x={mx - 22} y={my - 10} width={44} height={18} rx={9} fill="rgba(7,11,20,0.96)" stroke={color} strokeOpacity="0.35" />
                    <text x={mx} y={my + 3} textAnchor="middle" fontSize="10" fontWeight="600" fill={color} fontFamily="JetBrains Mono, monospace">
                      ${(edge as NetObligation).amountUsd.toFixed(0)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {entities.map((e) => {
            const pos = positions.get(e.id)!;
            const hasAccount = e.linkedRailAliases.length > 0;
            const [ga, gb] = GRADIENTS[hash(e.id) % GRADIENTS.length];
            return (
              <g key={e.id}>
                {/* ambient halo */}
                <circle cx={pos.x} cy={pos.y} r={NODE_R + 10} fill={ga} opacity="0.12" filter="url(#soft-glow)" />
                {!hasAccount && (
                  <circle cx={pos.x} cy={pos.y} r={NODE_R + 5} fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="3 4" opacity="0.7" />
                )}
                <circle cx={pos.x} cy={pos.y} r={NODE_R} fill={`url(#node-${e.id})`} />
                <circle cx={pos.x} cy={pos.y} r={NODE_R} fill="url(#node-sheen)" />
                <circle cx={pos.x} cy={pos.y} r={NODE_R} fill="none" stroke={gb} strokeOpacity="0.5" strokeWidth="1" />
                <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="13" fontWeight="700" fill="#ffffff">
                  {initials(e.name)}
                </text>
                <text x={pos.x} y={pos.y + NODE_R + 16} textAnchor="middle" fontSize="11" fontWeight="600" fill="#cbd5e1">
                  {e.name.trim().split(" ")[0]}
                </text>
                <text x={pos.x} y={pos.y + NODE_R + 29} textAnchor="middle" fontSize="10" fill="#64748b">
                  {COUNTRY_FLAGS[e.country]} {e.country}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {mode === "netted" && obligations.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
          Run netting to collapse the graph.
        </div>
      )}
    </div>
  );
}
