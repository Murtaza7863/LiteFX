import type { Invoice, ReconciliationResult } from "../types";
import { toUsd } from "../types";
import {
  getStore,
  setReconciliationResults,
  setReconciliation,
} from "../store";
import type { StoreState } from "../store";

// ──────────────────────────────────────────────
// Agent 5 — B2B reconciliation agent (lower priority)
//
// Match settled NetObligation amounts against the
// Invoice list for vendor-side obligations; flag
// mismatches; show a "net settlement due this week"
// summary per vendor.
//
// MOCKED — in production this would integrate with an
// ERP / accounting system (e.g. Xero, QuickBooks, SAP)
// and use double-entry reconciliation rules.
// ──────────────────────────────────────────────

const TOLERANCE_USD = 1.0; // anything within $1 is "reconciled"

/** When the user entered their own trip (no seed invoices), bill each net creditor. */
function ensureInvoices(store: StoreState): void {
  if (store.invoices.length > 0) return;
  const byTo = new Map<string, number>();
  for (const o of store.netObligations) {
    byTo.set(o.to, (byTo.get(o.to) ?? 0) + o.amountUsd);
  }
  const invoices: Invoice[] = [];
  let i = 0;
  for (const [id, usd] of byTo) {
    const ent = store.entities.find((e) => e.id === id);
    if (!ent) continue;
    invoices.push({
      id: `inv-auto-${++i}`,
      vendorId: id,
      vendorName: ent.name.trim(),
      amount: Math.round(usd * 100) / 100,
      currency: "USD",
      bookingRef: `NET-${ent.name.trim().split(" ")[0]!.toUpperCase()}`,
      status: "open",
    });
  }
  store.invoices = invoices;
}

export function runReconciliation(): ReconciliationResult[] {
  const store = getStore();
  ensureInvoices(store);
  const results: ReconciliationResult[] = [];

  for (const inv of store.invoices) {
    const invAmountUsd = toUsd(inv.amount, inv.currency);

    // Find net obligations where this vendor is the creditor (to)
    const matched = store.netObligations.filter((ob) => ob.to === inv.vendorId);

    if (matched.length === 0) {
      results.push({
        invoice: inv,
        invoiceAmountUsd: invAmountUsd,
        status: "unmatched",
        note: "No net obligation found for this vendor.",
      });
      continue;
    }

    // Sum all settled (or routed) obligations to this vendor
    const totalSettledUsd = matched.reduce(
      (sum, ob) => sum + (ob.status === "settled" ? ob.amountUsd : 0),
      0,
    );

    const totalRoutedUsd = matched.reduce((sum, ob) => sum + ob.amountUsd, 0);

    // Match against the invoice
    const diff = Math.abs(totalRoutedUsd - invAmountUsd);

    if (diff <= TOLERANCE_USD) {
      results.push({
        invoice: inv,
        matchedObligationId: matched[0]?.id,
        matchedAmountUsd: totalRoutedUsd,
        invoiceAmountUsd: invAmountUsd,
        status: "reconciled",
        note: `Invoice matches net settlement of ${totalRoutedUsd.toFixed(2)} USD (settled: ${totalSettledUsd.toFixed(2)} USD).`,
      });
    } else {
      results.push({
        invoice: inv,
        matchedObligationId: matched[0]?.id,
        matchedAmountUsd: totalRoutedUsd,
        invoiceAmountUsd: invAmountUsd,
        status: "mismatch",
        note: `Invoice expects ${invAmountUsd.toFixed(2)} USD but net obligations total ${totalRoutedUsd.toFixed(2)} USD (Δ ${diff.toFixed(2)} USD).`,
      });
    }
  }

  setReconciliationResults(results);
  setReconciliation(true, getVendorSummary());
  return results;
}

function getVendorSummary(): {
  vendorId: string;
  vendorName: string;
  invoiceAmountUsd: number;
  settledUsd: number;
  pendingUsd: number;
}[] {
  const store = getStore();
  const summary: Record<
    string,
    {
      vendorId: string;
      vendorName: string;
      invoiceAmountUsd: number;
      settledUsd: number;
      pendingUsd: number;
    }
  > = {};

  for (const inv of store.invoices) {
    summary[inv.vendorId] = {
      vendorId: inv.vendorId,
      vendorName: inv.vendorName,
      invoiceAmountUsd: toUsd(inv.amount, inv.currency),
      settledUsd: 0,
      pendingUsd: 0,
    };
  }

  for (const ob of store.netObligations) {
    const entry = summary[ob.to];
    if (!entry) continue;
    if (ob.status === "settled") entry.settledUsd += ob.amountUsd;
    else entry.pendingUsd += ob.amountUsd;
  }

  return Object.values(summary);
}
