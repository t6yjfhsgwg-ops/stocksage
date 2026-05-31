/**
 * Market data fetch — production uses same-origin /api/chart (Vercel).
 * Dev fallback: public CORS proxy if API unavailable.
 */

const USE_API = import.meta.env.VITE_USE_MARKET_API !== "false";
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function yahooDirectUrl(symbol, interval, range) {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
}

function corsProxyUrl(symbol, interval, range) {
  return `https://corsproxy.io/?${encodeURIComponent(yahooDirectUrl(symbol, interval, range))}`;
}

function apiUrl(symbol, interval, range) {
  const q = new URLSearchParams({ symbol, interval, range });
  if (API_BASE) return `${API_BASE}/api/chart?${q}`;
  return `/api/chart?${q}`;
}

export async function fetchMarketChart(symbol, interval = "1d", range = "3mo") {
  const urls = USE_API
    ? [apiUrl(symbol, interval, range), corsProxyUrl(symbol, interval, range)]
    : [corsProxyUrl(symbol, interval, range)];

  let lastErr;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json?.error) throw new Error(json.error);
      if (!json?.chart?.result?.[0]) throw new Error("No chart data");
      return json;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Market fetch failed");
}

export function parseChartResponse(json, symbol) {
  const r = json.chart.result[0];
  const q = r.indicators?.quote?.[0];
  const ts = r.timestamp || [];
  const closes = q?.close || [];
  const opens = q?.open || [];
  const highs = q?.high || [];
  const lows = q?.low || [];
  const volumes = q?.volume || [];
  const points = ts
    .map((t, i) => ({
      date: new Date(t * 1000).toISOString().slice(0, 10),
      ts: t,
      close: closes[i],
      open: opens[i],
      high: highs[i],
      low: lows[i],
      volume: volumes[i],
    }))
    .filter((p) => p.close != null);
  const meta = r.meta || {};
  return {
    symbol,
    name: meta.longName || meta.shortName || symbol,
    currency: meta.currency || "USD",
    price: meta.regularMarketPrice ?? points.at(-1)?.close,
    prevClose: meta.chartPreviousClose ?? meta.previousClose,
    points,
  };
}
