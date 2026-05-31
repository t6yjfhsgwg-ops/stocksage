import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fetchYahooChart } from "./lib/yahooChart.mjs";

/** Local dev: same /api/chart routes as Vercel production */
function marketApiPlugin() {
  return {
    name: "stocksage-market-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        if (req.url.startsWith("/api/health")) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, service: "stocksage-api", dev: true }));
          return;
        }
        if (!req.url.startsWith("/api/chart")) return next();
        try {
          const url = new URL(req.url, "http://127.0.0.1");
          const symbol = url.searchParams.get("symbol");
          const range = url.searchParams.get("range") || "3mo";
          const interval = url.searchParams.get("interval") || "1d";
          const json = await fetchYahooChart(symbol, { interval, range });
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "s-maxage=15");
          res.end(JSON.stringify(json));
        } catch (e) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: e.message || "fetch failed" }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), marketApiPlugin()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ["recharts"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-is", "recharts"],
  },
});
