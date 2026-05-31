import { fetchYahooChart } from "../lib/yahooChart.mjs";

const ALLOWED = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsOrigin(req) {
  const origin = req.headers.origin || req.headers.Origin;
  if (!origin) return ALLOWED[0] === "*" ? "*" : ALLOWED[0] || "";
  if (ALLOWED.includes("*") || ALLOWED.includes(origin)) return origin;
  return ALLOWED[0] || "";
}

export default async function handler(req, res) {
  const allow = corsOrigin(req);
  if (allow) res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=30");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const symbol = req.query.symbol;
  const range = req.query.range || "3mo";
  const interval = req.query.interval || "1d";

  try {
    const json = await fetchYahooChart(symbol, { interval, range });
    res.status(200).json(json);
  } catch (e) {
    res.status(502).json({ error: e.message || "Market fetch failed" });
  }
}
