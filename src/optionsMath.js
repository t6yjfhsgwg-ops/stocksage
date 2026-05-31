/** Shared options modeling helpers (educational — not live chain data). */

export function roundStrike(price) {
  const step = price >= 200 ? 10 : price >= 50 ? 5 : price >= 25 ? 2.5 : 1;
  return Math.round(price / step) * step;
}

export function historicalVolAnnual(points) {
  const closes = points.map((p) => p.close).filter(Boolean);
  if (closes.length < 10) return 0.25;
  const rets = [];
  for (let i = 1; i < closes.length; i++) {
    rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length;
  return Math.min(0.8, Math.max(0.12, Math.sqrt(variance * 252)));
}

export function intrinsicCall(S, K) {
  return Math.max(0, S - K);
}

export function intrinsicPut(S, K) {
  return Math.max(0, K - S);
}

/** Rough single-leg premium (~Black-Scholes inspired, no dividends). */
export function estimateLegPremium(spot, strike, hv, dteDays, isCall) {
  const T = Math.max(dteDays / 365, 1 / 365);
  const intrinsic = isCall ? intrinsicCall(spot, strike) : intrinsicPut(spot, strike);
  const moneyness = Math.abs(spot - strike) / spot;
  const timeVal = spot * hv * Math.sqrt(T) * 0.4 * Math.exp(-moneyness * 6);
  return Math.max(0.05, intrinsic + timeVal);
}

export function estimateVerticalPremium(spot, width, hv, isCall) {
  const timeFactor = hv * Math.sqrt(14 / 365) * spot * 0.45;
  const intrinsic = isCall ? intrinsicCall(spot, spot) : intrinsicPut(spot, spot);
  return Math.max(0.05, width * 0.35 + timeFactor * 0.15 + intrinsic * 0.1);
}

export function verticalPnLAtExpiry(S, K1, K2, isCall, isDebit, premium) {
  const longK = isCall ? K1 : K2;
  const shortK = isCall ? K2 : K1;
  const longLeg = isCall ? intrinsicCall(S, longK) : intrinsicPut(S, longK);
  const shortLeg = isCall ? intrinsicCall(S, shortK) : intrinsicPut(S, shortK);
  const spreadValue = longLeg - shortLeg;
  return isDebit ? spreadValue - premium : premium - spreadValue;
}

export function verdictFromPnl(pnl, premium) {
  const base = Math.abs(premium) || 1;
  const roi = pnl / base;
  if (roi >= 0.5) return { label: "Favorable", cls: "favorable" };
  if (roi >= 0) return { label: "Neutral", cls: "neutral" };
  return { label: "Unfavorable", cls: "unfavorable" };
}

/** Approximate delta sign/magnitude for display. */
export function approxDelta(spot, strike, hv, isCall) {
  const d1 = (Math.log(spot / strike) + (hv * hv * 0.5) * (14 / 365)) / (hv * Math.sqrt(14 / 365));
  const cdf = 1 / (1 + Math.exp(-1.7 * d1));
  const delta = isCall ? cdf : cdf - 1;
  return Math.round(delta * 100) / 100;
}
