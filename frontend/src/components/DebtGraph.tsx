import { useMemo } from "react";
import type { DebtEdge, Entity, NetObligation } from "../api/client";

// ──────────────────────────────────────────────
// Simple SVG-based debt graph.
// Nodes are positioned in a circle; edges are drawn
// as lines with arrowheads.  Shows either raw debt
// edges or net obligations depending on mode.
// ──────────────────────────────────────────────

interface Props {
  entities: Entity[];
  debtEdges: DebtEdge[];
  obligations: NetObligation[];
  mode: "raw" | "netted";
}

const RAIL_COLORS: Record<string, string> = {
  local: "#10b981",
  linked: "#3b82f6",
  claim_link: "#f59e0b",
  stable_bridge: "#a855f7",
};

export function DebtGraph({ entities, debtEdges, obligations, mode }: Props) {
  const W = 640;
  const H = 460;
  const cx = W / 2;
  const cy = H / 2;
  const r = 150;

  // Position nodes in a circle
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const n = entities.length;
    entities.forEach((e, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      map.set(e.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    });
    return map;
  }, [entities]);

  const edges = mode === "raw" ? debtEdges : obligations;
  const hasEdges = edges.length > 0;

  // Build a lookup for entity by id
  const entityMap = useMemo(() => {
    const m = new Map(entities.map((e) => [e.id, e]));
    return m;
  }, [entities]);

  // Group parallel edges for slight offset
  const edgeOffsets = useMemo(() => {
    const pairCount = new Map<string, number>();
    const offsets = new Map<string, number>();
    for (const edge of edges) {
      const key = [edge.from, edge.to].sort().join("-");
      const idx = pairCount.get(key) ?? 0;
      pairCount.set(key, idx + 1);
      offsets.set(edge.id, idx);
    }
    return offsets;
  }, [edges]);

  return (
    <div className="flex items-center justify-center rounded-xl bg-slate-900 border border-slate-800 p-2">
      {entities.length === 0 ? (
        <p className="text-slate-500 py-20">No entities loaded.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[640px]">
          <defs>
            <marker
              id="arrow-raw"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
            </marker>
            <marker
              id="arrow-net"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#38bdf8" />
            </marker>
            {Object.entries(RAIL_COLORS).map(([type, color]) => (
              <marker
                key={type}
                id={`arrow-${type}`}
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill={color} />
              </marker>
            ))}
          </defs>

          {/* Draw edges */}
          {edges.map((edge) => {
            const fromPos = positions.get(edge.from);
            const toPos = positions.get(edge.to);
            if (!fromPos || !toPos) return null;

            const offset = (edgeOffsets.get(edge.id) ?? 0) * 8;
            const dx = toPos.x - fromPos.x;
            const dy = toPos.y - fromPos.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = (dx / len) * 28; // node radius
            const ny = (dy / len) * 28;
            const px = -ny / len;
            const py = nx / len;

            const x1 = fromPos.x + nx + px * offset;
            const y1 = fromPos.y + ny + py * offset;
            const x2 = toPos.x - nx + px * offset;
            const y2 = toPos.y - ny + py * offset;

            const isNet = mode === "netted";
            const color = isNet
              ? RAIL_COLORS[(edge as NetObligation).chosenRail ?? "stable_bridge"]
              : "#64748b";
            const markerId = isNet
              ? `arrow-${(edge as NetObligation).chosenRail ?? "stable_bridge"}`
              : "arrow-raw";
            const strokeWidth = isNet ? 2.5 : 1.2;
            const opacity = isNet ? 0.85 : 0.4;

            const label =
              mode === "raw"
                ? `${(edge as DebtEdge).amount} ${(edge as DebtEdge).currency}`
                : `${(edge as NetObligation).amountUsd.toFixed(2)} USD`;

            return (
              <g key={edge.id}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={color}
                  strokeWidth={strokeWidth}
                  opacity={opacity}
                  markerEnd={`url(#${markerId})`}
                />
                {isNet && (
                  <text
                    x={(x1 + x2) / 2 + px * 10}
                    y={(y1 + y2) / 2 + py * 10}
                    fill={color}
                    fontSize="11"
                    textAnchor="middle"
                    className="font-mono"
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Draw nodes */}
          {entities.map((e) => {
            const pos = positions.get(e.id)!;
            const hasAccount = e.linkedRailAliases.length > 0;
            return (
              <g key={e.id}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={28}
                  fill={hasAccount ? "#1e293b" : "#422006"}
                  stroke={hasAccount ? "#38bdf8" : "#f59e0b"}
                  strokeWidth={2}
                />
                <text
                  x={pos.x}
                  y={pos.y - 2}
                  textAnchor="middle"
                  fontSize="12"
                  fill="#e2e8f0"
                  className="font-semibold"
                >
                  {e.name.trim().split(" ")[0]}
                </text>
                <text
                  x={pos.x}
                  y={pos.y + 12}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#94a3b8"
                >
                  {e.country}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {!hasEdges && mode === "netted" && (
        <p className="text-slate-500 text-sm absolute">Run netting to see collapsed graph</p>
      )}
    </div>
  );
}
