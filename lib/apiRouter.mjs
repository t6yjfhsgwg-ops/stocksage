import { fetchYahooChart } from "./yahooChart.mjs";
import { runPredictionForSymbol, runPredictionBatch } from "./predictionService.mjs";

export function corsHeaders(req, allowedOrigins = "*") {
  const list = String(allowedOrigins).split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers?.origin || req.headers?.Origin;
  let allow = list[0] || "*";
  if (origin && (list.includes("*") || list.includes(origin))) allow = origin;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function handleApiRequest(req, res, { allowedOrigins = "*" } = {}) {
  const url = new URL(req.url, "http://127.0.0.1");
  const path = url.pathname;
  const headers = corsHeaders(req, allowedOrigins);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const send = (code, body, cache = "no-store") => {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", cache);
    res.end(JSON.stringify(body));
  };

  try {
    if (path === "/api/health" || path.startsWith("/api/health")) {
      send(200, { ok: true, service: "stocksage-api", predictionService: true, ts: new Date().toISOString() });
      return;
    }

    if (path.startsWith("/api/chart")) {
      const symbol = url.searchParams.get("symbol");
      const range = url.searchParams.get("range") || "3mo";
      const interval = url.searchParams.get("interval") || "1d";
      const json = await fetchYahooChart(symbol, { interval, range });
      send(200, json, "s-maxage=15, stale-while-revalidate=30");
      return;
    }

    if (path.startsWith("/api/predict-batch")) {
      const raw = url.searchParams.get("symbols") || "";
      const symbols = raw.split(",").map((s) => s.trim()).filter(Boolean);
      const payload = await runPredictionBatch(symbols);
      send(200, payload, "s-maxage=20, stale-while-revalidate=40");
      return;
    }

    if (path.startsWith("/api/predict")) {
      const symbol = url.searchParams.get("symbol");
      const payload = await runPredictionForSymbol(symbol);
      send(200, payload, "s-maxage=20, stale-while-revalidate=40");
      return;
    }

    send(404, { error: "Not found" });
  } catch (e) {
    send(502, { error: e.message || "API error" });
  }
}
