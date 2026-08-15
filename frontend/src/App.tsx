import { useCallback, useEffect, useState } from "react";
import { client } from "./api/client";
import type {
  ComplianceFlag,
  NetObligation,
  RailType,
  ReconciliationResult,
  ScenarioResponse,
} from "./api/client";
import { DebtGraph } from "./components/DebtGraph";
import { ObligationCard } from "./components/ObligationCard";
import { ClaimLinkModal } from "./components/ClaimLinkModal";
import { ScenarioOverview } from "./components/ScenarioOverview";
import { ReconciliationView } from "./components/ReconciliationView";

const RAIL_LABELS: Record<RailType, { label: string; color: string }> = {
  local: { label: "Local", color: "text-emerald-400" },
  linked: { label: "Linked", color: "text-blue-400" },
  claim_link: { label: "Claim Link", color: "text-amber-400" },
  stable_bridge: { label: "Stable Bridge", color: "text-purple-400" },
};

export default function App() {
  const [scenario, setScenario] = useState<ScenarioResponse | null>(null);
  const [nettingResult, setNettingResult] = useState<{
    rawEdgeCount: number;
    netEdgeCount: number;
    reductionRatio: number;
    balances: { entityId: string; entityName: string; netUsd: number }[];
  } | null>(null);
  const [railTypes, setRailTypes] = useState<RailType[]>([]);
  const [complianceFlags, setComplianceFlags] = useState<ComplianceFlag[]>([]);
  const [reconData, setReconData] = useState<{
    results: ReconciliationResult[];
    vendorSummary: any[];
  } | null>(null);
  const [claimModalToken, setClaimModalToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial scenario
  const fetchScenario = useCallback(async () => {
    setLoading("scenario");
    try {
      const s = await client.getScenario();
      setScenario(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }, []);

  useEffect(() => {
    fetchScenario();
  }, [fetchScenario]);

  // Actions
  const handleNetting = async () => {
    setLoading("netting");
    try {
      const r = await client.runNetting();
      setNettingResult({
        rawEdgeCount: r.rawEdgeCount,
        netEdgeCount: r.netEdgeCount,
        reductionRatio: r.reductionRatio,
        balances: r.balances,
      });
      // Refresh scenario to get updated obligations
      const s = await client.getScenario();
      setScenario(s);
      setRailTypes([]);
      setComplianceFlags([]);
      setReconData(null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const handleRouting = async () => {
    setLoading("routing");
    try {
      const r = await client.runRouting();
      setRailTypes(r.railTypesExercised);
      const s = await client.getScenario();
      setScenario(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const handleCompliance = async () => {
    setLoading("compliance");
    try {
      const r = await client.runCompliance();
      setComplianceFlags(r.flags);
      const s = await client.getScenario();
      setScenario(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const handleReconciliation = async () => {
    setLoading("reconciliation");
    try {
      const r = await client.runReconciliation();
      setReconData({ results: r.results, vendorSummary: r.vendorSummary });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const handleSettle = async (id: string) => {
    setLoading(`settle-${id}`);
    try {
      await client.settle(id);
      const s = await client.getScenario();
      setScenario(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const handleSettleAll = async () => {
    if (!scenario) return;
    const routed = scenario.netObligations.filter((o) => o.status === "routed");
    setLoading("settle-all");
    try {
      for (const ob of routed) {
        await client.settle(ob.id);
      }
      const s = await client.getScenario();
      setScenario(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const handleReset = async () => {
    setLoading("reset");
    try {
      await client.reset();
      setNettingResult(null);
      setRailTypes([]);
      setComplianceFlags([]);
      setReconData(null);
      await fetchScenario();
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const entityMap = scenario?.entities
    ? new Map(scenario.entities.map((e) => [e.id, e]))
    : new Map();

  const obligations = scenario?.netObligations ?? [];
  const hasNetted = obligations.length > 0;

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 px-4 py-4 sticky top-0 z-40">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-xl font-bold text-slate-100">
            Agentic Trip Wallet
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cross-border netting & settlement engine — multi-agent system that
            pools travel debts, minimizes cross-border transfers, and routes
            each through the cheapest rail.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-950 border border-red-700 p-3">
            <p className="text-sm text-red-400">Error: {error}</p>
          </div>
        )}

        {/* Action bar */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleNetting}
            disabled={loading !== null}
            className="rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 px-4 py-2 text-sm font-semibold text-white transition-colors"
          >
            {loading === "netting" ? "Netting…" : "1. Run Netting"}
          </button>
          <button
            onClick={handleRouting}
            disabled={loading !== null || !hasNetted}
            className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-2 text-sm font-semibold text-white transition-colors"
          >
            {loading === "routing" ? "Routing…" : "2. Route All"}
          </button>
          <button
            onClick={handleSettleAll}
            disabled={loading !== null || railTypes.length === 0}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 px-4 py-2 text-sm font-semibold text-white transition-colors"
          >
            {loading === "settle-all" ? "Settling…" : "3. Settle All"}
          </button>
          <button
            onClick={handleCompliance}
            disabled={loading !== null || !hasNetted}
            className="rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-40 px-4 py-2 text-sm font-semibold text-white transition-colors"
          >
            {loading === "compliance" ? "Checking…" : "4. Compliance"}
          </button>
          <button
            onClick={handleReconciliation}
            disabled={loading !== null || !hasNetted}
            className="rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 px-4 py-2 text-sm font-semibold text-white transition-colors"
          >
            {loading === "reconciliation" ? "Reconciling…" : "5. Reconciliation"}
          </button>
          <button
            onClick={handleReset}
            disabled={loading !== null}
            className="ml-auto rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 px-4 py-2 text-sm font-medium text-slate-300 transition-colors"
          >
            Reset
          </button>
        </div>

        {/* Netting stats */}
        {nettingResult && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Raw Debt Edges</p>
              <p className="text-2xl font-bold text-slate-100">{nettingResult.rawEdgeCount}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Net Obligations</p>
              <p className="text-2xl font-bold text-cyan-400">{nettingResult.netEdgeCount}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Reduction Ratio</p>
              <p className="text-2xl font-bold text-emerald-400">{nettingResult.reductionRatio}:1</p>
            </div>
          </div>
        )}

        {/* Balances */}
        {nettingResult && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wide">
              Net Balances (in USD reference currency)
            </h3>
            <div className="flex flex-wrap gap-2">
              {nettingResult.balances.map((b) => {
                const ent = entityMap.get(b.entityId);
                const isCreditor = b.netUsd > 0;
                return (
                  <div
                    key={b.entityId}
                    className={`rounded-lg border px-3 py-2 ${
                      isCreditor
                        ? "border-emerald-700 bg-emerald-950/30"
                        : "border-red-800 bg-red-950/20"
                    }`}
                  >
                    <span className="text-sm font-medium text-slate-200">
                      {b.entityName}
                    </span>
                    <span className="text-xs text-slate-500 ml-1">({ent?.country})</span>
                    <span className={`ml-2 font-mono text-sm ${isCreditor ? "text-emerald-400" : "text-red-400"}`}>
                      {b.netUsd > 0 ? "+" : ""}{b.netUsd.toFixed(2)} USD
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Two-column layout: graph + scenario */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Debt graph */}
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">
              {hasNetted ? "Netted Obligation Graph" : "Raw Debt Graph"}
            </h2>
            <DebtGraph
              entities={scenario?.entities ?? []}
              debtEdges={scenario?.debtEdges ?? []}
              obligations={obligations}
              mode={hasNetted ? "netted" : "raw"}
            />
            {/* Rail types exercised */}
            {railTypes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {railTypes.map((rt) => (
                  <span
                    key={rt}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${RAIL_LABELS[rt].color} border-current/30 bg-slate-900`}
                  >
                    {RAIL_LABELS[rt].label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Scenario overview */}
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">Scenario</h2>
            <ScenarioOverview
              entities={scenario?.entities ?? []}
              expenses={scenario?.expenses ?? []}
            />
          </div>
        </div>

        {/* Net obligations */}
        {hasNetted && (
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-3">
              Net Obligations ({obligations.length})
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {obligations.map((ob) => {
                const from = entityMap.get(ob.from);
                const to = entityMap.get(ob.to);
                if (!from || !to) return null;
                return (
                  <ObligationCard
                    key={ob.id}
                    obligation={ob}
                    fromEntity={from}
                    toEntity={to}
                    onSettle={handleSettle}
                    onOpenClaim={setClaimModalToken}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Compliance flags */}
        {complianceFlags.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-3">
              Compliance Flags
            </h2>
            <div className="space-y-2">
              {complianceFlags.map((f, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-orange-800 bg-orange-950/20 p-3 flex items-start gap-2"
                >
                  <span className="text-orange-400 text-sm">⚠</span>
                  <div>
                    <p className="text-sm text-slate-300">
                      <span className="font-medium">{f.type === "limit_exceeded" ? "Limit Exceeded" : "Frequency Anomaly"}</span>
                      {" — "}
                      <span className="text-slate-400">{f.message}</span>
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">Obligation: {f.obligationId}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reconciliation */}
        {reconData && (
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-3">
              B2B Reconciliation
            </h2>
            <ReconciliationView results={reconData.results} vendorSummary={reconData.vendorSummary} />
          </div>
        )}

        {/* Mocked integration notice */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-600">
            <span className="font-semibold text-slate-500">Note:</span> All payment
            rails, FX rates, compliance checks, and bank integrations are
            mocked for this hackathon demo. See README for what each mocked
            integration would look like in production.
          </p>
        </div>
      </main>

      {/* Claim link modal */}
      {claimModalToken && (
        <ClaimLinkModal
          token={claimModalToken}
          onClose={() => setClaimModalToken(null)}
          onClaimed={async () => {
            const s = await client.getScenario();
            setScenario(s);
          }}
        />
      )}
    </div>
  );
}
