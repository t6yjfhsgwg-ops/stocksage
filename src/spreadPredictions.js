import {
  roundStrike,
  historicalVolAnnual,
  estimateVerticalPremium,
  verticalPnLAtExpiry,
  verdictFromPnl,
} from "./optionsMath.js";

/**
 * Educational options spread outlook from underlying price predictions.
 */
export function predictSpreadStrategies({ symbol, price, prediction, signal, points }) {
  if (!prediction || !price || price <= 0) return { hv: 0, expiryHint: "—", spreads: [], bestPick: null };

  const hv = historicalVolAnnual(points);
  const spot = price;
  const width = roundStrike(Math.max(spot * 0.04, 2.5));
  const atm = roundStrike(spot);
  const otmCall = roundStrike(spot + width);
  const otmPut = roundStrike(spot - width);
  const farOtmCall = roundStrike(spot + width * 2);
  const farOtmPut = roundStrike(spot - width * 2);
  const score = signal?.score ?? 0.5;
  const direction = prediction.direction;
  const targets = { d7: prediction.d7, d30: prediction.d30, low: prediction.bandLow, high: prediction.bandHigh };
  const expiryHint = "14–21 DTE (educational model)";

  const spreads = [];

  {
    const debit = estimateVerticalPremium(spot, width, hv, true);
    const maxProfit = width - debit;
    const pnl7 = verticalPnLAtExpiry(targets.d7, atm, otmCall, true, true, debit);
    const pnl30 = verticalPnLAtExpiry(targets.d30, atm, otmCall, true, true, debit);
    const v7 = verdictFromPnl(pnl7, debit);
    spreads.push({
      id: "bull-call",
      name: "Bull Call Spread",
      bias: "Bullish",
      legs: `Buy ${atm}C · Sell ${otmCall}C`,
      structure: "Debit vertical (calls)",
      estDebit: debit,
      estCredit: null,
      maxProfit,
      maxLoss: debit,
      breakeven: atm + debit,
      pnlAt7d: pnl7,
      pnlAt30d: pnl30,
      targetPrice7d: targets.d7,
      verdict: v7.label,
      verdictCls: v7.cls,
      fitScore: direction === "up" ? 0.7 + score * 0.3 : 0.3,
      note: `Profits if ${symbol} rises toward $${targets.d7?.toFixed(2)} (7d forecast).`,
    });
  }

  {
    const debit = estimateVerticalPremium(spot, width, hv, false);
    const maxProfit = width - debit;
    const pnl7 = verticalPnLAtExpiry(targets.d7, otmPut, atm, false, true, debit);
    const pnl30 = verticalPnLAtExpiry(targets.d30, otmPut, atm, false, true, debit);
    const v7 = verdictFromPnl(pnl7, debit);
    spreads.push({
      id: "bear-put",
      name: "Bear Put Spread",
      bias: "Bearish",
      legs: `Buy ${otmPut}P · Sell ${atm}P`,
      structure: "Debit vertical (puts)",
      estDebit: debit,
      estCredit: null,
      maxProfit,
      maxLoss: debit,
      breakeven: atm - debit,
      pnlAt7d: pnl7,
      pnlAt30d: pnl30,
      targetPrice7d: targets.d7,
      verdict: v7.label,
      verdictCls: v7.cls,
      fitScore: direction === "down" ? 0.7 + (1 - score) * 0.3 : 0.3,
      note: `Profits if ${symbol} falls toward $${targets.d7?.toFixed(2)} (7d forecast).`,
    });
  }

  {
    const credit = estimateVerticalPremium(spot, width, hv, false) * 0.85;
    const pnl7 = verticalPnLAtExpiry(targets.d7, farOtmPut, otmPut, false, false, credit);
    const pnl30 = verticalPnLAtExpiry(targets.d30, farOtmPut, otmPut, false, false, credit);
    const v7 = verdictFromPnl(pnl7, credit);
    spreads.push({
      id: "bull-put",
      name: "Bull Put Spread",
      bias: "Bullish / neutral",
      legs: `Sell ${otmPut}P · Buy ${farOtmPut}P`,
      structure: "Credit vertical (puts)",
      estDebit: null,
      estCredit: credit,
      maxProfit: credit,
      maxLoss: width - credit,
      breakeven: otmPut - credit,
      pnlAt7d: pnl7,
      pnlAt30d: pnl30,
      targetPrice7d: targets.d7,
      verdict: v7.label,
      verdictCls: v7.cls,
      fitScore: direction === "up" && score >= 0.45 ? 0.65 : 0.4,
      note: "Collect premium if price stays above short put strike.",
    });
  }

  {
    const credit = estimateVerticalPremium(spot, width, hv, true) * 0.85;
    const pnl7 = verticalPnLAtExpiry(targets.d7, otmCall, farOtmCall, true, false, credit);
    const pnl30 = verticalPnLAtExpiry(targets.d30, otmCall, farOtmCall, true, false, credit);
    const v7 = verdictFromPnl(pnl7, credit);
    spreads.push({
      id: "bear-call",
      name: "Bear Call Spread",
      bias: "Bearish / neutral",
      legs: `Sell ${otmCall}C · Buy ${farOtmCall}C`,
      structure: "Credit vertical (calls)",
      estDebit: null,
      estCredit: credit,
      maxProfit: credit,
      maxLoss: width - credit,
      breakeven: otmCall + credit,
      pnlAt7d: pnl7,
      pnlAt30d: pnl30,
      targetPrice7d: targets.d7,
      verdict: v7.label,
      verdictCls: v7.cls,
      fitScore: direction === "down" && score <= 0.55 ? 0.65 : 0.4,
      note: "Collect premium if price stays below short call strike.",
    });
  }

  if (targets.low != null && targets.high != null) {
    const putCredit = estimateVerticalPremium(spot, width, hv, false) * 0.7;
    const callCredit = estimateVerticalPremium(spot, width, hv, true) * 0.7;
    const totalCredit = putCredit + callCredit;
    const putLegPnl = verticalPnLAtExpiry(targets.d7, farOtmPut, otmPut, false, false, putCredit);
    const callLegPnl = verticalPnLAtExpiry(targets.d7, otmCall, farOtmCall, true, false, callCredit);
    const pnl7 = putLegPnl + callLegPnl;
    const putLeg30 = verticalPnLAtExpiry(targets.d30, farOtmPut, otmPut, false, false, putCredit);
    const callLeg30 = verticalPnLAtExpiry(targets.d30, otmCall, farOtmCall, true, false, callCredit);
    const pnl30 = putLeg30 + callLeg30;
    const v7 = verdictFromPnl(pnl7, totalCredit);
    const rangeWidth = targets.high - targets.low;
    spreads.push({
      id: "iron-condor",
      name: "Iron Condor",
      bias: "Neutral (range)",
      legs: `Put spread ${farOtmPut}/${otmPut} · Call spread ${otmCall}/${farOtmCall}`,
      structure: "Credit iron condor",
      estDebit: null,
      estCredit: totalCredit,
      maxProfit: totalCredit,
      maxLoss: width * 2 - totalCredit,
      breakeven: `${otmPut} – ${otmCall}`,
      pnlAt7d: pnl7,
      pnlAt30d: pnl30,
      targetPrice7d: targets.d7,
      verdict: v7.label,
      verdictCls: v7.cls,
      fitScore: rangeWidth < spot * 0.08 && Math.abs(score - 0.5) < 0.2 ? 0.75 : 0.45,
      note: `Best if ${symbol} stays between $${targets.low?.toFixed(2)} – $${targets.high?.toFixed(2)} (7d band).`,
    });
  }

  spreads.sort((a, b) => b.fitScore - a.fitScore);

  return {
    hv: Math.round(hv * 100),
    expiryHint,
    spreads,
    bestPick: spreads[0] || null,
    spot,
    width,
  };
}
