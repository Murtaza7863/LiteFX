import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ComplianceFlag,
  NettingResult,
  RailType,
  ReconciliationResult,
  ScenarioResponse,
} from "./api/client";
import type { Step } from "./components/Stepper";

import { client } from "./api/client";
import { AddDataForms } from "./components/AddDataForms";
import { Avatar } from "./components/Avatar";
import { ClaimLinkModal } from "./components/ClaimLinkModal";
import { DebtGraph } from "./components/DebtGraph";
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
import { LogoMark } from "./components/Logo";
import { ObligationCard } from "./components/ObligationCard";
import { ObligationDetail } from "./components/ObligationDetail";
import { ReconciliationView } from "./components/ReconciliationView";
import { ScenarioOverview } from "./components/ScenarioOverview";
import { Stepper } from "./components/Stepper";
import { COUNTRY_FLAGS } from "./lib/theme";

export default function App() {
  const [scenario, setScenario] = useState<ScenarioResponse | null>(null);
  const [nettingResult, setNettingResult] = useState<NettingResult | null>(
    null,
  );
  const [railTypes, setRailTypes] = useState<RailType[]>([]);
  const [complianceRan, setComplianceRan] = useState(false);
  const [complianceFlags, setComplianceFlags] = useState<ComplianceFlag[]>([]);
  const [reconData, setReconData] = useState<{
    results: ReconciliationResult[];
    vendorSummary: any[];
  } | null>(null);
  const [claimModalToken, setClaimModalToken] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [travelerSignal, setTravelerSignal] = useState(0);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<
    { id: number; msg: string; kind: "ok" | "warn" }[]
  >([]);

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
      setRailTypes([
        ...new Set(s!.netObligations.map((o) => o.chosenRail).filter(Boolean)),
      ] as RailType[]);
      setComplianceRan(!!s!.complianceRan);
      setComplianceFlags(s!.complianceFlags ?? []);
      setReconData(
        s!.reconciliationRan
          ? {
              results: s!.reconciliationResults,
              vendorSummary: s!.vendorSummary,
            }
          : null,
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

  const handleDataAdded = useCallback(
    (msg: string) => {
      fetchScenario();
      notify(msg);
    },
    [fetchScenario, notify],
  );

  const handleClear = useCallback(async () => {
    await client.clear();
    await fetchScenario();
    notify("Cleared — add your own travelers & expenses");
  }, [fetchScenario, notify]);

  const handleLoadSample = useCallback(async () => {
    await client.seed();
    await fetchScenario();
    notify("Sample trip loaded");
  }, [fetchScenario, notify]);

  const handleDeleteExpense = useCallback(
    async (id: string) => {
      await client.deleteExpense(id);
      await fetchScenario();
      notify("Expense removed — debts recomputed");
    },
    [fetchScenario, notify],
  );

  const handleDeleteTraveler = useCallback(
    async (id: string) => {
      await client.deleteEntity(id);
      await fetchScenario();
      notify("Traveler removed");
    },
    [fetchScenario, notify],
  );

  const handleNetting = async () => {
    setLoading("netting");
    try {
      const r = await client.runNetting();
      setNettingResult(r);
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

  const handleEngine = async () => {
    setLoading("engine");
    try {
      const r = await client.runEngine();
      setNettingResult(r);
      setRailTypes(r.railTypesExercised);
      const s = await client.getScenario();
      setScenario(s);
      setComplianceRan(!!s.complianceRan);
      setComplianceFlags(s.complianceFlags ?? []);
      notify(
        `Netted ${r.rawEdgeCount} debts into ${r.netEdgeCount} transfers and routed them`,
      );
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
      setComplianceRan(!!s.complianceRan);
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
      notify(
        r.flags.length
          ? `${r.flags.length} compliance flag(s) raised`
          : "Compliance clear",
        r.flags.length ? "warn" : "ok",
      );
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
      if (!res.success) {
        notify(res.message, "warn");
        setError(null);
        return;
      }
      if (res.link?.token) {
        setClaimModalToken(res.link.token);
        notify("Claim link generated");
      } else {
        notify(
          res.message.includes("Claim link")
            ? "Claim link generated"
            : "Transfer settled",
        );
      }
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const handleSettleAll = async () => {
    if (!scenario) return;
    const routed = scenario.netObligations.filter(
      (o) => o.status === "routed" && !o.claimToken,
    );
    if (routed.length === 0) {
      notify("Nothing left to settle");
      return;
    }
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
      await client.seed();
      notify("Reset to sample trip");
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
    [scenario],
  );

  const obligations = scenario?.netObligations ?? [];
  const hasNetted = obligations.length > 0;
  const allActed =
    obligations.length > 0 &&
    obligations.every(
      (o) =>
        o.status === "settled" ||
        (o.chosenRail === "claim_link" && !!o.claimToken),
    );

  // Build stepper steps (computed each render so handlers stay fresh).
  const stepDefs = [
    {
      id: "net",
      label: "Net",
      sub: "Collapse debts",
      icon: <IconMerge className="h-4 w-4" />,
      done: !!nettingResult,
      loadingKey: "netting",
      enabled: true,
      onClick: handleNetting,
    },
    {
      id: "route",
      label: "Route",
      sub: "Pick rails",
      icon: <IconCompass className="h-4 w-4" />,
      done: railTypes.length > 0,
      loadingKey: "routing",
      enabled: !!nettingResult,
      onClick: handleRouting,
    },
    {
      id: "settle",
      label: "Settle",
      sub: "Move money",
      icon: <IconSend className="h-4 w-4" />,
      done: allActed,
      loadingKey: "settle-all",
      enabled: railTypes.length > 0,
      onClick: handleSettleAll,
    },
    {
      id: "comply",
      label: "Compliance",
      sub: "Flag checks",
      icon: <IconShield className="h-4 w-4" />,
      done: complianceRan,
      loadingKey: "compliance",
      enabled: !!nettingResult,
      onClick: handleCompliance,
    },
    {
      id: "recon",
      label: "Reconcile",
      sub: "Match invoices",
      icon: <IconFileText className="h-4 w-4" />,
      done: !!reconData,
      loadingKey: "reconciliation",
      enabled: !!nettingResult,
      onClick: handleReconciliation,
    },
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

  // Branded loading state so the app never flashes an empty / broken screen.
  if (!scenario) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="brand-gradient animate-pulse-glow h-10 w-10 rounded-xl" />
        <p className="text-slate-500 text-sm">Loading LiteFX…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans">
      {/* Header */}
      <header className="border-white/[0.06] sticky top-0 z-40 border-b bg-[#070b14]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <LogoMark size={36} />
            <div>
              <p className="font-display text-[16px] leading-none font-bold tracking-tight">
                Lite<span className="brand-text">FX</span>
              </p>
              <p className="text-slate-500 mt-0.5 text-[10px] leading-tight">
                Cross-border netting & settlement
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="chip bg-violet-500/10 border-violet-500/25 text-violet-300 hidden border sm:inline-flex">
              <IconInfo className="h-3.5 w-3.5" /> Sandbox
            </span>
            <button
              onClick={handleReset}
              disabled={loading !== null}
              className="btn-ghost !px-3 !py-1.5 text-xs"
            >
              <ResetIcon className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        {error && (
          <div className="bg-red-500/10 border-red-500/25 animate-fade-in rounded-xl border p-3.5">
            <p className="text-red-300 text-sm">
              <span className="font-semibold">Something went wrong:</span>{" "}
              {error}
            </p>
          </div>
        )}

        {!hasNetted && (
          <HeroIntro
            entityCount={scenario?.entities.length ?? 0}
            debtCount={scenario?.debtEdges.length ?? 0}
            onStart={() => setTravelerSignal((s) => s + 1)}
            onSample={handleLoadSample}
            onEngine={handleEngine}
            engineBusy={loading === "engine"}
          />
        )}

        <section className="animate-fade-in-up">
          <Stepper steps={steps} busy={loading !== null} />
        </section>

        {nettingResult && (
          <ReductionStats result={nettingResult} entityMap={entityMap} />
        )}

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <section className="glass animate-fade-in-up rounded-2xl p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-slate-100 text-base font-semibold">
                  {hasNetted ? "Netted graph" : "Debt graph"}
                </h2>
                <p className="text-slate-500 mt-0.5 text-xs">
                  {hasNetted
                    ? `${obligations.length} collapsed transfers`
                    : `${scenario?.debtEdges.length ?? 0} pairwise debts`}
                </p>
              </div>
              {railTypes.length > 0 && <RailLegend types={railTypes} />}
            </div>
            <DebtGraph
              key={hasNetted ? "netted" : "raw"}
              entities={scenario?.entities ?? []}
              debtEdges={scenario?.debtEdges ?? []}
              obligations={obligations}
              mode={hasNetted ? "netted" : "raw"}
              onOpenDetail={setDetailId}
            />
          </section>

          <section className="glass animate-fade-in-up scroll-mt-24 space-y-4 rounded-2xl p-4 sm:p-5">
            <AddDataForms
              entities={scenario?.entities ?? []}
              expenseCount={scenario?.expenses.length ?? 0}
              onAdded={handleDataAdded}
              onClear={handleClear}
              onLoadSample={handleLoadSample}
              travelerSignal={travelerSignal}
            />
            <ScenarioOverview
              entities={scenario?.entities ?? []}
              expenses={scenario?.expenses ?? []}
              onDeleteTraveler={handleDeleteTraveler}
              onDeleteExpense={handleDeleteExpense}
            />
          </section>
        </div>

        {hasNetted && (
          <section className="animate-fade-in-up">
            <SectionHeader
              title="Net obligations"
              sub={`${obligations.length} transfers to settle`}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {obligations.map((ob) => {
                const from = entityMap.get(ob.from);
                const to = entityMap.get(ob.to);
                if (!from || !to) return null;
                return (
                  <ObligationCard
                    key={ob.id}
                    className="h-full"
                    obligation={ob}
                    fromEntity={from}
                    toEntity={to}
                    onSettle={handleSettle}
                    onOpenClaim={setClaimModalToken}
                    onOpenDetail={setDetailId}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Compliance flags */}
        {complianceRan && (
          <section className="animate-fade-in-up">
            <SectionHeader
              title="Compliance"
              sub={
                complianceFlags.length > 0
                  ? `${complianceFlags.length} flag(s)`
                  : "All clear"
              }
            />
            {complianceFlags.length === 0 ? (
              <div className="glass flex items-center gap-3 rounded-2xl p-5">
                <span className="bg-emerald-500/15 text-emerald-300 flex h-9 w-9 items-center justify-center rounded-full">
                  <IconCheckCircle className="h-4 w-4" />
                </span>
                <p className="text-slate-300 text-sm">
                  No corridor-limit or frequency anomalies detected on the
                  mocked rules.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {complianceFlags.map((f, i) => (
                  <div
                    key={i}
                    className="glass border-orange-500/20 flex items-start gap-3 rounded-xl p-3.5"
                  >
                    <span className="bg-orange-500/15 text-orange-300 flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                      <IconAlertTriangle className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <p className="text-slate-200 text-[13px]">
                        <span className="font-semibold">
                          {f.type === "limit_exceeded"
                            ? "Limit exceeded"
                            : "Frequency anomaly"}
                        </span>
                        <span className="text-slate-400"> — {f.message}</span>
                      </p>
                      <p className="text-slate-600 mt-0.5 font-mono text-[11px]">
                        {f.obligationId}
                      </p>
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
            <SectionHeader
              title="B2B reconciliation"
              sub="Match settlements against vendor invoices"
            />
            <ReconciliationView
              results={reconData.results}
              vendorSummary={reconData.vendorSummary}
              ledger={scenario?.ledger ?? []}
              entityName={(id) => entityMap.get(id)?.name.trim() ?? id}
            />
          </section>
        )}

        <footer className="text-slate-500 px-1 pt-2 pb-4 text-xs leading-relaxed">
          <span className="text-slate-400 font-semibold">Sandbox:</span>{" "}
          settlement rails are simulated (no real money moves); FX rates are
          live. Add travelers and expenses in the trip panel — the engine nets
          and routes whatever you add.
        </footer>
      </main>

      {/* Toast feedback */}
      <div className="pointer-events-none fixed right-5 bottom-5 z-50 flex flex-col items-end gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-fade-in-up shadow-glass pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium backdrop-blur-xl ${
              t.kind === "warn"
                ? "bg-orange-500/15 border-orange-500/30 text-orange-200"
                : "bg-emerald-500/15 border-emerald-500/30 text-emerald-200"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${t.kind === "warn" ? "bg-orange-400" : "bg-emerald-400"}`}
            />
            {t.msg}
          </div>
        ))}
      </div>

      {/* Obligation detail (routing decision) */}
      {detailId &&
        (() => {
          const ob = obligations.find((o) => o.id === detailId);
          const from = ob && entityMap.get(ob.from);
          const to = ob && entityMap.get(ob.to);
          return ob && from && to ? (
            <ObligationDetail
              obligation={ob}
              fromEntity={from}
              toEntity={to}
              debtEdges={scenario?.debtEdges ?? []}
              onClose={() => setDetailId(null)}
            />
          ) : null;
        })()}

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

function ResetIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-slate-100 text-base font-semibold">{title}</h2>
      {sub && <p className="text-slate-500 mt-0.5 text-xs">{sub}</p>}
    </div>
  );
}

function HeroIntro({
  entityCount,
  debtCount,
  onStart,
  onSample,
  onEngine,
  engineBusy,
}: {
  entityCount: number;
  debtCount: number;
  onStart: () => void;
  onSample: () => void;
  onEngine: () => void;
  engineBusy: boolean;
}) {
  return (
    <section className="glass animate-fade-in-up relative overflow-hidden rounded-3xl p-6 sm:p-8">
      <div className="brand-gradient pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-20 blur-3xl" />
      <div className="relative">
        <p className="chip bg-cyan-500/10 border-cyan-500/25 text-cyan-300 mb-3 border">
          <IconGlobe className="h-3.5 w-3.5" /> Cross-border settlement
        </p>
        <h1 className="text-slate-50 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Collapse messy group debts into{" "}
          <span className="brand-text">minimal transfers</span>
        </h1>
        <p className="text-slate-400 mt-3 max-w-2xl text-sm leading-relaxed">
          {debtCount > 0
            ? `${entityCount} travelers owe each other across ${debtCount} pairwise debts. Netting matches cheap corridors first (local / linked rails before USDC), then routes each leftover transfer.`
            : `Add your travelers and expenses, and LiteFX nets the debts into the fewest transfers — matched onto the cheapest rail, with a claim link for anyone without an account.`}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {debtCount > 0 && (
            <button
              onClick={onEngine}
              disabled={engineBusy}
              className="btn-primary"
            >
              {engineBusy ? "Running…" : "Net & route debts"}
            </button>
          )}
          {entityCount === 0 && (
            <>
              <button onClick={onStart} className="btn-primary">
                Start your trip
              </button>
              <button onClick={onSample} className="btn-ghost">
                Explore the sample trip
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function useCountUp(target: number, duration = 700): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function ReductionStats({
  result,
  entityMap,
}: {
  result: {
    rawEdgeCount: number;
    netEdgeCount: number;
    reductionRatio: number;
    transfersSaved: number;
    rawTotalUsd: number;
    netTotalUsd: number;
    feeSavingsUsd: number;
    greedyFeeUsd?: number;
    corridorSavingsUsd?: number;
    balances: { entityId: string; entityName: string; netUsd: number }[];
  };
  entityMap: Map<string, { id: string; name: string; country: string }>;
}) {
  const pct = Math.max(
    6,
    Math.round((result.netEdgeCount / Math.max(result.rawEdgeCount, 1)) * 100),
  );
  const saved = useCountUp(result.transfersSaved);
  const fees = useCountUp(result.feeSavingsUsd);
  const moved = useCountUp(result.netTotalUsd);
  const corridor = useCountUp(result.corridorSavingsUsd ?? 0);
  return (
    <section className="glass animate-fade-in-up rounded-2xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="section-title">What netting saved you</h3>
        <span className="chip bg-emerald-500/15 border-emerald-500/25 text-emerald-300 border">
          ↓ {result.reductionRatio}× fewer transfers
        </span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="bg-black/25 border-white/[0.05] rounded-xl border p-3 text-center">
          <p className="font-display text-slate-50 tnum text-2xl font-bold">
            {Math.round(saved)}
          </p>
          <p className="text-slate-500 mt-0.5 text-[10px] tracking-wide uppercase">
            transfers saved
          </p>
        </div>
        <div className="bg-black/25 border-white/[0.05] rounded-xl border p-3 text-center">
          <p className="font-display text-emerald-300 tnum text-2xl font-bold">
            ${fees.toFixed(2)}
          </p>
          <p className="text-slate-500 mt-0.5 text-[10px] tracking-wide uppercase">
            est. fees saved
          </p>
        </div>
        <div className="bg-black/25 border-white/[0.05] rounded-xl border p-3 text-center">
          <p className="font-display text-cyan-300 tnum text-2xl font-bold">
            ${corridor.toFixed(2)}
          </p>
          <p className="text-slate-500 mt-0.5 text-[10px] tracking-wide uppercase">
            vs Splitwise match
          </p>
        </div>
        <div className="bg-black/25 border-white/[0.05] rounded-xl border p-3 text-center">
          <p className="font-display brand-text tnum text-2xl font-bold">
            ${moved.toFixed(2)}
          </p>
          <p className="text-slate-500 mt-0.5 text-[10px] tracking-wide uppercase">
            to move{" "}
            <span className="text-slate-600 whitespace-nowrap line-through">
              ${result.rawTotalUsd.toFixed(0)}
            </span>
          </p>
        </div>
      </div>

      <p className="text-slate-500 mb-4 text-[11px]">
        Matched cheapest corridors first (local / SEPA / linked) instead of
        largest-debtor → largest-creditor.
        {result.greedyFeeUsd != null && result.greedyFeeUsd > 0
          ? ` Splitwise-style matching would have cost ~$${result.greedyFeeUsd.toFixed(2)} in rail fees.`
          : ""}
      </p>

      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-slate-500 text-xs">
              Without netting · {result.rawEdgeCount} payments
            </span>
            <span className="text-slate-300 font-mono text-sm">
              {result.rawEdgeCount}
            </span>
          </div>
          <div className="bg-white/[0.06] h-2 overflow-hidden rounded-full">
            <div className="from-slate-500 to-slate-400 h-full w-full rounded-full bg-gradient-to-r" />
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-slate-500 text-xs">
              With LiteFX · {result.netEdgeCount} payments
            </span>
            <span className="brand-text font-mono text-sm font-semibold">
              {result.netEdgeCount}
            </span>
          </div>
          <div className="bg-white/[0.06] h-2 overflow-hidden rounded-full">
            <div
              className="brand-gradient h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {result.balances.length > 0 && (
        <div className="border-white/[0.06] mt-5 border-t pt-4">
          <p className="section-title mb-3">Net balances</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {result.balances.map((b) => {
              const ent = entityMap.get(b.entityId);
              const settled = Math.abs(b.netUsd) < 0.005;
              const isCreditor = b.netUsd > 0.005;
              return (
                <div
                  key={b.entityId}
                  className="bg-black/25 border-white/[0.05] flex flex-col items-center rounded-xl border p-3 text-center"
                >
                  <Avatar id={b.entityId} name={b.entityName} size={36} />
                  <p className="text-slate-200 mt-2 text-[13px] leading-tight font-semibold">
                    {b.entityName.split(" ")[0]}
                  </p>
                  <p className="text-slate-500 text-[10px]">
                    {ent
                      ? `${COUNTRY_FLAGS[ent.country] ?? ""} ${ent.country}`
                      : ""}
                  </p>
                  <p
                    className={`mt-1.5 font-mono text-[13px] font-semibold ${
                      settled
                        ? "text-slate-400"
                        : isCreditor
                          ? "text-emerald-400"
                          : "text-red-400"
                    }`}
                  >
                    {isCreditor ? "+" : settled ? "" : "−"}$
                    {Math.abs(b.netUsd).toFixed(2)}
                  </p>
                  <p className="text-slate-600 text-[9px] tracking-wide uppercase">
                    {settled ? "settled" : isCreditor ? "receives" : "owes"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
    <div className="flex flex-wrap justify-end gap-2">
      {types.map((t) => {
        const meta = META[t];
        if (!meta) return null;
        return (
          <span
            key={t}
            className="chip bg-white/[0.04] border-white/[0.08] text-slate-300 border"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: meta.color }}
            />
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}
