/**
 * Server-side stock analysis (mirrors StockSage.jsx client logic).
 */
import { predictSpreadStrategies } from "../src/spreadPredictions.js";
import { predictOptionContracts } from "../src/optionPredictions.js";

const SIGNAL_LABELS = [
  { min: 0.8, label: "STRONG BUY", cls: "strong-buy" },
  { min: 0.6, label: "BUY", cls: "buy" },
  { min: 0.4, label: "HOLD", cls: "hold" },
  { min: 0.2, label: "SELL", cls: "sell" },
  { min: 0, label: "STRONG SELL", cls: "strong-sell" },
];

function sma(arr, period) {
  if (arr.length < period) return [];
  const out = [];
  for (let i = period - 1; i < arr.length; i++) {
    const slice = arr.slice(i - period + 1, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return out;
}

function computeRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function computeMACD(closes) {
  const ema = (data, p) => {
    const k = 2 / (p + 1);
    let v = data[0];
    const out = [v];
    for (let i = 1; i < data.length; i++) {
      v = data[i] * k + v * (1 - k);
      out.push(v);
    }
    return out;
  };
  if (closes.length < 26) return { macd: null, signal: null, hist: null };
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const macdLine = e12.map((v, i) => v - e26[i]);
  const signal = ema(macdLine.slice(-9), 9);
  const macd = macdLine.at(-1);
  const sig = signal.at(-1);
  return { macd, signal: sig, hist: macd - sig };
}

function bollinger(closes, period = 20) {
  if (closes.length < period) return { upper: null, lower: null, mid: null };
  const slice = closes.slice(-period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((s, v) => s + (v - mid) ** 2, 0) / period);
  return { upper: mid + 2 * std, lower: mid - 2 * std, mid };
}

function linearRegression(xs, ys) {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] || 0, r2: 0 };
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxy = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sxx = xs.reduce((s, x) => s + x * x, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx) || 0;
  const intercept = (sy - slope * sx) / n;
  const yMean = sy / n;
  const ssTot = ys.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const ssRes = ys.reduce((s, y, i) => s + (y - (slope * xs[i] + intercept)) ** 2, 0);
  const r2 = ssTot ? Math.max(0, 1 - ssRes / ssTot) : 0;
  return { slope, intercept, r2 };
}

function weeklySeasonality(points) {
  const byDay = Array.from({ length: 7 }, () => []);
  for (let i = 1; i < points.length; i++) {
    const d = new Date(points[i].ts * 1000).getDay();
    const ret = (points[i].close - points[i - 1].close) / points[i - 1].close;
    byDay[d].push(ret);
  }
  return byDay.map((arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0));
}

export function predictPrices(points) {
  const closes = points.map((p) => p.close);
  if (closes.length < 10) return null;
  const last30 = closes.slice(-30);
  const xs = last30.map((_, i) => i);
  const { slope, r2 } = linearRegression(xs, last30);
  const season = weeklySeasonality(points.slice(-60));
  const dow = new Date().getDay();
  const rsi = computeRSI(closes) ?? 50;
  const rsiAdj = 1 + (50 - rsi) / 500;
  const last = closes.at(-1);
  const std = Math.sqrt(
    last30.reduce((s, v) => s + (v - last30.reduce((a, b) => a + b, 0) / last30.length) ** 2, 0) / last30.length
  );
  const band = std * 1.5;
  const proj = (days) => {
    const trend = last + slope * days * rsiAdj;
    const seas = season[(dow + days) % 7] * last * 0.5;
    return trend + seas;
  };
  return {
    tomorrow: proj(1),
    d7: proj(7),
    d30: proj(30),
    confidence: Math.round(r2 * 100),
    direction: slope >= 0 ? "up" : "down",
    bandHigh: proj(7) + band,
    bandLow: proj(7) - band,
    r2,
    model: "Weighted Trend + Momentum (R² scored)",
  };
}

export function compositeSignal(closes, volumes, price) {
  const rsi = computeRSI(closes);
  const macd = computeMACD(closes);
  const s20 = sma(closes, 20).at(-1);
  const s50 = sma(closes, 50).at(-1);
  const bb = bollinger(closes);
  const volSlice = volumes.slice(-20).filter((v) => v > 0);
  const volAvg = volSlice.length ? volSlice.reduce((a, b) => a + b, 0) / volSlice.length : 0;
  const volNow = volumes.at(-1) || 0;
  const volSpike = volNow > volAvg * 1.3;
  const scores = [];
  const rows = [];

  if (rsi != null) {
    const s = rsi < 30 ? 1 : rsi > 70 ? 0 : 0.5;
    scores.push(s);
    rows.push({ name: "RSI (14)", value: rsi.toFixed(1), signal: s >= 0.8 ? "BUY" : s <= 0.2 ? "SELL" : "NEUTRAL" });
  }
  if (macd.macd != null && macd.hist != null && Number.isFinite(macd.hist)) {
    const s = macd.hist > 0 ? 0.85 : 0.15;
    scores.push(s);
    rows.push({ name: "MACD", value: macd.hist.toFixed(3), signal: s >= 0.6 ? "BUY" : "SELL" });
  }
  if (s20 != null && s50 != null) {
    const s = s20 > s50 ? 0.9 : 0.1;
    scores.push(s);
    rows.push({ name: "20/50 SMA", value: s20 > s50 ? "Golden" : "Death", signal: s >= 0.6 ? "BUY" : "SELL" });
  }
  if (bb.upper != null) {
    const s = price <= bb.lower * 1.02 ? 0.9 : price >= bb.upper * 0.98 ? 0.1 : 0.5;
    scores.push(s);
    rows.push({ name: "Bollinger", value: price.toFixed(2), signal: s >= 0.8 ? "BUY" : s <= 0.2 ? "SELL" : "NEUTRAL" });
  }
  const chg = closes.at(-1) - closes.at(-2);
  if (volSpike) {
    const s = chg > 0 ? 0.85 : 0.15;
    scores.push(s);
    rows.push({ name: "Volume", value: "Spike", signal: s >= 0.6 ? "BUY" : "SELL" });
  } else {
    scores.push(0.5);
    rows.push({ name: "Volume", value: "Normal", signal: "NEUTRAL" });
  }

  const score = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.5;
  const label = SIGNAL_LABELS.find((l) => score >= l.min) || SIGNAL_LABELS[SIGNAL_LABELS.length - 1];
  return { score, label: label.label, cls: label.cls, rows, rsi, macd };
}

export function analyzeStockData(data) {
  const closes = data.points.map((p) => p.close);
  const volumes = data.points.map((p) => p.volume || 0);
  const change = data.prevClose ? ((data.price - data.prevClose) / data.prevClose) * 100 : 0;
  const signal = compositeSignal(closes, volumes, data.price);
  const prediction = predictPrices(data.points);
  const spreadPredictions = predictSpreadStrategies({
    symbol: data.symbol,
    price: data.price,
    prediction,
    signal,
    points: data.points,
  });
  const optionPredictions = predictOptionContracts({
    symbol: data.symbol,
    price: data.price,
    prediction,
    signal,
    points: data.points,
  });
  return {
    symbol: data.symbol,
    name: data.name,
    currency: data.currency,
    price: data.price,
    prevClose: data.prevClose,
    change,
    points: data.points,
    signal,
    prediction,
    spreadPredictions,
    optionPredictions,
  };
}
