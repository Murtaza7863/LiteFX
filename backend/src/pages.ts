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
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,500&family=Outfit:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; font-family: Outfit, system-ui, sans-serif; }
  body { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px;
    background: #171513; color: #eee8df; }
  .card { width: 100%; max-width: 420px; border: 1px solid rgba(238,232,223,.12); border-radius: 12px;
    background: #1e1b18; padding: 28px; }
  .brand { display:flex; align-items:center; gap:8px; font-family: Fraunces, Georgia, serif; font-weight:600; letter-spacing:-0.03em; margin-bottom:18px; }
  .logo { width:28px; height:28px; border-radius:8px; background:#2a2622; }
  .fx { font-style:italic; font-weight:500; }
  h1 { font-family: Fraunces, Georgia, serif; font-size: 26px; margin: 6px 0 4px; letter-spacing:-0.03em; font-weight:600; }
  .muted { color: #8a8378; font-size: 14px; line-height: 1.6; }
  .amount { text-align:center; border:1px solid rgba(238,232,223,.12); border-radius:12px; padding:18px; margin:18px 0; }
  .amount .big { font-family: Fraunces, Georgia, serif; font-size:32px; font-weight:600; letter-spacing:-0.03em; }
  label.opt { display:flex; align-items:center; gap:10px; border:1px solid rgba(238,232,223,.12); border-radius:8px; padding:12px; margin-bottom:8px; cursor:pointer; }
  label.opt:hover { background: rgba(238,232,223,.04); }
  button { width:100%; border:0; border-radius:8px; padding:13px; font-size:15px; font-weight:600; color:#171513; cursor:pointer; background:#eee8df; }
  button:disabled { opacity:.4; cursor:not-allowed; }
  .ok { text-align:center; font-weight:600; padding:12px; }
  @media (prefers-color-scheme: light) {
    :root { color-scheme: light; }
    body { background: #f2eee6; color: #1c1917; }
    .card { border-color: rgba(28,25,23,.12); background: #faf7f1; }
    .muted { color: #6b645a; }
    .logo { background:#1c1917; }
    .amount { border-color: rgba(28,25,23,.12); }
    label.opt { border-color: rgba(28,25,23,.12); }
    label.opt:hover { background: #f2eee6; }
    button { background:#1c1917; color:#f2eee6; }
  }
</style>
</head>
<body><div class="card">${body}</div></body>
</html>`;
}

function claimPage(token: string): string {
  const body = `
    <div class="brand"><span class="logo"></span> Lite<span class="fx">FX</span></div>
    <h1>You've been paid</h1>
    <p class="muted">Someone settled a travel debt to you via LiteFX. Choose a local payout in your country — the sender is not paying on that rail.</p>
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
        const from = d.sender ? esc(d.sender.name)+' in '+esc(d.sender.country) : 'Someone';
        const where = d.recipient ? esc(d.recipient.country) : '';
        root.innerHTML =
          '<p class="muted" style="margin-bottom:12px">'+from+' sent this. Pick a '+esc(where)+' payout.</p>' +
          '<div class="amount"><div class="big">'+(ob.amount||0).toLocaleString()+' '+(ob.settlementCurrency||'')+'</div>' +
          '<div class="muted">≈ $'+(ob.amountUsd||0).toFixed(2)+' USD</div></div>' +
          (d.link.status === 'claimed' ? '<div class="ok">Already claimed ✓</div>'
           : d.link.status === 'expired' ? '<div class="ok" style="color:#c48878">This link has expired.</div>'
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
                  : '<div class="ok" style="color:#c48878">'+esc(r.message||'Failed')+'</div>';
              });
          });
        }
      }).catch(() => { root.innerHTML = '<p class="muted">Could not load link.</p>'; });
    </script>`;
  return shell("Claim payment", body);
}
