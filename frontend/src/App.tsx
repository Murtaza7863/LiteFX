import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  NettingResult,
  RailType,
  ScenarioResponse,
  User,
} from "./api/client";
import type { Step } from "./components/Stepper";

import { client, isStaticEngine } from "./api/client";
import { AccountMenu } from "./components/AccountMenu";
import { AddDataForms } from "./components/AddDataForms";
import { AuthScreen } from "./components/AuthScreen";
import { Avatar } from "./components/Avatar";
import { ClaimLinkModal } from "./components/ClaimLinkModal";
import { Collapsible } from "./components/Collapsible";
import { DebtGraph } from "./components/DebtGraph";
import { FxBar } from "./components/FxBar";
import { IconMerge, IconSend, IconChevron } from "./components/icons";
import { LogoMark, Wordmark } from "./components/Logo";
import { ObligationCard } from "./components/ObligationCard";
import { ObligationDetail } from "./components/ObligationDetail";
import { ScenarioOverview } from "./components/ScenarioOverview";
import { SettlementLog } from "./components/SettlementLog";
import { InsightsPanel, SharePlanButton } from "./components/SharePlan";
import { Stepper } from "./components/Stepper";
import { ThemeToggle } from "./components/ThemeToggle";
import { TripSwitcher } from "./components/TripSwitcher";
import { countryFlag, RAIL_META } from "./lib/theme";

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [scenario, setScenario] = useState<ScenarioResponse | null>(null);
  const [nettingResult, setNettingResult] = useState<NettingResult | null>(
    null,
  );
  const [railTypes, setRailTypes] = useState<RailType[]>([]);
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
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }, []);

  useEffect(() => {
    const onUnauth = () => setUser(null);
    window.addEventListener("litefx:unauthorized", onUnauth);
    void (async () => {
      try {
        let u = await client.me();
        // GitHub Pages has no API — open a demo session. Seed only on a
        // first visit so later trips stay on this device.
        if (!u && isStaticEngine) {
          let hadDb = false;
          try {
            hadDb = localStorage.getItem("litefx-db") != null;
          } catch {
            /* private mode */
          }
          u = await client.demo();
          if (!hadDb) await client.seed();
        }
        setUser(u);
      } catch {
        setUser(null);
      }
    })();
    return () => window.removeEventListener("litefx:unauthorized", onUnauth);
  }, []);

  useEffect(() => {
    if (user) void fetchScenario();
  }, [fetchScenario, user]);

  const handleDataAdded = useCallback(
    async (msg: string) => {
      const hadTransfers = (scenario?.netObligations.length ?? 0) > 0;
      setEditEntityId(null);
      setEditExpenseId(null);
      await fetchScenario();
      notify(
        hadTransfers ? `${msg} · run Net & route again` : msg,
        hadTransfers ? "warn" : "ok",
      );
    },
    [fetchScenario, notify, scenario?.netObligations.length],
  );

  const handleClear = useCallback(async () => {
    if (
      !window.confirm(
        "Clear all travelers and expenses on this trip? This cannot be undone.",
      )
    ) {
      return;
    }
    try {
      await client.clear();
      setEditEntityId(null);
      setEditExpenseId(null);
      setClaimModalToken(null);
      setDetailId(null);
      await fetchScenario();
      notify("Cleared — add your own travelers & expenses");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [fetchScenario, notify]);

  const handleLoadSample = useCallback(async () => {
    if (
      scenario &&
      (scenario.entities.length > 0 || scenario.expenses.length > 0) &&
      !window.confirm(
        "Replace this trip with the sample travelers and expenses?",
      )
    ) {
      return;
    }
    try {
      await client.seed();
      setEditEntityId(null);
      setEditExpenseId(null);
      setClaimModalToken(null);
      setDetailId(null);
      await fetchScenario();
      notify("Sample trip loaded");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [fetchScenario, notify, scenario]);

  const handleDeleteExpense = useCallback(
    async (id: string) => {
      if (!window.confirm("Remove this expense?")) return;
      try {
        await client.deleteExpense(id);
        setEditExpenseId((cur) => (cur === id ? null : cur));
        setClaimModalToken(null);
        setDetailId(null);
        await fetchScenario();
        notify("Expense removed — debts recomputed");
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [fetchScenario, notify],
  );

  const handleDeleteTraveler = useCallback(
    async (id: string) => {
      if (
        !window.confirm(
          "Remove this traveler? Expenses they paid will be deleted, and they will be taken out of other splits.",
        )
      ) {
        return;
      }
      try {
        await client.deleteEntity(id);
        setEditEntityId((cur) => (cur === id ? null : cur));
        setEditExpenseId(null);
        setClaimModalToken(null);
        setDetailId(null);
        await fetchScenario();
        notify("Traveler removed");
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [fetchScenario, notify],
  );

  const handleEngine = async () => {
    if (!scenario || scenario.debtEdges.length === 0) {
      notify("Add a shared expense before netting", "warn");
      return;
    }
    if (scenario.netObligations.length > 0) {
      notify("This trip is already netted", "warn");
      return;
    }
    setLoading("engine");
    try {
      const r = await client.runEngine();
      setNettingResult(r);
      setRailTypes(r.railTypesExercised);
      setClaimModalToken(null);
      setDetailId(null);
      const s = await client.getScenario();
      setScenario(s);
      notify(
        `Netted ${r.rawEdgeCount} debts into ${r.netEdgeCount} transfers and routed them`,
      );
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

  const handleOverrideRail = async (obligationId: string, railName: string) => {
    setLoading(`rail-${obligationId}`);
    try {
      await client.overrideRail(obligationId, railName);
      const s = await client.getScenario();
      setScenario(s);
      setRailTypes([
        ...new Set(s.netObligations.map((o) => o.chosenRail).filter(Boolean)),
      ] as RailType[]);
      notify(`Rail switched to ${railName}`);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const handleLinkAccount = async (entityId: string) => {
    setLoading(`link-${entityId}`);
    try {
      const r = await client.linkAccount(entityId);
      const s = await client.getScenario();
      setScenario(s);
      setRailTypes([
        ...new Set(s.netObligations.map((o) => o.chosenRail).filter(Boolean)),
      ] as RailType[]);
      const rail = r.entity.linkedRailAliases[0]?.railType ?? "account";
      notify(`${r.entity.name.trim()} linked ${rail} — transfers re-routed`);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const handleReset = async () => {
    if (
      !window.confirm(
        "Replace this trip with the sample travelers and expenses?",
      )
    ) {
      return;
    }
    setLoading("reset");
    try {
      await client.seed();
      notify("Sample trip loaded into this trip");
      setEditEntityId(null);
      setEditExpenseId(null);
      setClaimModalToken(null);
      setDetailId(null);
      setNettingResult(null);
      setRailTypes([]);
      await fetchScenario();
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const switchTripView = useCallback(async () => {
    setEditEntityId(null);
    setEditExpenseId(null);
    setClaimModalToken(null);
    setDetailId(null);
    await fetchScenario();
  }, [fetchScenario]);

  const handleSelectTrip = useCallback(
    async (id: string) => {
      try {
        await client.selectTrip(id);
        await switchTripView();
        notify("Opened trip");
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [notify, switchTripView],
  );

  const handleCreateTrip = useCallback(
    async (name: string) => {
      try {
        await client.createTrip(name);
        await switchTripView();
        notify(`Started ${name.trim()}`);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [notify, switchTripView],
  );

  const handleRenameTrip = useCallback(
    async (id: string, name: string) => {
      try {
        await client.renameTrip(id, name);
        await fetchScenario();
        notify("Trip renamed");
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [fetchScenario, notify],
  );

  const handleDeleteTrip = useCallback(
    async (id: string) => {
      if (
        !window.confirm(
          "Delete this trip and its expenses? Other trips are kept.",
        )
      ) {
        return;
      }
      try {
        await client.deleteTrip(id);
        await switchTripView();
        notify("Trip deleted");
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [notify, switchTripView],
  );

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
    setClaimModalToken(null);
    setDetailId(null);
    setEditEntityId(null);
    setEditExpenseId(null);
  }, []);

  const entityMap = useMemo(
    () => new Map((scenario?.entities ?? []).map((e) => [e.id, e])),
    [scenario],
  );

  const obligations = scenario?.netObligations ?? [];
  const hasNetted = obligations.length > 0;
  const debtCount = scenario?.debtEdges.length ?? 0;

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
      label: "Net & route",
      sub: "Collapse debts and pick rails",
      icon: <IconMerge className="h-4 w-4" />,
      done: railTypes.length > 0,
      loadingKey: "engine",
      enabled: debtCount > 0 && !hasNetted,
      onClick: handleEngine,
    },
    {
      id: "settle",
      label: "Settle",
      sub: "Issue transfers",
      icon: <IconSend className="h-4 w-4" />,
      done: allActed,
      loadingKey: "settle-all",
      enabled: railTypes.length > 0,
      onClick: handleSettleAll,
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
        <LogoMark size={40} />
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
        <LogoMark size={40} />
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

  const tripEmpty = scenario.entities.length === 0;
  const headerAction =
    debtCount > 0 && !hasNetted
      ? {
          label: loading === "engine" ? "Running…" : "Net & route",
          onClick: handleEngine,
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
      title="Who owes whom"
      sub={
        hasNetted
          ? `${obligations.length} transfer${obligations.length === 1 ? "" : "s"}`
          : `${debtCount} IOU${debtCount === 1 ? "" : "s"}`
      }
      defaultOpen
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
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--header-bg)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark size={32} />
            <Wordmark className="hidden text-[1.15rem] sm:inline" />
            {scenario && (
              <TripSwitcher
                trip={scenario.trip}
                trips={scenario.trips ?? []}
                busy={loading !== null}
                onSelect={(id) => void handleSelectTrip(id)}
                onCreate={(name) => void handleCreateTrip(name)}
                onRename={(id, name) => void handleRenameTrip(id, name)}
                onDelete={(id) => void handleDeleteTrip(id)}
              />
            )}
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
              demoMode={isStaticEngine}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-5 sm:px-6">
        {error && (
          <div className="animate-fade-in rounded-xl border border-[#c48878]/25 bg-[#c48878]/10 p-3.5">
            <p className="text-sm text-[#c48878]">
              <span className="font-semibold">Something went wrong:</span>{" "}
              {error}
            </p>
          </div>
        )}

        {loading === "scenario" && (
          <p
            className="text-slate-500 animate-fade-in px-1 text-xs"
            role="status"
            aria-live="polite"
          >
            Updating trip…
          </p>
        )}

        {tripEmpty && (
          <HeroIntro
            tripName={scenario.trip?.name ?? "New trip"}
            onRename={(name) => {
              if (scenario.trip) void handleRenameTrip(scenario.trip.id, name);
            }}
            onStart={() => setTravelerSignal((s) => s + 1)}
            onSample={handleLoadSample}
          />
        )}

        {!tripEmpty &&
          debtCount > 0 &&
          !hasNetted &&
          scenario.ledger.length > 0 && (
            <p className="animate-fade-in rounded-xl border border-[#c4a574]/25 bg-[#c4a574]/10 px-3.5 py-2.5 text-[13px] text-[#c4a574]">
              Trip changed after settlement. Previous payouts stay in the log —
              run Net & route again for the new balances.
            </p>
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
              <h2 className="font-display text-slate-100 text-[1.35rem] font-semibold tracking-[-0.03em]">
                Transfers
                <span className="text-slate-500 ml-2 font-sans text-xs font-normal tracking-normal">
                  {obligations.length} to settle
                </span>
              </h2>
              <SharePlanButton plan={scenario.plan} onCopied={notify} />
            </div>
            {scenario.plan?.insights && scenario.plan.insights.length > 0 && (
              <div className="mb-2.5">
                <InsightsPanel
                  insights={scenario.plan.insights}
                  onLink={(id) => void handleLinkAccount(id)}
                />
              </div>
            )}
            {(() => {
              const pendingClaims = obligations.filter(
                (o) =>
                  o.chosenRail === "claim_link" &&
                  o.claimToken &&
                  o.status !== "settled",
              );
              if (pendingClaims.length === 0) return null;
              return (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-[#c4a574]">
                  <span>
                    {pendingClaims.length} recipient
                    {pendingClaims.length === 1 ? "" : "s"} still need
                    {pendingClaims.length === 1 ? "s" : ""} to claim.
                  </span>
                  {pendingClaims.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() => setClaimModalToken(o.claimToken!)}
                    >
                      Open {entityMap.get(o.to)?.name.split(" ")[0] ?? "claim"}
                    </button>
                  ))}
                </div>
              );
            })()}
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
                    busy={loading !== null}
                    onCopyError={() =>
                      notify("Could not copy instructions", "warn")
                    }
                  />
                );
              })}
            </div>
          </section>
        )}

        {tripEmpty ? (
          tripPanel
        ) : (
          <>
            {tripPanel}
            {(debtCount > 0 || hasNetted) && graphBlock}
          </>
        )}

        {scenario.ledger.length > 0 && (
          <Collapsible
            title="Settlement log"
            sub={`${scenario.ledger.length} recorded transfer${scenario.ledger.length === 1 ? "" : "s"}`}
            defaultOpen
          >
            <SettlementLog
              ledger={scenario.ledger}
              entityName={(id) => entityMap.get(id)?.name.trim() ?? id}
            />
          </Collapsible>
        )}

        <footer className="text-slate-500 px-1 pt-1 pb-3 text-[11px]">
          Sandbox — rails are simulated; FX rates are{" "}
          {scenario.fx?.live ? "live" : "using the offline snapshot"}.
        </footer>
      </main>

      {/* Toast feedback */}
      <div
        className="pointer-events-none fixed right-5 bottom-5 z-50 flex flex-col items-end gap-2"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-fade-in-up pointer-events-auto flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--elev)] px-4 py-2.5 text-sm font-medium text-[var(--text)]"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${t.kind === "warn" ? "bg-[#c4a574]" : "bg-[var(--text)]"}`}
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
              busy={loading !== null}
              onOverride={(railName) =>
                void handleOverrideRail(ob.id, railName)
              }
              onLink={() => void handleLinkAccount(to.id)}
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
  tripName,
  onRename,
  onStart,
  onSample,
}: {
  tripName: string;
  onRename: (name: string) => void;
  onStart: () => void;
  onSample: () => void;
}) {
  const [name, setName] = useState(tripName);
  useEffect(() => setName(tripName), [tripName]);
  return (
    <section className="glass animate-fade-in-up rounded-2xl p-6 sm:p-8">
      <h1 className="text-slate-50 font-display text-[1.85rem] leading-[1.15] font-semibold sm:text-[2.15rem]">
        Start a trip
      </h1>
      <p className="text-slate-400 mt-2.5 max-w-lg text-[15px] leading-7">
        Name it, add travelers and expenses. LiteFX nets debts into the fewest
        transfers and picks a rail for each one. Past trips stay in the header.
      </p>
      <label className="mt-4 block">
        <span className="text-slate-500 text-[11px] font-medium tracking-wide uppercase">
          Trip name
        </span>
        <input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const next = name.trim();
            if (next && next !== tripName) onRename(next);
            else setName(tripName);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="text-slate-100 mt-1.5 w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
          placeholder="Tokyo 2026"
        />
      </label>
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
  const [open, setOpen] = useState(true);
  return (
    <section className="glass animate-fade-in-up overflow-hidden rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-white/[0.03] flex w-full items-center gap-3 px-4 py-3 text-left transition-colors sm:px-5"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <p className="text-slate-100 font-display text-[1.05rem] font-semibold tracking-[-0.03em]">
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
        <span className="chip shrink-0 border border-[#9aaa8c]/25 bg-[#9aaa8c]/15 text-[#9aaa8c]">
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
              <p className="font-display text-slate-50 tnum text-[1.65rem] font-semibold">
                {Math.round(saved)}
              </p>
              <p className="section-title mt-0.5">transfers saved</p>
            </div>
            <div className="bg-black/25 border-white/[0.05] rounded-xl border p-3 text-center">
              <p className="font-display tnum text-[1.65rem] font-semibold text-[#9aaa8c]">
                ${fees.toFixed(2)}
              </p>
              <p className="section-title mt-0.5">est. fees saved</p>
            </div>
            <div className="bg-black/25 border-white/[0.05] rounded-xl border p-3 text-center">
              <p className="font-display text-slate-200 tnum text-[1.65rem] font-semibold">
                ${corridor.toFixed(2)}
              </p>
              <p className="section-title mt-0.5">vs Splitwise match</p>
            </div>
            <div className="bg-black/25 border-white/[0.05] rounded-xl border p-3 text-center">
              <p className="font-display brand-text tnum text-[1.65rem] font-semibold">
                ${moved.toFixed(2)}
              </p>
              <p className="section-title mt-0.5">
                to move{" "}
                <span className="text-slate-600 tracking-normal whitespace-nowrap normal-case line-through">
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
              <div className="bg-white/[0.06] h-1.5 overflow-hidden rounded-sm">
                <div className="bg-slate-500 h-full w-full" />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-slate-500 text-xs">
                  With LiteFX · {result.netEdgeCount} payments
                </span>
                <span className="text-slate-200 font-mono text-sm font-semibold">
                  {result.netEdgeCount}
                </span>
              </div>
              <div className="bg-white/[0.06] h-1.5 overflow-hidden rounded-sm">
                <div
                  className="h-full bg-[var(--text)] transition-all duration-700"
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
                          ? `${countryFlag(ent.country)} ${ent.country}`
                          : ""}
                      </p>
                      <p
                        className={`mt-1.5 font-mono text-[13px] font-semibold ${
                          settled
                            ? "text-slate-400"
                            : isCreditor
                              ? "text-[#9aaa8c]"
                              : "text-[#c48878]"
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
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {types.map((t) => {
        const meta = RAIL_META[t];
        if (!meta) return null;
        return (
          <span
            key={t}
            className="text-slate-400 inline-flex items-center gap-1 text-[10px]"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: meta.hex }}
            />
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}
