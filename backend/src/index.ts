import express from "express";
import cors from "cors";
import { apiRouter } from "./routes.js";
import { pagesRouter } from "./pages.js";
import { refreshFx } from "./fx.js";
import { initStore } from "./store.js";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use("/api", apiRouter);
app.use(pagesRouter); // real shareable pages (e.g. /claim/:token)

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
