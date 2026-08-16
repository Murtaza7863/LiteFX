import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ComplianceFlag,
  NettingResult,
  RailType,
  ReconciliationResult,
  ScenarioResponse,
  User,
} from "./api/client";
import type { Step } from "./components/Stepper";

import { client } from "./api/client";
import { AccountMenu } from "./components/AccountMenu";
import { AddDataForms } from "./components/AddDataForms";
import { AuthScreen } from "./components/AuthScreen";
import { Avatar } from "./components/Avatar";
import { ClaimLinkModal } from "./components/ClaimLinkModal";
import { Collapsible } from "./components/Collapsible";
import { DebtGraph } from "./components/DebtGraph";
import { FxBar } from "./components/FxBar";
import {
  IconMerge,
  IconCompass,
  IconSend,
  IconShield,
  IconFileText,
  IconCheckCircle,
  IconAlertTriangle,
  IconChevron,
} from "./components/icons";
import { LogoMark } from "./components/Logo";
import { ObligationCard } from "./components/ObligationCard";
import { ObligationDetail } from "./components/ObligationDetail";
import { ReconciliationView } from "./components/ReconciliationView";
import { ScenarioOverview } from "./components/ScenarioOverview";
import { InsightsPanel, SharePlanButton } from "./components/SharePlan";
import { Stepper } from "./components/Stepper";
import { ThemeToggle } from "./components/ThemeToggle";
import { COUNTRY_FLAGS } from "./lib/theme";

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
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
  const [editEntityId, setEditEntityId] = useState<string | null>(null);
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null);
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
          const msg = (e as Error).message || "";
          if (i === 4 || /sign in/i.test(msg)) throw e;
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
    void client.me().then(setUser);
    const onUnauth = () => setUser(null);
    window.addEventListener("litefx:unauthorized", onUnauth);
    return () => window.removeEventListener("litefx:unauthorized", onUnauth);
  }, []);

  useEffect(() => {
    if (user) void fetchScenario();
  }, [fetchScenario, user]);

  const handleDataAdded = useCallback(
    (msg: string) => {
      setEditEntityId(null);
      setEditExpenseId(null);
      fetchScenario();
      notify(msg);
    },
    [fetchScenario, notify],
  );

  const handleClear = useCallback(async () => {
    try {
      await client.clear();
      setEditEntityId(null);
      setEditExpenseId(null);
      await fetchScenario();
      notify("Cleared — add your own travelers & expenses");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [fetchScenario, notify]);

  const handleLoadSample = useCallback(async () => {
    try {
      await client.seed();
      setEditEntityId(null);
      setEditExpenseId(null);
      await fetchScenario();
      notify("Sample trip loaded");
    } catch (e) {
      setError((e as Error).message);
    }
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
      const pendingClaim = scenario.netObligations.find(
        (o) =>
          o.chosenRail === "claim_link" &&
          o.claimToken &&
          o.status !== "settled",
      );
      if (pendingClaim?.claimToken) {
        setClaimModalToken(pendingClaim.claimToken);
        notify("Open the claim link to finish payout", "warn");
        return;
      }
      notify("Nothing left to settle");
      return;
    }
    setLoading("settle-all");
    try {
      let claimToken: string | null = null;
      let claims = 0;
      let settled = 0;
      for (const ob of routed) {
        const res = await client.settle(ob.id);
        if (res.link?.token) {
          claims += 1;
          if (!claimToken) claimToken = res.link.token;
        } else if (res.success) {
          settled += 1;
        }
      }
      const s = await client.getScenario();
      setScenario(s);
      if (claimToken) setClaimModalToken(claimToken);
      const bits = [];
      if (settled) bits.push(`settled ${settled}`);
      if (claims)
        bits.push(`generated ${claims} claim link${claims === 1 ? "" : "s"}`);
      notify(bits.join(" · ") || "Done");
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
      setEditEntityId(null);
      setEditExpenseId(null);
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

  const handleLogout = useCallback(async () => {
    try {
      await client.logout();
    } catch {
      /* cookie is cleared either way */
    }
    setUser(null);
    setScenario(null);
    setNettingResult(null);
    setRailTypes([]);
    setComplianceRan(false);
    setComplianceFlags([]);
    setReconData(null);
  }, []);

  const entityMap = useMemo(
    () => new Map((scenario?.entities ?? []).map((e) => [e.id, e])),
    [scenario],
  );

  const obligations = scenario?.netObligations ?? [];
  const hasNetted = obligations.length > 0;

  useEffect(() => {
    if (detailId && !obligations.some((o) => o.id === detailId)) {
      setDetailId(null);
    }
  }, [detailId, obligations]);
  const allActed =
    obligations.length > 0 && obligations.every((o) => o.status === "settled");

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
  if (user === undefined) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="brand-gradient animate-pulse-glow h-10 w-10 rounded-xl" />
        <p className="text-slate-500 text-sm">Loading LiteFX…</p>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthed={setUser} />;
  }

  if (!scenario) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <div className="brand-gradient animate-pulse-glow h-10 w-10 rounded-xl" />
        <p className="text-slate-500 text-sm">
          {error ?? "Loading your trip…"}
        </p>
        {error && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void fetchScenario()}
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  const debtCount = scenario.debtEdges.length;
  const tripEmpty = scenario.entities.length === 0;
  const headerAction =
    debtCount > 0 && !hasNetted
      ? {
          label: loading === "engine" ? "Running…" : "Net & route",
          onClick: handleEngine,
        }
      : hasNetted && railTypes.length === 0
        ? {
            label: loading === "routing" ? "Routing…" : "Route",
            onClick: handleRouting,
          }
        : hasNetted && !allActed
          ? {
              label: loading === "settle-all" ? "Settling…" : "Settle all",
              onClick: handleSettleAll,
            }
          : null;

  const graphBlock = (
    <Collapsible
      key={hasNetted ? "netted" : "raw"}
      title={hasNetted ? "Netted graph" : "Debt graph"}
      sub={
        hasNetted
          ? `${obligations.length} collapsed transfers`
          : `${debtCount} pairwise debts`
      }
      defaultOpen={!hasNetted}
      badge={
        railTypes.length > 0 ? <RailLegend types={railTypes} /> : undefined
      }
    >
      <DebtGraph
        key={hasNetted ? "netted" : "raw"}
        entities={scenario.entities}
        debtEdges={scenario.debtEdges}
        obligations={obligations}
        mode={hasNetted ? "netted" : "raw"}
        onOpenDetail={setDetailId}
      />
    </Collapsible>
  );

  const tripPanel = (
    <section className="glass animate-fade-in-up scroll-mt-24 space-y-4 rounded-2xl p-4 sm:p-5">
      <AddDataForms
        entities={scenario.entities}
        expenses={scenario.expenses}
        expenseCount={scenario.expenses.length}
        onAdded={handleDataAdded}
        onClear={handleClear}
        onLoadSample={handleLoadSample}
        travelerSignal={travelerSignal}
        editEntity={
          scenario.entities.find((e) => e.id === editEntityId) ?? null
        }
        editExpense={
          scenario.expenses.find((e) => e.id === editExpenseId) ?? null
        }
        onCancelEdit={() => {
          setEditEntityId(null);
          setEditExpenseId(null);
        }}
      />
      <ScenarioOverview
        entities={scenario.entities}
        expenses={scenario.expenses}
        onDeleteTraveler={handleDeleteTraveler}
        onDeleteExpense={handleDeleteExpense}
        onEditTraveler={(id) => {
          setEditExpenseId(null);
          setEditEntityId(id);
        }}
        onEditExpense={(id) => {
          setEditEntityId(null);
          setEditExpenseId(id);
        }}
      />
    </section>
  );

  return (
    <div className="min-h-screen font-sans">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--header-bg)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark size={32} />
            <p className="font-display text-[16px] leading-none font-bold tracking-tight">
              Lite<span className="brand-text">FX</span>
            </p>
          </div>
          <div className="flex items-center gap-1">
            {headerAction && (
              <button
                type="button"
                onClick={() => void headerAction.onClick()}
                disabled={loading !== null}
                className="btn-primary !px-3 !py-1.5 text-xs"
              >
                {headerAction.label}
              </button>
            )}
            <FxBar fx={scenario.fx} />
            <ThemeToggle />
            <AccountMenu
              user={user}
              onReset={handleReset}
              onLogout={() => void handleLogout()}
              resetBusy={loading === "reset"}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-5 sm:px-6">
        {error && (
          <div className="bg-red-500/10 border-red-500/25 animate-fade-in rounded-xl border p-3.5">
            <p className="text-red-300 text-sm">
              <span className="font-semibold">Something went wrong:</span>{" "}
              {error}
            </p>
          </div>
        )}

        {tripEmpty && (
          <HeroIntro
            onStart={() => setTravelerSignal((s) => s + 1)}
            onSample={handleLoadSample}
          />
        )}

        {!tripEmpty && (
          <section className="animate-fade-in-up">
            <Stepper steps={steps} busy={loading !== null} />
          </section>
        )}

        {nettingResult && (
          <ReductionStats result={nettingResult} entityMap={entityMap} />
        )}

        {hasNetted && (
          <section className="animate-fade-in-up">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-slate-100 text-base font-semibold">
                Transfers
                <span className="text-slate-500 ml-2 text-xs font-normal">
                  {obligations.length} to settle
                </span>
              </h2>
              <SharePlanButton plan={scenario.plan} onCopied={notify} />
            </div>
            {scenario.plan?.insights && scenario.plan.insights.length > 0 && (
              <div className="mb-2.5">
                <InsightsPanel insights={scenario.plan.insights} />
              </div>
            )}
            {obligations.some(
              (o) =>
                o.chosenRail === "claim_link" &&
                o.claimToken &&
                o.status !== "settled",
            ) && (
              <p className="text-amber-200 mb-3 text-[12px]">
                A recipient still needs to claim.{" "}
                <button
                  type="button"
                  className="text-amber-100 underline underline-offset-2"
                  onClick={() => {
                    const tok = obligations.find(
                      (o) =>
                        o.chosenRail === "claim_link" &&
                        o.claimToken &&
                        o.status !== "settled",
                    )?.claimToken;
                    if (tok) setClaimModalToken(tok);
                  }}
                >
                  Open claim link
                </button>
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {obligations.map((ob) => {
                const from = entityMap.get(ob.from);
                const to = entityMap.get(ob.to);
                if (!from || !to) {
                  return (
                    <div
                      key={ob.id}
                      className="glass text-slate-500 rounded-2xl p-4 text-sm"
                    >
                      Transfer {ob.id} is missing a traveler.
                    </div>
                  );
                }
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

        {tripEmpty ? (
          tripPanel
        ) : hasNetted ? (
          <>
            {graphBlock}
            {tripPanel}
          </>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {graphBlock}
            {tripPanel}
          </div>
        )}

        {(complianceRan || complianceFlags.length > 0) && (
          <Collapsible
            title="Compliance"
            sub={
              complianceFlags.length > 0
                ? `${complianceFlags.length} flag${complianceFlags.length === 1 ? "" : "s"}`
                : "All clear"
            }
            defaultOpen={complianceFlags.length > 0}
          >
            {complianceFlags.length === 0 ? (
              <div className="flex items-center gap-3 py-1">
                <span className="bg-emerald-500/15 text-emerald-300 flex h-8 w-8 items-center justify-center rounded-full">
                  <IconCheckCircle className="h-4 w-4" />
                </span>
                <p className="text-slate-400 text-sm">
                  No corridor-limit or frequency anomalies on the mocked rules.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {complianceFlags.map((f, i) => (
                  <div
                    key={i}
                    className="border-orange-500/20 bg-orange-500/5 flex items-start gap-3 rounded-xl border p-3"
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
          </Collapsible>
        )}

        {reconData && (
          <Collapsible
            title="B2B reconciliation"
            sub="Match settlements against vendor invoices"
            defaultOpen={reconData.results.some(
              (r) => r.status !== "reconciled",
            )}
          >
            <ReconciliationView
              results={reconData.results}
              vendorSummary={reconData.vendorSummary}
              ledger={scenario.ledger}
              entityName={(id) => entityMap.get(id)?.name.trim() ?? id}
            />
          </Collapsible>
        )}

        <footer className="text-slate-500 px-1 pt-1 pb-3 text-[11px]">
          Sandbox — rails are simulated; FX rates are live.
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

function HeroIntro({
  onStart,
  onSample,
}: {
  onStart: () => void;
  onSample: () => void;
}) {
  return (
    <section className="glass animate-fade-in-up rounded-2xl p-5 sm:p-6">
      <h1 className="text-slate-50 font-display text-xl font-bold tracking-tight">
        Start a trip
      </h1>
      <p className="text-slate-400 mt-1.5 max-w-xl text-sm leading-relaxed">
        Add travelers and expenses. LiteFX nets debts into the fewest transfers
        and picks a rail for each one.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onStart} className="btn-primary">
          Add a traveler
        </button>
        <button type="button" onClick={onSample} className="btn-ghost">
          Load sample
        </button>
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
  const [open, setOpen] = useState(false);
  return (
    <section className="glass animate-fade-in-up overflow-hidden rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-white/[0.03] flex w-full items-center gap-3 px-4 py-3 text-left transition-colors sm:px-5"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <p className="text-slate-100 text-sm font-semibold">
            Netting saved {result.transfersSaved} transfer
            {result.transfersSaved === 1 ? "" : "s"}
          </p>
          <p className="text-slate-500 mt-0.5 truncate text-xs">
            {result.reductionRatio}× fewer payments · $
            {result.feeSavingsUsd.toFixed(2)} fees saved
            {(result.corridorSavingsUsd ?? 0) > 0
              ? ` · $${result.corridorSavingsUsd!.toFixed(2)} vs Splitwise match`
              : ""}
          </p>
        </div>
        <span className="chip bg-emerald-500/15 border-emerald-500/25 text-emerald-300 shrink-0 border">
          ↓ {result.reductionRatio}×
        </span>
        <IconChevron
          className={`text-slate-500 h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 sm:px-5">
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
    <div className="flex flex-wrap justify-end gap-1.5">
      {types.map((t) => {
        const meta = META[t];
        if (!meta) return null;
        return (
          <span
            key={t}
            className="text-slate-400 inline-flex items-center gap-1 text-[10px]"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: meta.color }}
            />
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}
