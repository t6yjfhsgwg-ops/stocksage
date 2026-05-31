import {
  roundStrike,
  historicalVolAnnual,
  intrinsicCall,
  intrinsicPut,
  estimateLegPremium,
  verdictFromPnl,
  approxDelta,
} from "./optionsMath.js";

const DTE_ENTRY = 21;
const DTE_AT_7D = 14;

function buildLeg({
  id,
  symbol,
  type,
  moneyness,
  strike,
  spot,
  hv,
  targets,
  direction,
  score,
  fitBias,
}) {
  const isCall = type === "call";
  const premium = estimateLegPremium(spot, strike, hv, DTE_ENTRY, isCall);
  const premAt7 = estimateLegPremium(targets.d7, strike, hv, DTE_AT_7D, isCall);
  const premAt30 = estimateLegPremium(targets.d30, strike, hv, Math.max(DTE_AT_7D - 14, 7), isCall);
  const pnl7 = premAt7 - premium;
  const pnl30 = premAt30 - premium;
  const pnlExpiry7 = (isCall ? intrinsicCall(targets.d7, strike) : intrinsicPut(targets.d7, strike)) - premium;
  const breakeven = isCall ? strike + premium : strike - premium;
  const moveNeeded = ((breakeven - spot) / spot) * 100;
  const v7 = verdictFromPnl(pnl7, premium);
  const delta = approxDelta(spot, strike, hv, isCall);

  let fitScore = 0.4;
  if (isCall && direction === "up") fitScore = 0.55 + score * 0.35;
  if (!isCall && direction === "down") fitScore = 0.55 + (1 - score) * 0.35;
  if (moneyness === "atm" && Math.abs(score - 0.5) < 0.15) fitScore = 0.5;
  if (fitBias) fitScore = Math.max(fitScore, fitBias);

  return {
    id,
    contract: `${strike}${isCall ? "C" : "P"}`,
    type: isCall ? "Call" : "Put",
    moneyness,
    strike,
    estPremium: premium,
    predictedPremium7d: premAt7,
    predictedPremium30d: premAt30,
    pnlMark7d: pnl7,
    pnlMark30d: pnl30,
    pnlAtTarget7d: pnlExpiry7,
    breakeven,
    moveNeededPct: moveNeeded,
    delta,
    targetPrice7d: targets.d7,
    verdict: v7.label,
    verdictCls: v7.cls,
    fitScore,
    note: `${isCall ? "Call" : "Put"} ${moneyness.toUpperCase()} — est. mark P/L if ${symbol} → $${targets.d7?.toFixed(2)} in 7d.`,
  };
}

/**
 * Single-leg & direction combo option predictions.
 */
export function predictOptionContracts({ symbol, price, prediction, signal, points }) {
  if (!prediction || !price || price <= 0) {
    return { hv: 0, expiryHint: "—", options: [], bestCall: null, bestPut: null, bestPick: null, combos: [] };
  }

  const hv = historicalVolAnnual(points);
  const spot = price;
  const width = roundStrike(Math.max(spot * 0.04, 2.5));
  const atm = roundStrike(spot);
  const otmCall = roundStrike(spot + width);
  const otmPut = roundStrike(spot - width);
  const itmCall = roundStrike(spot - width);
  const itmPut = roundStrike(spot + width);
  const score = signal?.score ?? 0.5;
  const direction = prediction.direction;
  const targets = { d7: prediction.d7, d30: prediction.d30 };
  const expiryHint = `${DTE_ENTRY} DTE entry (7d / 30d mark-to-model)`;

  const options = [
    buildLeg({ id: "atm-call", symbol, type: "call", moneyness: "atm", strike: atm, spot, hv, targets, direction, score }),
    buildLeg({ id: "atm-put", symbol, type: "put", moneyness: "atm", strike: atm, spot, hv, targets, direction, score }),
    buildLeg({ id: "otm-call", symbol, type: "call", moneyness: "otm", strike: otmCall, spot, hv, targets, direction, score, fitBias: direction === "up" ? 0.6 : 0.35 }),
    buildLeg({ id: "otm-put", symbol, type: "put", moneyness: "otm", strike: otmPut, spot, hv, targets, direction, score, fitBias: direction === "down" ? 0.6 : 0.35 }),
    buildLeg({ id: "itm-call", symbol, type: "call", moneyness: "itm", strike: itmCall, spot, hv, targets, direction, score, fitBias: direction === "up" ? 0.55 : 0.3 }),
    buildLeg({ id: "itm-put", symbol, type: "put", moneyness: "itm", strike: itmPut, spot, hv, targets, direction, score, fitBias: direction === "down" ? 0.55 : 0.3 }),
  ];

  options.sort((a, b) => b.fitScore - a.fitScore);

  const calls = options.filter((o) => o.type === "Call").sort((a, b) => b.fitScore - a.fitScore);
  const puts = options.filter((o) => o.type === "Put").sort((a, b) => b.fitScore - a.fitScore);
  const bestCall = calls[0] || null;
  const bestPut = puts[0] || null;
  const bestPick = options[0] || null;

  const straddlePrem = estimateLegPremium(spot, atm, hv, DTE_ENTRY, true)
    + estimateLegPremium(spot, atm, hv, DTE_ENTRY, false);
  const straddlePnL7 = estimateLegPremium(targets.d7, atm, hv, DTE_AT_7D, true)
    + estimateLegPremium(targets.d7, atm, hv, DTE_AT_7D, false)
    - straddlePrem;
  const expectedMove = Math.abs((targets.d7 - spot) / spot) * 100;
  const straddleVerdict = verdictFromPnl(straddlePnL7, straddlePrem);

  const stranglePrem = estimateLegPremium(spot, otmCall, hv, DTE_ENTRY, true)
    + estimateLegPremium(spot, otmPut, hv, DTE_ENTRY, false);
  const stranglePnL7 = estimateLegPremium(targets.d7, otmCall, hv, DTE_AT_7D, true)
    + estimateLegPremium(targets.d7, otmPut, hv, DTE_AT_7D, false)
    - stranglePrem;
  const strangleVerdict = verdictFromPnl(stranglePnL7, stranglePrem);

  const combos = [
    {
      id: "long-straddle",
      name: "Long Straddle",
      legs: `Buy ${atm}C + ${atm}P`,
      estCost: straddlePrem,
      pnlMark7d: straddlePnL7,
      verdict: straddleVerdict.label,
      verdictCls: straddleVerdict.cls,
      fitScore: expectedMove > hv * 100 * 0.5 ? 0.7 : 0.4,
      note: `Needs a big move (forecast ${expectedMove.toFixed(1)}% vs ~${(hv * 100).toFixed(0)}% HV).`,
    },
    {
      id: "long-strangle",
      name: "Long Strangle",
      legs: `Buy ${otmCall}C + ${otmPut}P`,
      estCost: stranglePrem,
      pnlMark7d: stranglePnL7,
      verdict: strangleVerdict.label,
      verdictCls: strangleVerdict.cls,
      fitScore: expectedMove > hv * 100 * 0.6 ? 0.65 : 0.45,
      note: "Cheaper than straddle; needs larger move to profit.",
    },
  ].sort((a, b) => b.fitScore - a.fitScore);

  return {
    hv: Math.round(hv * 100),
    expiryHint,
    spot,
    options,
    bestCall,
    bestPut,
    bestPick,
    combos,
    forecastMove7d: expectedMove,
  };
}
