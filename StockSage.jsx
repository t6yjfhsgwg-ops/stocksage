import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, ComposedChart, CartesianGrid,
} from "recharts";
import HelpTour, { shouldShowHelpOnFirstVisit, markHelpSeen } from "./src/HelpTour.jsx";
import PricingModal from "./src/PricingModal.jsx";
import {
  getStoredPlan,
  getPlanConfig,
  isPlus,
  canSendChat,
  incrementChatUsage,
  chatRemaining,
  getTrialDaysLeft,
} from "./src/plans.js";
import { predictSpreadStrategies } from "./src/spreadPredictions.js";
import { predictOptionContracts } from "./src/optionPredictions.js";
import { fetchMarketChart, parseChartResponse } from "./src/marketFetch.js";
import { fetchBatchPredictions, predictionApiEnabled } from "./src/predictionClient.js";

// ─── Constants ───────────────────────────────────────────────────────────────
const DEFAULT_WATCHLIST = ["AAPL", "TSLA", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "SPY"];
const INDICES = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "NASDAQ" },
  { symbol: "^DJI", label: "DOW" },
  { symbol: "^VIX", label: "VIX" },
  { symbol: "BTC-USD", label: "BTC" },
];
const RANGE_MAP = { "1W": "5d", "1M": "1mo", "3M": "3mo", "6M": "6mo", "1Y": "1y" };
const SIGNAL_LABELS = [
  { min: 0.8, label: "STRONG BUY", cls: "strong-buy" },
  { min: 0.6, label: "BUY", cls: "buy" },
  { min: 0.4, label: "HOLD", cls: "hold" },
  { min: 0.2, label: "SELL", cls: "sell" },
  { min: 0, label: "STRONG SELL", cls: "strong-sell" },
];
const CHAT_CHIPS = [
  "📊 Analyze my watchlist",
  "🎯 Best stock to buy today?",
  "📐 Best call or put?",
  "📐 Best options spread?",
  "⚠️ Any red flags?",
  "📈 Market outlook?",
];
const SYSTEM_PROMPT = `You are StockSage, an expert AI financial analyst assistant built into a stock monitoring dashboard. You have deep knowledge of technical analysis, fundamental analysis, market trends, and trading strategies.

When users ask about stocks, provide:
- Concise, actionable insights
- Reference technical indicators (RSI, MACD, moving averages, etc.) when relevant
- Always add a disclaimer that this is not financial advice
- Use bullet points and clear formatting
- Keep responses under 200 words unless asked for detail

Current watchlist context will be provided in each message. Use it to give contextual answers.`;

// ─── Market data (production: /api/chart on Vercel; dev: Vite middleware) ───
async function yahooFetch(symbol, range = "3mo") {
  const json = await fetchMarketChart(symbol, "1d", range);
  return parseChartResponse(json, symbol);
}

/** Lightweight 1m chart fetch for live quote updates. */
async function yahooLiveQuote(symbol) {
  const json = await fetchMarketChart(symbol, "1m", "1d");
  const data = parseChartResponse(json, symbol);
  const change = data.prevClose ? ((data.price - data.prevClose) / data.prevClose) * 100 : 0;
  return { symbol, price: data.price, prevClose: data.prevClose, change, at: Date.now() };
}

// ─── Math / indicators ───────────────────────────────────────────────────────
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
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
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

function expSmooth(arr, alpha = 0.3) {
  let s = arr[0];
  const out = [s];
  for (let i = 1; i < arr.length; i++) {
    s = alpha * arr[i] + (1 - alpha) * s;
    out.push(s);
  }
  return out;
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

function predictPrices(points) {
  const closes = points.map((p) => p.close);
  if (closes.length < 10) return null;
  const last30 = closes.slice(-30);
  const xs = last30.map((_, i) => i);
  const { slope, intercept, r2 } = linearRegression(xs, last30);
  const smoothed = expSmooth(last30, 0.3);
  const season = weeklySeasonality(points.slice(-60));
  const dow = new Date().getDay();
  const rsi = computeRSI(closes) ?? 50;
  const rsiAdj = 1 + (50 - rsi) / 500;
  const last = closes.at(-1);
  const std = Math.sqrt(last30.reduce((s, v) => s + (v - last30.reduce((a, b) => a + b, 0) / last30.length) ** 2, 0) / last30.length);
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

function compositeSignal(closes, volumes, price) {
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

function analyzeStock(data) {
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
  return { ...data, change, signal, prediction, spreadPredictions, optionPredictions };
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const css = `
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Syne:wght@500;600;700;800&display=swap');
:root {
  --bg: #050A14; --panel: #0A1628; --panel2: #0D1E36; --border: #1a2d4a;
  --green: #00FF88; --amber: #FFB347; --red: #FF4757; --buy: #2ED573;
  --text: #e8f0ff; --muted: #6b8299; --mono: 'Fira Code', monospace; --ui: 'Syne', sans-serif;
}
.stocksage { font-family: var(--ui); background: var(--bg); color: var(--text); height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
.disclaimer { background: #0d1a2e; border-bottom: 1px solid var(--border); padding: 6px 16px; font-size: 0.72rem; color: var(--muted); text-align: center; }
.market-strip { display: flex; gap: 20px; padding: 10px 20px; background: var(--panel); border-bottom: 1px solid var(--border); overflow-x: auto; font-family: var(--mono); font-size: 0.78rem; }
.market-item { display: flex; gap: 8px; align-items: center; white-space: nowrap; }
.market-item .lbl { color: var(--muted); }
.up { color: var(--green); } .down { color: var(--red); }
.layout { flex: 1; display: grid; grid-template-columns: 240px 1fr 320px; min-height: 0; }
.sidebar { background: var(--panel); border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.sidebar-h { padding: 14px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
.sidebar-h h2 { font-size: 0.85rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.live-dot { width: 8px; height: 8px; background: var(--green); border-radius: 50%; animation: pulse 1.5s infinite; }
.live-dot.streaming { background: #00d4ff; box-shadow: 0 0 8px #00d4ff; }
.live-ts { font-family: var(--mono); font-size: 0.68rem; color: var(--muted); }
.btn-live {
  background: transparent; border: 1px solid #00d4ff; color: #00d4ff;
  padding: 6px 12px; border-radius: 6px; font-size: 0.78rem; cursor: pointer; font-family: var(--ui);
}
.btn-live.on { background: rgba(0, 212, 255, 0.15); font-weight: 700; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
.watchlist { flex: 1; overflow-y: auto; }
.wl-row { padding: 10px 14px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.15s; }
.wl-row:hover, .wl-row.active { background: var(--panel2); }
.wl-row .tk { font-family: var(--mono); font-weight: 600; font-size: 0.9rem; }
.wl-row .pr { font-family: var(--mono); font-size: 0.82rem; }
.wl-row .sig { font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; margin-top: 4px; display: inline-block; }
.sig.strong-buy,.sig.buy { background: rgba(46,213,115,0.2); color: var(--buy); }
.sig.hold { background: rgba(255,179,71,0.2); color: var(--amber); }
.sig.sell,.sig.strong-sell { background: rgba(255,71,87,0.2); color: var(--red); }
.add-ticker { padding: 12px; border-top: 1px solid var(--border); display: flex; gap: 6px; }
.add-ticker input { flex: 1; background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 8px; font-family: var(--mono); font-size: 0.8rem; border-radius: 4px; }
.main { overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.daily-pick { background: linear-gradient(135deg, #0d2040 0%, #0a1628 50%, #051020 100%); border: 1px solid var(--green); border-radius: 8px; padding: 16px 20px; position: relative; overflow: hidden; animation: borderGlow 3s ease-in-out infinite; }
@keyframes borderGlow { 0%,100%{box-shadow:0 0 12px rgba(0,255,136,0.15)} 50%{box-shadow:0 0 24px rgba(0,255,136,0.35)} }
.daily-pick h3 { color: var(--green); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 8px; }
.daily-pick .big { font-family: var(--mono); font-size: 1.8rem; font-weight: 600; }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
.panel h3 { font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; }
.tf-tabs { display: flex; gap: 6px; margin-bottom: 12px; }
.tf-tabs button { background: var(--bg); border: 1px solid var(--border); color: var(--muted); padding: 6px 12px; font-family: var(--mono); font-size: 0.75rem; cursor: pointer; border-radius: 4px; }
.tf-tabs button.active { border-color: var(--green); color: var(--green); }
.signal-badge { font-family: var(--mono); font-size: 1.1rem; font-weight: 700; padding: 10px 20px; border-radius: 6px; display: inline-block; margin-bottom: 12px; }
.signal-badge.strong-buy { background: rgba(0,255,136,0.25); color: var(--green); }
.signal-badge.buy { background: rgba(46,213,115,0.2); color: var(--buy); }
.signal-badge.hold { background: rgba(255,179,71,0.2); color: var(--amber); }
.signal-badge.sell { background: rgba(255,71,87,0.15); color: var(--red); }
.signal-badge.strong-sell { background: rgba(255,71,87,0.3); color: var(--red); }
.ind-table { width: 100%; font-family: var(--mono); font-size: 0.78rem; border-collapse: collapse; }
.ind-table th, .ind-table td { padding: 8px; text-align: left; border-bottom: 1px solid var(--border); }
.ind-table td.sig-buy { color: var(--buy); }
.ind-table td.sig-sell { color: var(--red); }
.ind-table td.sig-neutral { color: var(--amber); }
.pred-box.pred-locked { position: relative; opacity: 0.55; }
.pred-box.pred-locked .val { filter: blur(4px); user-select: none; }
.pred-lock-tag {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; color: var(--green); font-weight: 700; letter-spacing: 0.05em;
}
.pred-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-family: var(--mono); }
.pred-box { background: var(--bg); padding: 12px; border-radius: 6px; border: 1px solid var(--border); }
.pred-box .lbl { font-size: 0.7rem; color: var(--muted); }
.pred-box .val { font-size: 1.1rem; margin-top: 4px; }
.spread-panel { margin-top: 0; }
.spread-meta { font-family: var(--mono); font-size: 0.78rem; color: var(--muted); margin-bottom: 14px; }
.spread-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.spread-card {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 14px;
  font-size: 0.82rem;
}
.spread-card.best { border-color: var(--green); box-shadow: 0 0 16px rgba(0, 255, 136, 0.12); }
.spread-card h4 { font-size: 0.9rem; margin-bottom: 6px; display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.spread-verdict { font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; font-family: var(--mono); }
.spread-verdict.favorable { background: rgba(0,255,136,0.2); color: var(--green); }
.spread-verdict.neutral { background: rgba(255,179,71,0.2); color: var(--amber); }
.spread-verdict.unfavorable { background: rgba(255,71,87,0.2); color: var(--red); }
.spread-legs { font-family: var(--mono); color: var(--green); font-size: 0.8rem; margin: 8px 0; }
.spread-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-family: var(--mono); font-size: 0.72rem; margin-top: 10px; }
.spread-stats span { color: var(--muted); }
.spread-note { margin-top: 10px; font-size: 0.75rem; color: var(--muted); line-height: 1.45; }
.spread-pnl.up { color: var(--green); }
.spread-pnl.down { color: var(--red); }
.option-table { width: 100%; border-collapse: collapse; font-family: var(--mono); font-size: 0.75rem; margin-top: 8px; }
.option-table th, .option-table td { padding: 8px 6px; text-align: left; border-bottom: 1px solid var(--border); }
.option-table th { color: var(--muted); font-weight: 500; font-size: 0.68rem; text-transform: uppercase; }
.option-table tr.best-row { background: rgba(0, 255, 136, 0.06); }
.option-table .type-call { color: var(--green); }
.option-table .type-put { color: var(--amber); }
.option-combo-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
.option-combo {
  flex: 1; min-width: 200px; background: var(--bg); border: 1px solid var(--border);
  border-radius: 8px; padding: 12px; font-size: 0.8rem;
}
.option-tabs { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.option-tabs button {
  background: var(--bg); border: 1px solid var(--border); color: var(--muted);
  padding: 6px 12px; border-radius: 6px; cursor: pointer; font-family: var(--ui); font-size: 0.78rem;
}
.option-tabs button.active { border-color: var(--green); color: var(--green); }
.chat { background: var(--panel); border-left: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; }
.chat-h { padding: 14px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
.chat-msgs { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.msg { max-width: 92%; padding: 10px 12px; border-radius: 8px; font-size: 0.85rem; line-height: 1.5; white-space: pre-wrap; }
.msg.user { align-self: flex-end; background: #1a3a5c; }
.msg.ai { align-self: flex-start; background: var(--panel2); border: 1px solid var(--border); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px; }
.chip { background: var(--bg); border: 1px solid var(--border); color: var(--muted); padding: 6px 10px; font-size: 0.72rem; border-radius: 999px; cursor: pointer; }
.chip:hover { border-color: var(--green); color: var(--green); }
.chat-in { padding: 12px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
.chat-in textarea { background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 10px; font-family: var(--ui); font-size: 0.85rem; border-radius: 6px; resize: none; min-height: 60px; }
.chat-in button { background: var(--green); color: #050A14; border: none; padding: 10px; font-weight: 700; font-family: var(--ui); cursor: pointer; border-radius: 6px; }
.settings-btn { background: none; border: 1px solid var(--border); color: var(--muted); padding: 6px 10px; cursor: pointer; border-radius: 4px; font-size: 0.75rem; }
.loading-screen { position: fixed; inset: 0; background: var(--bg); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 1000; }
.loading-screen .logo { font-family: var(--mono); font-size: 2rem; color: var(--green); animation: pulse 1s infinite; }
.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--panel2); border: 1px solid var(--green); padding: 12px 24px; border-radius: 8px; font-size: 0.85rem; z-index: 999; animation: fadeIn 0.3s; }
@keyframes fadeIn { from{opacity:0;transform:translate(-50%,10px)} to{opacity:1;transform:translate(-50%,0)} }
.chat-fab { position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px; border-radius: 50%; background: var(--green); color: #050A14; border: none; font-size: 1.4rem; font-weight: 800; cursor: pointer; z-index: 100; display: none; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 1100px) { .layout { grid-template-columns: 200px 1fr; } .chat { display: none; } .chat-fab { display: block; } .chat.open-mobile { display: flex; position: fixed; right: 0; top: 0; bottom: 0; width: 320px; z-index: 200; } }
.skeleton { background: linear-gradient(90deg, var(--panel2) 25%, var(--border) 50%, var(--panel2) 75%); background-size: 200% 100%; animation: shimmer 1.2s infinite; height: 20px; border-radius: 4px; }
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
.light { --bg: #f0f4f8; --panel: #fff; --panel2: #e8eef4; --border: #c5d0dc; --text: #0a1628; --muted: #5a6a7a; }
.plan-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 8px 16px; background: linear-gradient(90deg, #0d2040, #0a1628);
  border-bottom: 1px solid var(--border); font-size: 0.8rem; flex-wrap: wrap;
}
.plan-badge {
  font-family: var(--mono); font-size: 0.72rem; padding: 4px 10px; border-radius: 999px;
  border: 1px solid var(--border); color: var(--muted);
}
.plan-badge.plus { border-color: var(--green); color: var(--green); }
.btn-upgrade {
  background: var(--green); color: #050a14; border: none; padding: 6px 14px;
  border-radius: 6px; font-weight: 700; font-size: 0.78rem; cursor: pointer; font-family: var(--ui);
}
.btn-join-free {
  background: transparent; color: var(--green); border: 1px solid var(--green);
  padding: 6px 14px; border-radius: 6px; font-size: 0.78rem; cursor: pointer; font-family: var(--ui);
}
.wl-row.locked { opacity: 0.45; pointer-events: none; }
.wl-row.locked::after { content: "🔒 Plus"; font-size: 0.65rem; color: var(--amber); display: block; margin-top: 4px; }
.chat-quota { font-size: 0.72rem; color: var(--muted); padding: 0 12px 8px; }
`;

// ─── Local AI fallback (no API key) ──────────────────────────────────────────
function localChatReply(userMsg, context) {
  const lower = userMsg.toLowerCase();
  if (lower.includes("watchlist") || lower.includes("analyze")) {
    const top = [...context.stocks].sort((a, b) => b.signal.score - a.signal.score)[0];
    return `**Watchlist scan** (${context.stocks.length} stocks)\n\n• Top signal: **${top?.symbol}** — ${top?.signal?.label} (score ${(top?.signal?.score * 100).toFixed(0)}%)\n• Weakest: ${[...context.stocks].sort((a, b) => a.signal.score - b.signal.score)[0]?.symbol}\n\n_Not financial advice._`;
  }
  if (lower.includes("buy") || lower.includes("best")) {
    const picks = context.stocks.filter((s) => s.signal.score >= 0.6).map((s) => s.symbol).join(", ") || "None strong";
    return `**Buy candidates today:** ${picks}\n\nBased on composite RSI, MACD, SMA, Bollinger & volume signals.\n\n_Not financial advice._`;
  }
  const sym = context.stocks.find((s) => lower.includes(s.symbol.toLowerCase()));
  if (sym) {
    const best = sym.spreadPredictions?.bestPick;
    const opt = sym.optionPredictions?.bestPick;
    const spreadLine = best
      ? `\n• Top spread: **${best.name}** (${best.verdict}, est P/L @7d ${best.pnlAt7d >= 0 ? "+" : ""}$${best.pnlAt7d?.toFixed(2)})`
      : "";
    const optLine = opt
      ? `\n• Top option: **${opt.contract}** (${opt.verdict}, prem ~$${opt.estPremium?.toFixed(2)}, est mark P/L 7d ${opt.pnlMark7d >= 0 ? "+" : ""}$${opt.pnlMark7d?.toFixed(2)})`
      : "";
    return `**${sym.symbol}** @ $${sym.price?.toFixed(2)}\n• Signal: ${sym.signal.label}\n• RSI area: ${sym.signal.rsi?.toFixed(1) ?? "—"}\n• 7d forecast: $${sym.prediction?.d7?.toFixed(2) ?? "—"} (${sym.prediction?.direction === "up" ? "▲" : "▼"})${optLine}${spreadLine}\n\n_Not financial advice._`;
  }
  if (lower.includes("spread") || lower.includes("option")) {
    const top = [...context.stocks]
      .filter((s) => s.spreadPredictions?.bestPick)
      .sort((a, b) => b.spreadPredictions.bestPick.fitScore - a.spreadPredictions.bestPick.fitScore)[0];
    if (top) {
      const o = top.optionPredictions?.bestPick;
      const b = top.spreadPredictions?.bestPick;
      const lines = [`**Options outlook for ${top.symbol}** (7d → $${top.prediction?.d7?.toFixed(2)})`];
      if (o) {
        lines.push(`• Best single leg: **${o.contract}** ${o.type} ${o.moneyness} — prem ~$${o.estPremium?.toFixed(2)}, Δ≈${o.delta}, BE $${o.breakeven?.toFixed(2)} (${o.moveNeededPct >= 0 ? "+" : ""}${o.moveNeededPct?.toFixed(1)}%)`);
        lines.push(`• Est. mark P/L @7d: ${o.pnlMark7d >= 0 ? "+" : ""}$${o.pnlMark7d?.toFixed(2)} — ${o.verdict}`);
      }
      if (top.optionPredictions?.bestCall) {
        const c = top.optionPredictions.bestCall;
        lines.push(`• Best call: ${c.contract} (~$${c.estPremium?.toFixed(2)})`);
      }
      if (top.optionPredictions?.bestPut) {
        const p = top.optionPredictions.bestPut;
        lines.push(`• Best put: ${p.contract} (~$${p.estPremium?.toFixed(2)})`);
      }
      if (b) {
        lines.push(`• Best spread: **${b.name}** (${b.legs}) — ${b.verdict}`);
      }
      lines.push("\n_Not financial advice. Modeled premiums, not live chain._");
      return lines.join("\n");
    }
  }
  return `I can analyze your watchlist (${context.stocks.map((s) => s.symbol).join(", ")}). Ask about a specific ticker or tap a quick question chip.\n\n_Not financial advice._`;
}

async function callClaude(apiKey, messages, contextBlock) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `${contextBlock}\n\nUser: ${messages.at(-1).content}` }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text || "No response.";
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function StockSage() {
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);
  const [stocks, setStocks] = useState({});
  const [indices, setIndices] = useState({});
  const [active, setActive] = useState("AAPL");
  const [timeframe, setTimeframe] = useState("3M");
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dailyPick, setDailyPick] = useState(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [planId, setPlanId] = useState(() => getStoredPlan());
  const plan = useMemo(() => getPlanConfig(planId), [planId]);
  const plus = isPlus(planId);
  const [theme, setTheme] = useState("dark");
  const [refreshMin, setRefreshMin] = useState(5);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("stocksage_api_key") || "");
  const [portfolio, setPortfolio] = useState(() => {
    try { return JSON.parse(localStorage.getItem("stocksage_portfolio") || "{}"); } catch { return {}; }
  });
  const [newTicker, setNewTicker] = useState("");
  const [optionTab, setOptionTab] = useState("singles");
  const [liveMode, setLiveMode] = useState(() => localStorage.getItem("stocksage_live") === "1");
  const [liveSec, setLiveSec] = useState(() => Number(localStorage.getItem("stocksage_live_sec") || 30));
  const [lastLiveAt, setLastLiveAt] = useState(null);
  const [lastPredAt, setLastPredAt] = useState(null);
  const liveBusyRef = useRef(false);
  const predBusyRef = useRef(false);
  const tickRef = useRef({});

  const stockList = useMemo(
    () => watchlist.map((s) => stocks[s]).filter(Boolean),
    [watchlist, stocks]
  );

  const buildContext = useCallback(() => {
    const lines = stockList.map(
      (s) => `${s.symbol}: $${s.price?.toFixed(2)} (${s.change?.toFixed(2)}%) — ${s.signal?.label}`
    );
    return `Watchlist context:\n${lines.join("\n")}`;
  }, [stockList]);

  const loadStock = useCallback(async (symbol, range = "3mo") => {
    const data = await yahooFetch(symbol, range);
    return analyzeStock(data);
  }, []);

  /** Chart uses selected timeframe; signals/predictions always use 3mo history. */
  const loadActiveViews = useCallback(async (symbol, tf) => {
    const chartRange = RANGE_MAP[tf] || "3mo";
    const chartRaw = await yahooFetch(symbol, chartRange);
    const analysisRaw = chartRange === "3mo" ? chartRaw : await yahooFetch(symbol, "3mo");
    const analyzed = analyzeStock(analysisRaw);
    const merged = {
      ...analyzed,
      price: chartRaw.price ?? analyzed.price,
      change: chartRaw.prevClose
        ? ((chartRaw.price - chartRaw.prevClose) / chartRaw.prevClose) * 100
        : analyzed.change,
    };
    const closes = chartRaw.points.map((p) => p.close);
    const s20 = sma(closes, 20);
    const s50 = sma(closes, 50);
    const chart = chartRaw.points.map((p, i) => ({
      ...p,
      sma20: i >= 19 ? s20[i - 19] : null,
      sma50: i >= 49 ? s50[i - 49] : null,
    }));
    return { stock: merged, chart };
  }, []);

  const refreshAll = useCallback(async () => {
    setError(null);
    try {
      const results = await Promise.allSettled([
        ...watchlist.map((s) => loadStock(s)),
        ...INDICES.map((i) => yahooFetch(i.symbol, "5d").then((d) => ({ ...i, ...d, change: d.prevClose ? ((d.price - d.prevClose) / d.prevClose) * 100 : 0 }))),
      ]);
      const next = { ...stocks };
      watchlist.forEach((sym, i) => {
        const r = results[i];
        if (r.status === "fulfilled") next[sym] = r.value;
      });
      setStocks(next);
      const idx = {};
      INDICES.forEach((ind, j) => {
        const r = results[watchlist.length + j];
        if (r.status === "fulfilled") idx[ind.symbol] = r.value;
      });
      setIndices(idx);
      const analyzed = Object.values(next).filter(Boolean);
      if (analyzed.length) {
        const best = [...analyzed].sort((a, b) => b.signal.score - a.signal.score)[0];
        const reasons = best.signal.rows
          .filter((r) => r.signal === "BUY")
          .slice(0, 3)
          .map((r) => `${r.name}: ${r.value} (${r.signal})`);
        if (reasons.length < 3) reasons.push(`Composite score ${(best.signal.score * 100).toFixed(0)}%`, `RSI ${best.signal.rsi?.toFixed(1) ?? "—"}`, `Price $${best.price?.toFixed(2)}`);
        setDailyPick({ ...best, reasons, ts: new Date().toLocaleString() });
      }
      tickRef.current = {};
    } catch (e) {
      setError(e.message);
    }
  }, [watchlist, loadStock]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refreshAll();
      setLoading(false);
      setToast("Market data loaded — " + watchlist.length + " stocks analyzed");
      setTimeout(() => setToast(null), 4000);
      if (shouldShowHelpOnFirstVisit()) setHelpOpen(true);
    })();
  }, []);

  const closeHelp = () => {
    setHelpOpen(false);
    markHelpSeen();
  };

  const onHelpStep = useCallback((stepId) => {
    if (stepId === "chat") setChatOpen(true);
  }, []);

  useEffect(() => {
    if (!active) return;
    (async () => {
      try {
        const { stock, chart } = await loadActiveViews(active, timeframe);
        setStocks((prev) => ({ ...prev, [active]: stock }));
        setChartData(chart);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [active, timeframe, loadActiveViews]);

  useEffect(() => {
    if (!plus && refreshMin === 1) setRefreshMin(5);
  }, [plus, refreshMin]);

  useEffect(() => {
    if (refreshMin === 0) return;
    const id = setInterval(refreshAll, refreshMin * 60 * 1000);
    return () => clearInterval(id);
  }, [refreshMin, refreshAll]);

  const refreshLiveQuotes = useCallback(async () => {
    if (liveBusyRef.current) return;
    liveBusyRef.current = true;
    try {
      const indexSymbols = INDICES.map((i) => i.symbol);
      const results = await Promise.allSettled([
        ...watchlist.map((s) => yahooLiveQuote(s)),
        ...indexSymbols.map((s) => yahooLiveQuote(s)),
      ]);
      setStocks((prev) => {
        const next = { ...prev };
        watchlist.forEach((sym, i) => {
          const r = results[i];
          if (r.status === "fulfilled" && next[sym]) {
            next[sym] = { ...next[sym], price: r.value.price, change: r.value.change };
          }
        });
        return next;
      });
      setIndices((prev) => {
        const next = { ...prev };
        indexSymbols.forEach((sym, j) => {
          const r = results[watchlist.length + j];
          if (r.status === "fulfilled") {
            const ind = INDICES.find((x) => x.symbol === sym);
            next[sym] = { ...ind, ...prev[sym], price: r.value.price, change: r.value.change };
          }
        });
        return next;
      });
      setLastLiveAt(new Date());
    } catch (e) {
      console.warn("Live quote refresh:", e);
    }
    liveBusyRef.current = false;
  }, [watchlist]);

  const updateDailyPickFromStocks = useCallback((stockMap) => {
    const analyzed = Object.values(stockMap).filter(Boolean);
    if (!analyzed.length) return;
    const best = [...analyzed].sort((a, b) => b.signal.score - a.signal.score)[0];
    const reasons = best.signal.rows
      .filter((r) => r.signal === "BUY")
      .slice(0, 3)
      .map((r) => `${r.name}: ${r.value} (${r.signal})`);
    if (reasons.length < 3) {
      reasons.push(
        `Composite score ${(best.signal.score * 100).toFixed(0)}%`,
        `RSI ${best.signal.rsi?.toFixed(1) ?? "—"}`,
        `Price $${best.price?.toFixed(2)}`
      );
    }
    setDailyPick({ ...best, reasons, ts: new Date().toLocaleString() });
  }, []);

  const refreshLivePredictions = useCallback(async () => {
    if (!predictionApiEnabled || predBusyRef.current) return;
    predBusyRef.current = true;
    try {
      const { stocks: serverStocks, updatedAt } = await fetchBatchPredictions(watchlist);
      if (serverStocks && Object.keys(serverStocks).length) {
        let next;
        setStocks((prev) => {
          next = { ...prev };
          Object.entries(serverStocks).forEach(([sym, s]) => {
            if (s) next[sym] = { ...prev[sym], ...s, symbol: sym };
          });
          return next;
        });
        if (next) updateDailyPickFromStocks(next);
        setLastPredAt(updatedAt ? new Date(updatedAt) : new Date());
      }
    } catch (e) {
      console.warn("Live prediction refresh:", e);
    }
    predBusyRef.current = false;
  }, [watchlist, updateDailyPickFromStocks]);

  useEffect(() => {
    localStorage.setItem("stocksage_live", liveMode ? "1" : "0");
    localStorage.setItem("stocksage_live_sec", String(liveSec));
  }, [liveMode, liveSec]);

  useEffect(() => {
    if (!liveMode) return;
    const minSec = plus ? 15 : 30;
    const sec = Math.max(minSec, liveSec);
    const tick = () => {
      if (!document.hidden) refreshLiveQuotes();
    };
    tick();
    const id = setInterval(tick, sec * 1000);
    return () => clearInterval(id);
  }, [liveMode, liveSec, plus, refreshLiveQuotes]);

  useEffect(() => {
    if (!liveMode || !predictionApiEnabled) return;
    const predSec = plus ? 30 : 60;
    const tick = () => {
      if (!document.hidden) refreshLivePredictions();
    };
    tick();
    const id = setInterval(tick, predSec * 1000);
    return () => clearInterval(id);
  }, [liveMode, plus, refreshLivePredictions]);

  const toggleLive = () => {
    if (!liveMode && !plus && liveSec < 30) setLiveSec(30);
    const turningOn = !liveMode;
    setLiveMode(turningOn);
    if (turningOn) {
      const qSec = plus ? liveSec : Math.max(30, liveSec);
      const pSec = plus ? 30 : 60;
      setToast(
        predictionApiEnabled
          ? `Live on — quotes every ${qSec}s, predictions every ${pSec}s`
          : `Live quotes on — every ${qSec}s`
      );
      if (predictionApiEnabled) refreshLivePredictions();
    } else {
      setToast("Live mode off");
    }
    setTimeout(() => setToast(null), 4000);
  };

  const openUpgrade = () => setPricingOpen(true);

  const exportCsv = () => {
    if (!plus) {
      openUpgrade();
      return;
    }
    const rows = [["Symbol", "Price", "Change%", "Signal", "Score"]];
    stockList.forEach((s) => {
      rows.push([
        s.symbol,
        s.price?.toFixed(2) ?? "",
        s.change?.toFixed(2) ?? "",
        s.signal?.label ?? "",
        s.signal?.score != null ? (s.signal.score * 100).toFixed(0) : "",
      ]);
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `stocksage-watchlist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setToast("Watchlist exported to CSV");
    setTimeout(() => setToast(null), 3000);
  };

  const sendChat = async (text) => {
    const msg = text.trim();
    if (!msg || chatBusy) return;
    if (!canSendChat(planId)) {
      setToast(`Daily chat limit reached (${plan.limits.chatPerDay}/day). Upgrade to Plus.`);
      setTimeout(() => setToast(null), 4500);
      openUpgrade();
      return;
    }
    if (!plus) incrementChatUsage();
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setChatInput("");
    setChatBusy(true);
    const ctx = { stocks: stockList };
    try {
      let reply;
      if (apiKey) {
        reply = await callClaude(apiKey, [{ content: msg }], buildContext());
      } else {
        reply = localChatReply(msg, ctx);
      }
      setMessages((m) => [...m, { role: "ai", content: reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "ai", content: localChatReply(msg, ctx) + `\n\n_(API fallback: ${e.message})_` }]);
    }
    setChatBusy(false);
  };

  const addTicker = () => {
    const t = newTicker.trim().toUpperCase();
    if (!t || watchlist.includes(t)) return;
    if (watchlist.length >= plan.limits.watchlist) {
      setToast(`Free plan: max ${plan.limits.watchlist} tickers. Upgrade for more.`);
      setTimeout(() => setToast(null), 4000);
      openUpgrade();
      return;
    }
    setWatchlist((w) => [...w, t]);
    setNewTicker("");
    loadStock(t).then((d) => setStocks((s) => ({ ...s, [t]: d })));
  };

  const activeStock = stocks[active];
  const pred = activeStock?.prediction;
  const spreads = activeStock?.spreadPredictions;
  const optionsPred = activeStock?.optionPredictions;
  const visibleSpreads = plus ? spreads?.spreads : spreads?.spreads?.slice(0, 2);
  const visibleOptions = plus ? optionsPred?.options : optionsPred?.options?.slice(0, 3);
  const trialDays = getTrialDaysLeft();
  const chatLeft = chatRemaining(planId);
  const allowedTimeframes = plan.limits.timeframes;

  const setTimeframeGated = (tf) => {
    if (!allowedTimeframes.includes(tf)) {
      setToast(`${tf} charts are a Plus feature`);
      setTimeout(() => setToast(null), 3500);
      openUpgrade();
      return;
    }
    setTimeframe(tf);
  };

  if (loading) {
    return (
      <div className="stocksage">
        <style>{css}</style>
        <div className="loading-screen">
          <div className="logo">◈ StockSage</div>
          <p style={{ color: "var(--muted)", marginTop: 12, fontFamily: "var(--mono)" }}>Loading market data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`stocksage ${theme === "light" ? "light" : ""}`}>
      <style>{css}</style>
      <div className="disclaimer">
        StockSage is for informational purposes only. Not financial advice. Always do your own research.
      </div>

      <div className="plan-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className={`plan-badge ${plus ? "plus" : ""}`}>
            {plus ? `◈ Plus${trialDays > 0 ? ` · trial ${trialDays}d` : ""}` : "◈ Free plan"}
          </span>
          {!plus && chatLeft != null && (
            <span style={{ color: "var(--muted)", fontFamily: "var(--mono)", fontSize: "0.75rem" }}>
              {chatLeft} AI chats left today
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            className={`btn-live ${liveMode ? "on" : ""}`}
            onClick={toggleLive}
            title={predictionApiEnabled
              ? "Live quotes + server-side prediction refresh (near real-time)"
              : "Poll latest prices every 15–60s (near real-time)"}
          >
            {liveMode ? "● LIVE" : "○ Live"}
          </button>
          {liveMode && lastLiveAt && (
            <span className="live-ts">
              Quotes {lastLiveAt.toLocaleTimeString()}
              {predictionApiEnabled && lastPredAt && (
                <> · Pred {lastPredAt.toLocaleTimeString()}</>
              )}
            </span>
          )}
          {plus && (
            <button type="button" className="settings-btn" onClick={exportCsv}>↓ Export CSV</button>
          )}
          {!plus ? (
            <>
              <button type="button" className="btn-join-free" onClick={() => setPricingOpen(true)}>Join Free</button>
              <button type="button" className="btn-upgrade" onClick={openUpgrade}>Upgrade to Plus</button>
            </>
          ) : (
            <button type="button" className="settings-btn" onClick={openUpgrade}>Manage plan</button>
          )}
        </div>
      </div>

      <div className="market-strip" data-tour="market-strip">
        {INDICES.map((ind) => {
          const d = indices[ind.symbol];
          const chg = d?.change;
          const cls = chg >= 0 ? "up" : "down";
          return (
            <div key={ind.symbol} className="market-item">
              <span className="lbl">{ind.label}</span>
              <span className={cls}>{d?.price != null ? d.price.toFixed(2) : "—"}</span>
              <span className={cls}>{chg != null ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : ""}</span>
            </div>
          );
        })}
      </div>

      {error && (
        <div style={{ padding: 12, background: "#2a1010", borderBottom: "1px solid var(--red)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#FF4757", fontSize: "0.85rem" }}>⚠ {error} — Yahoo Finance may be blocked. Try again.</span>
          <button className="settings-btn" onClick={refreshAll}>Try Again</button>
        </div>
      )}

      <div className="layout">
        <aside className="sidebar" data-tour="watchlist">
          <div className="sidebar-h">
            <h2>Watchlist</h2>
            <span
              className={`live-dot ${liveMode ? "streaming" : ""}`}
              title={liveMode
                ? (predictionApiEnabled ? "Live quotes + predictions streaming" : "Live quotes streaming")
                : "Data loaded"}
            />
          </div>
          <div className="watchlist">
            {watchlist.map((sym) => {
              const s = stocks[sym];
              return (
                <div
                  key={sym}
                  className={`wl-row ${active === sym ? "active" : ""}`}
                  onClick={() => setActive(sym)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="tk">{sym}</span>
                    <span className={`pr ${s?.change >= 0 ? "up" : "down"}`}>
                      {s?.price != null ? `$${s.price.toFixed(2)}` : "—"}
                    </span>
                  </div>
                  <div className={`pr ${s?.change >= 0 ? "up" : "down"}`}>
                    {s?.change != null ? `${s.change >= 0 ? "+" : ""}${s.change.toFixed(2)}%` : "…"}
                  </div>
                  {s?.signal && <span className={`sig ${s.signal.cls}`}>{s.signal.label}</span>}
                  {portfolio[sym] > 0 && s?.price && (
                    <div className="pr" style={{ marginTop: 4, fontSize: "0.7rem" }}>
                      {portfolio[sym]} sh · ${(s.price * portfolio[sym]).toFixed(0)} value
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="add-ticker">
            <input value={newTicker} onChange={(e) => setNewTicker(e.target.value)} placeholder="Add ticker" onKeyDown={(e) => e.key === "Enter" && addTicker()} />
            <button className="settings-btn" onClick={addTicker}>+</button>
          </div>
        </aside>

        <main className="main">
          {dailyPick && (
            <div className="daily-pick" data-tour="daily-pick" style={{ position: "relative" }}>
              <h3>⭐ Daily Pick · {dailyPick.ts}</h3>
              <div className="big">{dailyPick.symbol} — {dailyPick.name}</div>
              <p style={{ marginTop: 8, fontFamily: "var(--mono)" }}>
                ${dailyPick.price?.toFixed(2)} · <span className={dailyPick.signal.cls}>{dailyPick.signal.label}</span> · Score {(dailyPick.signal.score * 100).toFixed(0)}%
              </p>
              <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: "0.85rem", color: "var(--muted)" }}>
                {(plus ? dailyPick.reasons : dailyPick.reasons.slice(0, 1)).map((r, i) => <li key={i}>{r}</li>)}
              </ul>
              {!plus && dailyPick.reasons.length > 1 && (
                <button type="button" className="btn-upgrade" style={{ marginTop: 10 }} onClick={openUpgrade}>
                  Unlock all {dailyPick.reasons.length} signal reasons — Plus
                </button>
              )}
              <button className="settings-btn" style={{ marginTop: 12 }} onClick={refreshAll}>↻ Refresh Pick</button>
            </div>
          )}

          <div className="panel" data-tour="chart">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <h3>{active} — Price Chart</h3>
              <div className="tf-tabs" data-tour="timeframe-tabs">
                {Object.keys(RANGE_MAP).map((tf) => (
                  <button
                    key={tf}
                    className={timeframe === tf ? "active" : ""}
                    onClick={() => setTimeframeGated(tf)}
                    title={!allowedTimeframes.includes(tf) ? "Plus feature" : undefined}
                    style={!allowedTimeframes.includes(tf) ? { opacity: 0.5 } : undefined}
                  >
                    {tf}{!allowedTimeframes.includes(tf) ? " 🔒" : ""}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ height: 280 }}>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <CartesianGrid stroke="#1a2d4a" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fill: "#6b8299", fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: "#6b8299", fontSize: 10 }} width={60} />
                    <Tooltip contentStyle={{ background: "#0A1628", border: "1px solid #1a2d4a", fontFamily: "monospace" }} />
                    <Line type="monotone" dataKey="close" stroke="#00FF88" dot={false} strokeWidth={2} name="Close" />
                    <Line type="monotone" dataKey="sma20" stroke="#FFB347" dot={false} strokeWidth={1} name="SMA20" />
                    <Line type="monotone" dataKey="sma50" stroke="#6b8299" dot={false} strokeWidth={1} name="SMA50" />
                    {pred && (
                      <ReferenceLine y={pred.d7} stroke="#00FF88" strokeDasharray="5 5" label="7d pred" />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="skeleton" style={{ height: "100%" }} />
              )}
            </div>
          </div>

          <div className="grid-2">
            <div className="panel" data-tour="signals">
              <h3>Signal · {active}</h3>
              {activeStock?.signal ? (
                <>
                  <div className={`signal-badge ${activeStock.signal.cls}`}>
                    {activeStock.signal.label}
                    <span style={{ marginLeft: 10, fontSize: "0.85rem", opacity: 0.85 }}>
                      ({(activeStock.signal.score * 100).toFixed(0)}% composite)
                    </span>
                  </div>
                  <table className="ind-table">
                    <thead>
                      <tr><th>Indicator</th><th>Value</th><th>Signal</th></tr>
                    </thead>
                    <tbody>
                      {activeStock.signal.rows.map((r) => (
                        <tr key={r.name}>
                          <td>{r.name}</td>
                          <td>{r.value}</td>
                          <td className={
                            r.signal === "BUY" ? "sig-buy"
                              : r.signal === "SELL" ? "sig-sell"
                                : "sig-neutral"
                          }>
                            {r.signal}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                  {activeStock ? "Loading signals…" : "Select a stock from the watchlist."}
                </p>
              )}
            </div>
            <div className="panel" data-tour="predictions">
              <h3>AI Prediction · {pred?.model}</h3>
              {pred ? (
                <>
                  <p style={{ marginBottom: 12, fontFamily: "var(--mono)", fontSize: "0.9rem" }}>
                    Direction: {pred.direction === "up" ? "▲ UP" : "▼ DOWN"} · Confidence: {pred.confidence}%
                  </p>
                  <div className="pred-grid">
                    <div className="pred-box"><div className="lbl">Tomorrow</div><div className="val">${pred.tomorrow?.toFixed(2)}</div></div>
                    <div className="pred-box"><div className="lbl">7 days</div><div className="val">${pred.d7?.toFixed(2)}</div></div>
                    <div className={`pred-box ${!plus ? "pred-locked" : ""}`}>
                      <div className="lbl">30 days</div>
                      <div className="val">${pred.d30?.toFixed(2)}</div>
                      {!plus && <span className="pred-lock-tag">PLUS</span>}
                    </div>
                  </div>
                  {plus && (
                    <p style={{ marginTop: 10, fontSize: "0.75rem", color: "var(--muted)" }}>
                      Band (7d): ${pred.bandLow?.toFixed(2)} — ${pred.bandHigh?.toFixed(2)}
                    </p>
                  )}
                  {!plus && (
                    <button type="button" className="btn-upgrade" style={{ marginTop: 10 }} onClick={openUpgrade}>
                      Unlock 30-day forecast & bands
                    </button>
                  )}
                </>
              ) : (
                <p style={{ color: "var(--muted)" }}>Insufficient data</p>
              )}
            </div>
          </div>

          <div className="panel spread-panel" data-tour="option-predictions">
            <h3>Option prediction · {active}</h3>
            <p className="spread-meta">
              Modeled premiums · HV {optionsPred?.hv ?? "—"}% · 7d move forecast {optionsPred?.forecastMove7d?.toFixed(1) ?? "—"}%
              · {optionsPred?.expiryHint ?? "—"}
            </p>
            {optionsPred?.bestPick && (
              <p style={{ fontSize: "0.85rem", marginBottom: 10 }}>
                Top pick: <strong style={{ color: "var(--green)" }}>{optionsPred.bestPick.contract}</strong>
                {" "}{optionsPred.bestPick.type} ({optionsPred.bestPick.moneyness}) — {optionsPred.bestPick.verdict}
                {" · "}est. premium ${optionsPred.bestPick.estPremium?.toFixed(2)}
              </p>
            )}
            <div className="option-tabs">
              <button type="button" className={optionTab === "singles" ? "active" : ""} onClick={() => setOptionTab("singles")}>
                Single legs
              </button>
              <button type="button" className={optionTab === "combos" ? "active" : ""} onClick={() => setOptionTab("combos")}>
                Straddle / Strangle
              </button>
            </div>
            {optionTab === "singles" && visibleOptions?.length ? (
              <table className="option-table">
                <thead>
                  <tr>
                    <th>Contract</th><th>Type</th><th>Strike</th><th>Premium</th>
                    <th>Pred. 7d</th><th>P/L 7d</th><th>Δ</th><th>BE move</th><th>Outlook</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOptions.map((o) => (
                    <tr key={o.id} className={optionsPred.bestPick?.id === o.id ? "best-row" : ""}>
                      <td><strong>{o.contract}</strong></td>
                      <td className={o.type === "Call" ? "type-call" : "type-put"}>{o.type} {o.moneyness}</td>
                      <td>${o.strike}</td>
                      <td>${o.estPremium?.toFixed(2)}</td>
                      <td>${o.predictedPremium7d?.toFixed(2)}</td>
                      <td className={o.pnlMark7d >= 0 ? "spread-pnl up" : "spread-pnl down"}>
                        {o.pnlMark7d >= 0 ? "+" : ""}${o.pnlMark7d?.toFixed(2)}
                      </td>
                      <td>{o.delta}</td>
                      <td>{o.moveNeededPct >= 0 ? "+" : ""}{o.moveNeededPct?.toFixed(1)}%</td>
                      <td><span className={`spread-verdict ${o.verdictCls}`}>{o.verdict}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : optionTab === "combos" && optionsPred?.combos?.length ? (
              <div className="option-combo-row">
                {(plus ? optionsPred.combos : optionsPred.combos.slice(0, 1)).map((c) => (
                  <div key={c.id} className="option-combo">
                    <strong>{c.name}</strong>
                    <span className={`spread-verdict ${c.verdictCls}`} style={{ marginLeft: 8 }}>{c.verdict}</span>
                    <div className="spread-legs" style={{ marginTop: 6 }}>{c.legs}</div>
                    <div className="spread-stats" style={{ marginTop: 8 }}>
                      <div><span>Est. cost</span><div>${c.estCost?.toFixed(2)}</div></div>
                      <div><span>P/L mark 7d</span>
                        <div className={c.pnlMark7d >= 0 ? "spread-pnl up" : "spread-pnl down"}>
                          {c.pnlMark7d >= 0 ? "+" : ""}${c.pnlMark7d?.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <p className="spread-note">{c.note}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--muted)" }}>Select a stock to see option predictions.</p>
            )}
            {!plus && (optionsPred?.options?.length ?? 0) > 3 && optionTab === "singles" && (
              <button type="button" className="btn-upgrade" style={{ marginTop: 12 }} onClick={openUpgrade}>
                Unlock all {optionsPred.options.length} contracts + combos — Plus
              </button>
            )}
          </div>

          <div className="panel spread-panel" data-tour="spread-predictions">
            <h3>Spread options prediction · {active}</h3>
            <p className="spread-meta">
              Educational model from price forecast + historical vol ({spreads?.hv ?? "—"}% HV)
              · {spreads?.expiryHint ?? "—"} · Width ~${spreads?.width?.toFixed(0) ?? "—"}
            </p>
            {spreads?.bestPick && (
              <p style={{ fontSize: "0.85rem", marginBottom: 12 }}>
                Top fit: <strong style={{ color: "var(--green)" }}>{spreads.bestPick.name}</strong>
                {" "}({spreads.bestPick.bias}) — {spreads.bestPick.verdict} at 7d target
              </p>
            )}
            {visibleSpreads?.length ? (
              <div className="spread-grid">
                {visibleSpreads.map((s) => (
                  <div
                    key={s.id}
                    className={`spread-card ${spreads.bestPick?.id === s.id ? "best" : ""}`}
                  >
                    <h4>
                      {s.name}
                      <span className={`spread-verdict ${s.verdictCls}`}>{s.verdict}</span>
                    </h4>
                    <div style={{ color: "var(--muted)", fontSize: "0.75rem" }}>{s.bias} · {s.structure}</div>
                    <div className="spread-legs">{s.legs}</div>
                    <div className="spread-stats">
                      <div>
                        <span>Cost / credit</span>
                        <div>
                          {s.estDebit != null ? `Debit $${s.estDebit.toFixed(2)}` : `Credit $${s.estCredit?.toFixed(2)}`}
                        </div>
                      </div>
                      <div>
                        <span>Max profit / loss</span>
                        <div>
                          +${s.maxProfit?.toFixed(2)} / −${s.maxLoss?.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <span>P/L @ 7d target</span>
                        <div className={`spread-pnl ${s.pnlAt7d >= 0 ? "up" : "down"}`}>
                          {s.pnlAt7d >= 0 ? "+" : ""}${s.pnlAt7d?.toFixed(2)}
                          <span style={{ color: "var(--muted)" }}> (${s.targetPrice7d?.toFixed(2)})</span>
                        </div>
                      </div>
                      <div>
                        <span>P/L @ 30d target</span>
                        <div className={`spread-pnl ${s.pnlAt30d >= 0 ? "up" : "down"}`}>
                          {s.pnlAt30d >= 0 ? "+" : ""}${s.pnlAt30d?.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <p className="spread-note">{s.note}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--muted)" }}>Load stock data to see spread outlook.</p>
            )}
            {!plus && (spreads?.spreads?.length ?? 0) > 2 && (
              <button type="button" className="btn-upgrade" style={{ marginTop: 14 }} onClick={openUpgrade}>
                Unlock all {spreads.spreads.length} spread strategies — Plus
              </button>
            )}
            <p style={{ marginTop: 12, fontSize: "0.7rem", color: "var(--muted)" }}>
              Strikes are modeled from spot — not live options chain. Options involve risk; not financial advice.
            </p>
          </div>
        </main>

        <aside className={`chat ${chatOpen ? "open-mobile" : ""}`} data-tour="chat">
          <div className="chat-h">
            <strong>StockSage AI</strong>
            <button className="settings-btn" onClick={() => setChatOpen(false)}>−</button>
          </div>
          <div className="chat-msgs">
            {messages.length === 0 && (
              <div className="msg ai">Ask me about any stock on your watchlist. Add an Anthropic API key in Settings for full Claude responses.</div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.content}
                {m.role === "ai" && (
                  <button className="settings-btn" style={{ marginTop: 6, fontSize: "0.65rem" }} onClick={() => navigator.clipboard?.writeText(m.content)}>Copy</button>
                )}
              </div>
            ))}
            {chatBusy && <div className="msg ai" style={{ fontStyle: "italic", color: "var(--muted)" }}>Analyzing…</div>}
          </div>
          {!plus && chatLeft != null && (
            <div className="chat-quota">{chatLeft} of {plan.limits.chatPerDay} AI messages left today</div>
          )}
          <div className="chips">
            {CHAT_CHIPS.map((c) => (
              <button key={c} className="chip" onClick={() => sendChat(c)}>{c}</button>
            ))}
          </div>
          <div className="chat-in">
            <textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask about stocks…" onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendChat(chatInput))} />
            <button onClick={() => sendChat(chatInput)} disabled={chatBusy}>Send</button>
          </div>
        </aside>
      </div>

      {!chatOpen && (
        <button className="chat-fab" onClick={() => setChatOpen(true)} aria-label="Open chat">α</button>
      )}

      <button
        className="settings-btn"
        style={{ position: "fixed", top: 48, right: 100, zIndex: 50 }}
        onClick={() => setHelpOpen(true)}
        aria-label="Help tour"
      >
        ❓ Help
      </button>
      <button
        className="settings-btn"
        style={{ position: "fixed", top: 48, right: 16, zIndex: 50 }}
        data-tour="settings-btn"
        onClick={() => setSettingsOpen(!settingsOpen)}
      >
        ⚙ Settings
      </button>

      <HelpTour
        open={helpOpen}
        onClose={closeHelp}
        appState={{
          active,
          timeframe,
          settingsOpen,
          messagesLength: messages.length,
        }}
        onStepEnter={onHelpStep}
      />

      <PricingModal
        open={pricingOpen}
        onClose={() => setPricingOpen(false)}
        onPlanChange={(id) => {
          setPlanId(id);
          setToast(id === "plus" ? "Plus trial started — enjoy full features!" : "Switched to Free plan");
          setTimeout(() => setToast(null), 4000);
        }}
      />

      {settingsOpen && (
        <div style={{ position: "fixed", top: 80, right: 16, background: "var(--panel)", border: "1px solid var(--border)", padding: 16, borderRadius: 8, zIndex: 100, width: 280, fontSize: "0.85rem" }}>
          <h3 style={{ marginBottom: 12 }}>Settings</h3>
          <label style={{ display: "block", marginBottom: 8 }}>Theme</label>
          <select value={theme} onChange={(e) => setTheme(e.target.value)} style={{ width: "100%", marginBottom: 12, padding: 8, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
          <label style={{ display: "block", marginBottom: 8 }}>Live mode (near real-time)</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={liveMode} onChange={toggleLive} />
            <span>Enable live polling</span>
          </label>
          {predictionApiEnabled && (
            <p style={{ fontSize: "0.7rem", color: "var(--muted)", marginBottom: 8 }}>
              Predictions refresh via <code>/api/predict-batch</code> every {plus ? 30 : 60}s while live is on.
            </p>
          )}
          <select
            value={liveSec}
            disabled={!liveMode}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v < 30 && !plus) {
                openUpgrade();
                return;
              }
              setLiveSec(v);
            }}
            style={{ width: "100%", marginBottom: 12, padding: 8, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}
          >
            {plus && <option value={15}>Every 15 seconds (Plus)</option>}
            <option value={30}>Every 30 seconds</option>
            <option value={60}>Every 60 seconds</option>
          </select>
          <p style={{ fontSize: "0.7rem", color: "var(--muted)", marginBottom: 12 }}>
            Quotes use 1-minute Yahoo data. {predictionApiEnabled && "Signals and price targets refresh on the prediction service on a separate timer. "}
            Not tick-by-tick. Pauses when tab is hidden.
          </p>
          <label style={{ display: "block", marginBottom: 8 }}>Full refresh (signals & charts)</label>
          <select
            value={refreshMin}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v === 1 && !plus) {
                openUpgrade();
                return;
              }
              setRefreshMin(v);
            }}
            style={{ width: "100%", marginBottom: 12, padding: 8, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}
          >
            <option value={0}>Manual</option>
            {plan.limits.refreshMin.includes(1) && <option value={1}>1 min (Plus)</option>}
            <option value={5}>5 min</option>
            <option value={15}>15 min</option>
          </select>
          {!plus && (
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 12 }}>
              <button type="button" className="settings-btn" style={{ width: "100%" }} onClick={openUpgrade}>Upgrade for 1-min refresh</button>
            </p>
          )}
          <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 8 }}>Plan: {plan.name}</p>
          <button type="button" className="btn-upgrade" style={{ width: "100%", marginBottom: 12 }} onClick={openUpgrade}>
            {plus ? "View plans" : "Upgrade to Plus — 14-day trial"}
          </button>
          <label style={{ display: "block", marginBottom: 8 }}>Anthropic API key (optional)</label>
          <input type="password" value={apiKey} onChange={(e) => { setApiKey(e.target.value); localStorage.setItem("stocksage_api_key", e.target.value); }} placeholder="sk-ant-…" style={{ width: "100%", padding: 8, marginBottom: 12, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
          <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginBottom: 8 }}>Portfolio (shares per ticker)</p>
          {watchlist.map((sym) => (
            <div key={sym} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <span style={{ width: 50, fontFamily: "var(--mono)" }}>{sym}</span>
              <input type="number" min="0" step="1" value={portfolio[sym] || ""} onChange={(e) => {
                const p = { ...portfolio, [sym]: Number(e.target.value) };
                setPortfolio(p);
                localStorage.setItem("stocksage_portfolio", JSON.stringify(p));
              }} placeholder="Shares" style={{ flex: 1, padding: 4, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
            </div>
          ))}
          <button className="settings-btn" style={{ marginTop: 8, width: "100%" }} onClick={() => setSettingsOpen(false)}>Close</button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
