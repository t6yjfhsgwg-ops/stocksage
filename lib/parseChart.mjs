/** Parse Yahoo chart API JSON into StockSage stock shape. */

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
