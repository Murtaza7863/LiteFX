import { useCallback, useEffect, useMemo, useState } from "react";
import { client } from "./api/client";
import type {
  ComplianceFlag,
  RailType,
  ReconciliationResult,
  ScenarioResponse,
} from "./api/client";
import { DebtGraph } from "./components/DebtGraph";
import { ObligationCard } from "./components/ObligationCard";
import { ClaimLinkModal } from "./components/ClaimLinkModal";
import { ScenarioOverview } from "./components/ScenarioOverview";
import { ReconciliationView } from "./components/ReconciliationView";
import { Stepper } from "./components/Stepper";
import type { Step } from "./components/Stepper";
import { Avatar } from "./components/Avatar";
import {
  IconMerge,
  IconCompass,
  IconSend,
  IconShield,
  IconFileText,
  IconGlobe,
  IconInfo,
  IconCheckCircle,
  IconAlertTriangle,
} from "./components/icons";
import { COUNTRY_FLAGS } from "./lib/theme";

export default function App() {
  const [scenario, setScenario] = useState<ScenarioResponse | null>(null);
  const [nettingResult, setNettingResult] = useState<{
    rawEdgeCount: number;
    netEdgeCount: number;
    reductionRatio: number;
    balances: { entityId: string; entityName: string; netUsd: number }[];
  } | null>(null);
  const [railTypes, setRailTypes] = useState<RailType[]>([]);
  const [complianceRan, setComplianceRan] = useState(false);
  const [complianceFlags, setComplianceFlags] = useState<ComplianceFlag[]>([]);
  const [reconData, setReconData] = useState<{
    results: ReconciliationResult[];
    vendorSummary: any[];
  } | null>(null);
  const [claimModalToken, setClaimModalToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: "ok" | "warn" }[]>([]);

  const notify = useCallback((msg: string, kind: "ok" | "warn" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const fetchScenario = useCallback(async () => {
    setLoading("scenario");
    try {
      // The backend boots with an async FX fetch, so retry briefly on startup.
      let s: ScenarioResponse | undefined;
      for (let i = 0; i < 5; i++) {
        try {
          s = await client.getScenario();
          break;
        } catch (e) {
          if (i === 4) throw e;
          await new Promise((r) => setTimeout(r, 600));
        }
      }
      setScenario(s!);
      // Rehydrate UI state from the persisted backend so a reload shows the
      // true progress (stepper, stats, legend) instead of a stale blank state.
      setNettingResult(s!.nettingSummary ?? null);
      setRailTypes(
        [...new Set(s!.netObligations.map((o) => o.chosenRail).filter(Boolean))] as RailType[]
      );
      setComplianceRan(!!s!.complianceRan);
      setComplianceFlags(s!.complianceFlags ?? []);
      setReconData(
        s!.reconciliationRan
          ? { results: s!.reconciliationResults, vendorSummary: s!.vendorSummary }
          : null
      );
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
      const s = await client.getScenario();
      setScenario(s);
      notify(`Netted ${r.rawEdgeCount} debts into ${r.netEdgeCount} transfers`);
      setRailTypes([]);
      setComplianceRan(false);
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
      // Routing runs the compliance stub before marking obligations routed,
      // so surface its flags now too.
      setComplianceRan(true);
      setComplianceFlags(s.complianceFlags ?? []);
      notify(`Routed ${r.obligations.length} obligations across rails`);
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
      setComplianceRan(true);
      notify(r.flags.length ? `${r.flags.length} compliance flag(s) raised` : "Compliance clear", r.flags.length ? "warn" : "ok");
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
      notify("Reconciliation complete");
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
      const res = await client.settle(id);
      const s = await client.getScenario();
      setScenario(s);
      notify(res.message.includes("Claim link") ? "Claim link generated" : "Transfer settled");
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
      for (const ob of routed) await client.settle(ob.id);
      const s = await client.getScenario();
      setScenario(s);
      notify(`Settled ${routed.length} transfers`);
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
      notify("Reset to seed data");
      setNettingResult(null);
      setRailTypes([]);
      setComplianceRan(false);
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

  const entityMap = useMemo(
    () => new Map((scenario?.entities ?? []).map((e) => [e.id, e])),
    [scenario]
  );

  const obligations = scenario?.netObligations ?? [];
  const hasNetted = obligations.length > 0;
  const allActed =
    obligations.length > 0 &&
    obligations.every(
      (o) => o.status === "settled" || (o.chosenRail === "claim_link" && !!o.claimToken)
    );

  // Build stepper steps (computed each render so handlers stay fresh).
  const stepDefs = [
    { id: "net", label: "Net", sub: "Collapse debts", icon: <IconMerge className="h-4 w-4" />, done: !!nettingResult, loadingKey: "netting", enabled: true, onClick: handleNetting },
    { id: "route", label: "Route", sub: "Pick rails", icon: <IconCompass className="h-4 w-4" />, done: railTypes.length > 0, loadingKey: "routing", enabled: !!nettingResult, onClick: handleRouting },
    { id: "settle", label: "Settle", sub: "Move money", icon: <IconSend className="h-4 w-4" />, done: allActed, loadingKey: "settle-all", enabled: railTypes.length > 0, onClick: handleSettleAll },
    { id: "comply", label: "Compliance", sub: "Flag checks", icon: <IconShield className="h-4 w-4" />, done: complianceRan, loadingKey: "compliance", enabled: !!nettingResult, onClick: handleCompliance },
    { id: "recon", label: "Reconcile", sub: "Match invoices", icon: <IconFileText className="h-4 w-4" />, done: !!reconData, loadingKey: "reconciliation", enabled: !!nettingResult, onClick: handleReconciliation },
  ];

  const stepStates: Step["state"][] = stepDefs.map((d) => {
    if (loading === d.loadingKey) return "loading";
    if (d.done) return "complete";
    if (!d.enabled) return "locked";
    return "available";
  });
  const firstAvail = stepStates.indexOf("available");
  if (firstAvail >= 0) stepStates[firstAvail] = "active";

  const steps: Step[] = stepDefs.map((d, i) => ({
    id: d.id,
    label: d.label,
    sub: d.sub,
    icon: d.icon,
    state: stepStates[i],
    onClick: d.onClick,
  }));

  return (
    <div className="min-h-screen font-sans">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#070b14]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <p className="text-[15px] font-bold leading-none tracking-tight">
                Lite<span className="brand-text">FX</span>
              </p>
              <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                Cross-border netting & settlement
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex chip bg-violet-500/10 border border-violet-500/25 text-violet-300">
              <IconInfo className="h-3.5 w-3.5" /> Mocked demo
            </span>
            <button onClick={handleReset} disabled={loading !== null} className="btn-ghost !px-3 !py-1.5 text-xs">
              <ResetIcon className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-6">
        {/* Hero intro (before any netting) */}
        {!hasNetted && (
          <HeroIntro entityCount={scenario?.entities.length ?? 0} debtCount={scenario?.debtEdges.length ?? 0} />
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/25 p-3.5 animate-fade-in">
            <p className="text-sm text-red-300">
              <span className="font-semibold">Something went wrong:</span> {error}
            </p>
          </div>
        )}

        {/* Stepper */}
        <section className="animate-fade-in-up">
          <Stepper steps={steps} />
        </section>

        {/* Reduction stats */}
        {nettingResult && <ReductionStats result={nettingResult} />}

        {/* Balances */}
        {nettingResult && <Balances result={nettingResult} entityMap={entityMap} />}

        {/* Graph + Scenario */}
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <section className="animate-fade-in-up">
            <SectionHeader
              title={hasNetted ? "Netted obligation graph" : "Raw debt graph"}
              sub={hasNetted ? `${obligations.length} collapsed transfers` : `${scenario?.debtEdges.length ?? 0} pairwise debts`}
            />
            <DebtGraph
              entities={scenario?.entities ?? []}
              debtEdges={scenario?.debtEdges ?? []}
              obligations={obligations}
              mode={hasNetted ? "netted" : "raw"}
            />
            {railTypes.length > 0 && <RailLegend types={railTypes} />}
          </section>

          <section className="animate-fade-in-up">
            <SectionHeader title="Scenario" sub="Bangkok trip, 6 travelers, 4 currencies" />
            <ScenarioOverview entities={scenario?.entities ?? []} expenses={scenario?.expenses ?? []} />
          </section>
        </div>

        {/* Net obligations */}
        {hasNetted && (
          <section className="animate-fade-in-up">
            <SectionHeader title="Net obligations" sub={`${obligations.length} transfers to settle`} />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
          </section>
        )}

        {/* Compliance flags */}
        {complianceRan && (
          <section className="animate-fade-in-up">
            <SectionHeader title="Compliance" sub={complianceFlags.length > 0 ? `${complianceFlags.length} flag(s)` : "All clear"} />
            {complianceFlags.length === 0 ? (
              <div className="glass rounded-2xl p-5 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300"><IconCheckCircle className="h-4 w-4" /></span>
                <p className="text-sm text-slate-300">
                  No corridor-limit or frequency anomalies detected on the mocked rules.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {complianceFlags.map((f, i) => (
                  <div key={i} className="glass rounded-xl p-3.5 flex items-start gap-3 border-orange-500/20">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500/15 text-orange-300 shrink-0"><IconAlertTriangle className="h-3.5 w-3.5" /></span>
                    <div>
                      <p className="text-[13px] text-slate-200">
                        <span className="font-semibold">{f.type === "limit_exceeded" ? "Limit exceeded" : "Frequency anomaly"}</span>
                        <span className="text-slate-400"> — {f.message}</span>
                      </p>
                      <p className="text-[11px] text-slate-600 mt-0.5 font-mono">{f.obligationId}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Reconciliation */}
        {reconData && (
          <section className="animate-fade-in-up">
            <SectionHeader title="B2B reconciliation" sub="Match settlements against vendor invoices" />
            <ReconciliationView
              results={reconData.results}
              vendorSummary={reconData.vendorSummary}
              ledger={scenario?.ledger ?? []}
              entityName={(id) => entityMap.get(id)?.name.trim() ?? id}
            />
          </section>
        )}

        {/* Footer */}
        <footer className="glass rounded-2xl px-5 py-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-400">Demo note:</span> payment rails, FX rates, claim-link
            delivery, KYC/AML and reconciliation are all mocked. See the{" "}
            <a
              href="https://github.com/Murtaza7863/LiteFX"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-400 hover:underline"
            >
              README
            </a>{" "}
            for what each would look like in production.
          </p>
        </footer>
      </main>

      {/* Toast feedback */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-fade-in-up pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-glass backdrop-blur-xl ${
              t.kind === "warn"
                ? "bg-orange-500/15 border-orange-500/30 text-orange-200"
                : "bg-emerald-500/15 border-emerald-500/30 text-emerald-200"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${t.kind === "warn" ? "bg-orange-400" : "bg-emerald-400"}`} />
            {t.msg}
          </div>
        ))}
      </div>

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

/* ── Small presentational pieces ─────────────────── */

function Logo() {
  return (
    <div className="relative h-9 w-9 rounded-xl brand-gradient flex items-center justify-center shadow-glow-cyan">
      <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    </div>
  );
}

function ResetIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-base font-semibold text-slate-100 capitalize">{title}</h2>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function HeroIntro({ entityCount, debtCount }: { entityCount: number; debtCount: number }) {
  return (
    <section className="relative overflow-hidden glass rounded-3xl p-6 sm:p-8 animate-fade-in-up">
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full brand-gradient opacity-20 blur-3xl" />
      <div className="relative">
        <p className="chip bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 mb-3">
          <IconGlobe className="h-3.5 w-3.5" /> Cross-border settlement
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-50">
          Collapse messy trip debts into <span className="brand-text">minimal transfers</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400 leading-relaxed">
          {entityCount} travelers across 4 countries generated {debtCount} pairwise debts in 4 currencies. Run the
          netting agent to collapse them into the fewest possible cross-border transfers — then watch each one get
          routed through the cheapest rail, including a no-account claim-link path.
        </p>
      </div>
    </section>
  );
}

function ReductionStats({ result }: { result: { rawEdgeCount: number; netEdgeCount: number; reductionRatio: number } }) {
  const pct = Math.max(6, Math.round((result.netEdgeCount / Math.max(result.rawEdgeCount, 1)) * 100));
  return (
    <section className="glass rounded-2xl p-5 animate-fade-in-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title">Debt reduction</h3>
        <span className="chip bg-emerald-500/15 border border-emerald-500/25 text-emerald-300">
          ↓ {result.reductionRatio}× fewer transfers
        </span>
      </div>
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Raw pairwise debts</span>
            <span className="font-mono text-sm text-slate-300">{result.rawEdgeCount}</span>
          </div>
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full w-full rounded-full bg-gradient-to-r from-slate-500 to-slate-400" />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Net transfers after netting</span>
            <span className="font-mono text-sm brand-text font-semibold">{result.netEdgeCount}</span>
          </div>
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full rounded-full brand-gradient transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Balances({
  result,
  entityMap,
}: {
  result: { balances: { entityId: string; entityName: string; netUsd: number }[] };
  entityMap: Map<string, { id: string; name: string; country: string }>;
}) {
  return (
    <section className="animate-fade-in-up">
      <SectionHeader title="Net balances" sub="in USD reference currency" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {result.balances.map((b) => {
          const ent = entityMap.get(b.entityId);
          const isCreditor = b.netUsd > 0;
          return (
            <div key={b.entityId} className="glass rounded-xl p-3 flex flex-col items-center text-center animate-fade-in-up">
              <Avatar id={b.entityId} name={b.entityName} size={40} />
              <p className="mt-2 text-[13px] font-semibold text-slate-200 leading-tight">
                {b.entityName.split(" ")[0]}
              </p>
              <p className="text-[10px] text-slate-500">
                {ent ? `${COUNTRY_FLAGS[ent.country]} ${ent.country}` : ""}
              </p>
              <p className={`mt-1.5 font-mono text-[13px] font-semibold ${isCreditor ? "text-emerald-400" : "text-red-400"}`}>
                {isCreditor ? "+" : ""}${Math.abs(b.netUsd).toFixed(2)}
              </p>
              <p className="text-[9px] uppercase tracking-wide text-slate-600">
                {isCreditor ? "receives" : "owes"}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RailLegend({ types }: { types: RailType[] }) {
  const META: Record<string, { label: string; color: string }> = {
    local: { label: "Local", color: "#34d399" },
    linked: { label: "Linked", color: "#60a5fa" },
    claim_link: { label: "Claim link", color: "#fbbf24" },
    stable_bridge: { label: "Stable bridge", color: "#a78bfa" },
  };
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {types.map((t) => (
        <span key={t} className="chip bg-white/[0.04] border border-white/[0.08] text-slate-300">
          <span className="h-2 w-2 rounded-full" style={{ background: META[t].color }} />
          {META[t].label}
        </span>
      ))}
    </div>
  );
}
