/**
 * Real-time prediction service — fetches Yahoo data and runs full analysis server-side.
 */
import { fetchYahooChart } from "./yahooChart.mjs";
import { parseChartResponse } from "./parseChart.mjs";
import { analyzeStockData } from "./stockAnalysis.mjs";

const SERVICE = "stocksage-prediction-service";
const VERSION = "1.0";

export async function runPredictionForSymbol(symbol) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) throw new Error("symbol required");

  const [analysisJson, liveJson] = await Promise.all([
    fetchYahooChart(sym, { interval: "1d", range: "3mo" }),
    fetchYahooChart(sym, { interval: "1m", range: "1d" }),
  ]);

  const data = parseChartResponse(analysisJson, sym);
  const live = parseChartResponse(liveJson, sym);
  if (live.price != null) {
    data.price = live.price;
    data.change = live.prevClose
      ? ((live.price - live.prevClose) / live.prevClose) * 100
      : data.change;
  }

  const analyzed = analyzeStockData(data);
  return {
    service: SERVICE,
    version: VERSION,
    updatedAt: new Date().toISOString(),
    symbol: sym,
    stock: analyzed,
  };
}

export async function runPredictionBatch(symbols, { max = 12 } = {}) {
  const list = [...new Set(symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean))].slice(0, max);
  const results = await Promise.allSettled(list.map((s) => runPredictionForSymbol(s)));
  const stocks = {};
  const errors = {};
  list.forEach((sym, i) => {
    const r = results[i];
    if (r.status === "fulfilled") stocks[sym] = r.value.stock;
    else errors[sym] = r.reason?.message || "failed";
  });
  return {
    service: SERVICE,
    version: VERSION,
    updatedAt: new Date().toISOString(),
    symbols: list,
    stocks,
    errors,
  };
}
