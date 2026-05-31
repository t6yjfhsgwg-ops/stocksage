/**
 * Client for StockSage real-time prediction service (/api/predict*).
 */

const USE_API = import.meta.env.VITE_USE_MARKET_API !== "false";
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function predictUrl(path, params) {
  const q = new URLSearchParams(params);
  if (API_BASE) return `${API_BASE}${path}?${q}`;
  return `${path}?${q}`;
}

export async function fetchSymbolPrediction(symbol) {
  if (!USE_API) throw new Error("Prediction API disabled");
  const res = await fetch(predictUrl("/api/predict", { symbol }));
  if (!res.ok) throw new Error(`Prediction API ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

export async function fetchBatchPredictions(symbols) {
  if (!USE_API) return { stocks: {}, updatedAt: null };
  const list = symbols.filter(Boolean).join(",");
  if (!list) return { stocks: {}, updatedAt: null };
  const res = await fetch(predictUrl("/api/predict-batch", { symbols: list }));
  if (!res.ok) throw new Error(`Prediction batch ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

export const predictionApiEnabled = USE_API;
