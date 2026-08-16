import express from "express";
import cors from "cors";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { apiRouter } from "./routes.js";
import { pagesRouter } from "./pages.js";
import { refreshFx } from "./fx.js";
import { initStore } from "./store.js";
import { securityHeaders } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "200kb" }));
  app.use("/api", apiRouter);
  app.use(pagesRouter);

  const dist = path.join(__dirname, "..", "..", "frontend", "dist");
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/claim"))
        return next();
      res.sendFile(path.join(dist, "index.html"));
    });
  }
  return app;
}

async function main() {
  const live = await refreshFx();
  initStore();
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`✅ LiteFX backend running at http://localhost:${PORT}`);
    console.log(
      `   API endpoints under /api/*  ·  claim pages at /claim/:token`,
    );
    console.log(
      `   FX rates: ${live ? "live (frankfurter.app)" : "static fallback"}`,
    );
  });
}

main();
