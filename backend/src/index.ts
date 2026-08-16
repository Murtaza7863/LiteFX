import express from "express";
import cors from "cors";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { apiRouter } from "./routes.js";
import { pagesRouter } from "./pages.js";
import { refreshFx } from "./fx.js";
import { initPersistentStore } from "./store.js";
import { securityHeaders } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;

function allowedOrigins(): Set<string> {
  const configured = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (process.env.RENDER_EXTERNAL_URL) {
    configured.push(process.env.RENDER_EXTERNAL_URL);
  }
  return new Set(configured);
}

export function createApp() {
  const app = express();
  const origins = allowedOrigins();
  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(
    cors({
      origin(origin, callback) {
        if (
          !origin ||
          process.env.NODE_ENV !== "production" ||
          origins.has(origin)
        ) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin not allowed."));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "200kb" }));
  app.use("/api", apiRouter);

  const dist = path.join(__dirname, "..", "..", "frontend", "dist");
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(dist, "index.html"));
    });
  } else {
    app.use(pagesRouter);
  }
  return app;
}

async function main() {
  const live = await refreshFx();
  await initPersistentStore();
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
