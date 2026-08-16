import { Router } from "express";
import { getClaimLink } from "./store.js";

// ──────────────────────────────────────────────
// Real, shareable claim-link page. Served at
// GET /claim/:token — a self-contained recipient
// page (no account needed) that claims via the API.
// This makes the claim link a genuine URL rather
// than an in-app simulation.
// ──────────────────────────────────────────────

export const pagesRouter = Router();

pagesRouter.get("/claim/:token", (req, res) => {
  const token = req.params.token;
  const link = getClaimLink(token);
  if (!link) {
    res.status(404).send(notFoundPage());
    return;
  }
  res.send(claimPage(token));
});

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function notFoundPage(): string {
  return shell(
    "Link not found",
    `<p class="muted">This claim link does not exist or was reset.</p>`,
  );
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>LiteFX — ${esc(title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; font-family: Inter, system-ui, sans-serif; }
  body { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px;
    background: #070b14 radial-gradient(ellipse 60% 40% at 30% 0%, rgba(34,211,238,.14), transparent),
                #070b14; color: #e2e8f0; }
  .card { width: 100%; max-width: 420px; border: 1px solid rgba(255,255,255,.08); border-radius: 20px;
    background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
    box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 20px 50px -20px rgba(0,0,0,.6); padding: 28px; }
  .brand { display:flex; align-items:center; gap:8px; font-weight:700; margin-bottom:18px; }
  .logo { width:28px; height:28px; border-radius:8px; background:linear-gradient(135deg,#22d3ee,#8b5cf6); }
  .grad { background:linear-gradient(90deg,#67e8f9,#a5b4fc); -webkit-background-clip:text; background-clip:text; color:transparent; }
  h1 { font-size: 22px; margin: 6px 0 4px; }
  .muted { color: #94a3b8; font-size: 14px; line-height: 1.5; }
  .amount { text-align:center; background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.05); border-radius:14px; padding:18px; margin:18px 0; }
  .amount .big { font-size:30px; font-weight:700; }
  label.opt { display:flex; align-items:center; gap:10px; border:1px solid rgba(255,255,255,.07); border-radius:12px; padding:12px; margin-bottom:8px; cursor:pointer; }
  label.opt:hover { background: rgba(255,255,255,.04); }
  button { width:100%; border:0; border-radius:12px; padding:13px; font-size:15px; font-weight:600; color:#fff; cursor:pointer;
    background: linear-gradient(90deg,#f59e0b,#f97316); box-shadow:0 8px 20px -8px rgba(245,158,11,.5); }
  button:disabled { opacity:.4; cursor:not-allowed; }
  .ok { text-align:center; color:#6ee7b7; font-weight:600; padding:12px; }
  @media (prefers-color-scheme: light) {
    :root { color-scheme: light; }
    body { background: #f3f6fb radial-gradient(ellipse 60% 40% at 30% 0%, rgba(8,145,178,.12), transparent), #f3f6fb; color: #0f172a; }
    .card { border-color: rgba(15,23,42,.1); background: #fff; box-shadow: 0 18px 40px -24px rgba(15,23,42,.25); }
    .muted { color: #64748b; }
    .amount { background: #f8fafc; border-color: rgba(15,23,42,.08); }
    label.opt { border-color: rgba(15,23,42,.1); }
    label.opt:hover { background: #f8fafc; }
  }
</style>
</head>
<body><div class="card">${body}</div></body>
</html>`;
}

function claimPage(token: string): string {
  const body = `
    <div class="brand"><span class="logo"></span> Lite<span class="grad">FX</span></div>
    <h1>You've been paid</h1>
    <p class="muted">Someone settled a travel debt to you via LiteFX. Choose how to receive it — no account needed.</p>
    <div id="root"><p class="muted">Loading…</p></div>
    <script>
      const TOKEN = ${JSON.stringify(token)};
      const root = document.getElementById('root');
      fetch('/api/claim/' + TOKEN).then(r => r.json()).then(d => {
        if (!d.link) { root.innerHTML = '<p class="muted">Link unavailable.</p>'; return; }
        const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        const ob = d.obligation || {};
        const opts = (d.payoutOptions || []).map((o,i) =>
          '<label class="opt"><input type="radio" name="p" value="'+i+'"> '+esc(o)+'</label>').join('');
        root.innerHTML =
          '<div class="amount"><div class="big">'+(ob.amount||0).toLocaleString()+' '+(ob.settlementCurrency||'')+'</div>' +
          '<div class="muted">≈ $'+(ob.amountUsd||0).toFixed(2)+' USD</div></div>' +
          (d.link.status === 'claimed' ? '<div class="ok">Already claimed ✓</div>'
           : d.link.status === 'expired' ? '<div class="ok" style="color:#fca5a5">This link has expired.</div>'
           : opts + '<button id="go" disabled>Claim payment</button>');
        const go = document.getElementById('go');
        if (go) {
          root.addEventListener('change', e => { go.disabled = false; });
          go.addEventListener('click', () => {
            const sel = root.querySelector('input[name=p]:checked');
            if (!sel) return;
            const method = d.payoutOptions[+sel.value];
            go.disabled = true; go.textContent = 'Claiming…';
            fetch('/api/claim/' + TOKEN + '/claim', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ payoutMethod: method }) })
              .then(r => r.json()).then(r => {
                root.innerHTML = r.success
                  ? '<div class="ok">Claimed! Payout via “'+esc(method)+'” is queued.</div>'
                  : '<div class="ok" style="color:#fca5a5">'+esc(r.message||'Failed')+'</div>';
              });
          });
        }
      }).catch(() => { root.innerHTML = '<p class="muted">Could not load link.</p>'; });
    </script>`;
  return shell("Claim payment", body);
}
