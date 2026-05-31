import React from "react";
import { PLANS, getStoredPlan, setPlan, startPlusTrial, getTrialDaysLeft } from "./plans.js";

const modalCss = `
.pricing-overlay {
  position: fixed; inset: 0; background: rgba(5, 10, 20, 0.88);
  z-index: 600; display: flex; align-items: flex-start; justify-content: center;
  padding: 24px 16px; overflow-y: auto; font-family: var(--ui);
}
.pricing-sheet {
  max-width: 960px; width: 100%; background: var(--panel);
  border: 1px solid var(--border); border-radius: 12px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5); margin: auto;
}
.pricing-hero { padding: 28px 24px 16px; text-align: center; border-bottom: 1px solid var(--border); }
.pricing-hero h2 { font-size: 1.5rem; margin-bottom: 8px; }
.pricing-hero p { color: var(--muted); font-size: 0.95rem; }
.pricing-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px; padding: 24px;
}
.price-card {
  background: var(--bg); border: 1px solid var(--border); border-radius: 10px;
  padding: 20px; display: flex; flex-direction: column;
}
.price-card.featured { border-color: var(--green); box-shadow: 0 0 24px rgba(0, 255, 136, 0.12); }
.price-card .plan-name { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); }
.price-card .price { font-family: var(--mono); font-size: 2rem; font-weight: 700; margin: 8px 0 16px; }
.price-card .price span { font-size: 0.85rem; font-weight: 400; color: var(--muted); }
.price-card ul { list-style: none; padding: 0; margin: 0 0 20px; flex: 1; font-size: 0.85rem; }
.price-card li { padding: 6px 0 6px 20px; position: relative; color: var(--text); }
.price-card li::before { content: "✓"; position: absolute; left: 0; color: var(--green); }
.price-card button {
  width: 100%; padding: 10px; border-radius: 6px; font-weight: 700;
  font-family: var(--ui); cursor: pointer; border: 1px solid var(--border);
  background: var(--panel); color: var(--text);
}
.price-card button.primary { background: var(--green); color: #050a14; border-color: var(--green); }
.pricing-compare { padding: 0 24px 24px; }
.pricing-compare h3 { font-size: 0.9rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; }
.compare-table { width: 100%; font-size: 0.8rem; border-collapse: collapse; font-family: var(--mono); }
.compare-table th, .compare-table td { padding: 10px; text-align: left; border-bottom: 1px solid var(--border); }
.compare-table th { color: var(--muted); font-weight: 500; }
.pricing-testimonials {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px; padding: 0 24px 24px;
}
.testimonial-card {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  padding: 14px; font-size: 0.82rem; line-height: 1.5;
}
.testimonial-card cite { display: block; margin-top: 10px; font-size: 0.75rem; color: var(--muted); font-style: normal; }
.pricing-close {
  position: sticky; top: 0; display: flex; justify-content: flex-end;
  padding: 12px 16px; background: var(--panel); border-bottom: 1px solid var(--border);
  border-radius: 12px 12px 0 0;
}
.pricing-close button {
  background: none; border: 1px solid var(--border); color: var(--muted);
  padding: 6px 12px; border-radius: 6px; cursor: pointer; font-family: var(--ui);
}
.trust-line { text-align: center; font-size: 0.8rem; color: var(--muted); padding-bottom: 20px; }
`;

const COMPARE_ROWS = [
  ["Watchlist", "5 stocks", "20 stocks"],
  ["AI chat", "10 / day", "Unlimited"],
  ["Chart timeframes", "1M, 3M", "All (1W–1Y)"],
  ["Predictions", "7-day only", "7d + 30d + bands"],
  ["CSV export", "—", "✓"],
  ["Auto-refresh", "5–15 min", "1 min included"],
];

const TESTIMONIALS = [
  { quote: "The daily pick and signal breakdown replaced three tabs I used to juggle.", cite: "— Sarah M., swing trader" },
  { quote: "Upgrading for unlimited chat was worth it — I run scenarios on my whole watchlist.", cite: "— James K., retail investor" },
  { quote: "Clean UI, explainable indicators. Feels like a pro terminal without the clutter.", cite: "— Elena R., UK" },
];

export default function PricingModal({ open, onClose, onPlanChange }) {
  if (!open) return null;

  const current = getStoredPlan();
  const trialDays = getTrialDaysLeft();

  const selectFree = () => {
    setPlan("free");
    onPlanChange?.("free");
    onClose();
  };

  const selectPlus = () => {
    startPlusTrial(14);
    onPlanChange?.("plus");
    onClose();
  };

  return (
    <div className="pricing-overlay" role="dialog" aria-label="Pricing plans" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <style>{modalCss}</style>
      <div className="pricing-sheet">
        <div className="pricing-close">
          <button type="button" onClick={onClose}>✕ Close</button>
        </div>
        <div className="pricing-hero">
          <h2>AI-powered investing for every level</h2>
          <p>Start free. Upgrade when you need full watchlists, predictions, and unlimited AI chat.</p>
          {trialDays > 0 && (
            <p style={{ color: "var(--green)", marginTop: 8, fontSize: "0.85rem" }}>
              Plus trial active — {trialDays} day{trialDays !== 1 ? "s" : ""} left
            </p>
          )}
        </div>

        <div className="pricing-grid">
          {Object.values(PLANS).map((plan) => (
            <div key={plan.id} className={`price-card ${plan.featured ? "featured" : ""}`}>
              <p className="plan-name">{plan.name}</p>
              <p className="price">
                ${plan.price}
                <span> / {plan.period}</span>
              </p>
              <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 12 }}>{plan.tagline}</p>
              <ul>
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {plan.id === "free" ? (
                <button type="button" onClick={selectFree} disabled={current === "free" && trialDays === 0}>
                  {current === "free" && trialDays === 0 ? "Current plan" : "Use Free"}
                </button>
              ) : (
                <button type="button" className="primary" onClick={selectPlus}>
                  {trialDays > 0 ? "Extend trial (demo)" : "Start 14-day trial"}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="pricing-compare">
          <h3>Compare plans</h3>
          <table className="compare-table">
            <thead>
              <tr><th>Feature</th><th>Free</th><th>Plus</th></tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map(([f, a, b]) => (
                <tr key={f}><td>{f}</td><td>{a}</td><td>{b}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="trust-line">Trusted by 150,000+ investors (demo)</p>
        <div className="pricing-testimonials">
          {TESTIMONIALS.map((t) => (
            <div key={t.cite} className="testimonial-card">
              <blockquote style={{ margin: 0 }}>&ldquo;{t.quote}&rdquo;</blockquote>
              <cite>{t.cite}</cite>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
