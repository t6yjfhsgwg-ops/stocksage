/**
 * Server-side Yahoo chart fetch (used by Vercel /api and local dev proxy).
 */

export async function fetchYahooChart(symbol, { interval = "1d", range = "3mo" } = {}) {
  if (!symbol || typeof symbol !== "string") {
    throw new Error("symbol required");
  }
  const safe = encodeURIComponent(symbol.trim());
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${safe}?interval=${interval}&range=${range}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "StockSage/1.0" },
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json = await res.json();
  if (!json?.chart?.result?.[0]) throw new Error("No chart data");
  return json;
}
