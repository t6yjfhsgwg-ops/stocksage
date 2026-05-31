import { runPredictionBatch } from "../lib/predictionService.mjs";

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

/** GET /api/predict-batch?symbols=AAPL,TSLA,MSFT — watchlist prediction refresh */
export default async function handler(req, res) {
  const allow = corsOrigin(req);
  if (allow) res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const raw = req.query.symbols || "";
  const symbols = String(raw).split(",").map((s) => s.trim()).filter(Boolean);

  try {
    const payload = await runPredictionBatch(symbols, { max: 12 });
    res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=40");
    res.status(200).json(payload);
  } catch (e) {
    res.status(502).json({ error: e.message || "Batch prediction failed" });
  }
}
