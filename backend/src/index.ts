import express from "express";
import cors from "cors";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { apiRouter } from "./routes.js";
import { pagesRouter } from "./pages.js";
import { refreshFx } from "./fx.js";
import { initStore } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());
app.use("/api", apiRouter);
app.use(pagesRouter); // real shareable pages (e.g. /claim/:token)

// Serve the built frontend (single-service deploy). In dev the Vite server
// proxies /api, so this only matters when frontend/dist exists (production).
const dist = path.join(__dirname, "..", "..", "frontend", "dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}

async function main() {
  // Pull live FX rates (free, no key) before seeding, with static fallback.
  const live = await refreshFx();
  initStore(); // load persisted state (or seed) so data survives restarts

  app.listen(PORT, () => {
    console.log(`✅ LiteFX backend running at http://localhost:${PORT}`);
    console.log(`   API endpoints under /api/*  ·  claim pages at /claim/:token`);
    console.log(`   FX rates: ${live ? "live (frankfurter.app)" : "static fallback"}`);
  });
}

main();
