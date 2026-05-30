import React, { useState, useEffect, useRef } from "react";

const STEPS = [
  {
    title: "Welcome to StockSage",
    icon: "◈",
    narration:
      "StockSage is your AI-powered stock monitor. This quick tour shows you every major feature in under two minutes.",
    tip: "Not financial advice — for research and education only.",
  },
  {
    title: "Market overview strip",
    icon: "📊",
    narration:
      "At the top you'll see major indices: S&P 500, NASDAQ, DOW, VIX, and Bitcoin. Green means up today, red means down.",
    tip: "Data loads from Yahoo Finance when you start the app.",
  },
  {
    title: "Watchlist",
    icon: "📋",
    narration:
      "The left panel is your watchlist. Click any ticker to analyze it. The blinking dot means live data is active.",
    tip: "Type a symbol in the box at the bottom and press + to add stocks like AMD or NFLX.",
  },
  {
    title: "Daily pick",
    icon: "⭐",
    narration:
      "The Daily Pick card highlights the strongest BUY signal in your watchlist, with reasons from RSI, MACD, and moving averages.",
    tip: "Click Refresh Pick after you add new tickers.",
  },
  {
    title: "Price chart",
    icon: "📈",
    narration:
      "The chart shows price history with 20-day and 50-day moving averages. Switch timeframes: one week through one year.",
    tip: "The dashed line is the 7-day AI price prediction.",
  },
  {
    title: "Buy / Sell signals",
    icon: "🎯",
    narration:
      "The signal badge shows STRONG BUY through STRONG SELL. The table breaks down RSI, MACD, SMA cross, Bollinger Bands, and volume.",
    tip: "Scores combine five indicators equally for a composite rating.",
  },
  {
    title: "AI predictions",
    icon: "🔮",
    narration:
      "Predictions estimate tomorrow, 7-day, and 30-day prices using trend, momentum, and seasonality. Confidence comes from the model fit.",
    tip: "Model: Weighted Trend + Momentum — educational only.",
  },
  {
    title: "AI chat assistant",
    icon: "α",
    narration:
      "Open the chat panel on the right — or the floating α button on mobile. Ask about any stock, your watchlist, or market outlook.",
    tip: "Add an Anthropic API key in Settings for full Claude responses, or use the built-in analyst.",
  },
  {
    title: "Settings",
    icon: "⚙",
    narration:
      "Settings let you switch dark/light mode, set auto-refresh, track portfolio shares, and add your API key.",
    tip: "You're ready to explore. Press Close and happy researching!",
  },
];

const helpCss = `
.help-overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 10, 20, 0.92);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  font-family: var(--ui);
}
.help-modal {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  max-width: 520px;
  width: 100%;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
.help-video-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: linear-gradient(90deg, #0d2040, #0a1628);
  border-bottom: 1px solid var(--border);
  font-size: 0.75rem;
  color: var(--green);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.help-video-badge .rec-dot {
  width: 8px;
  height: 8px;
  background: var(--red);
  border-radius: 50%;
  animation: pulse 1s infinite;
}
.help-slide {
  padding: 28px 24px;
  min-height: 220px;
  text-align: center;
}
.help-slide-icon {
  font-size: 3rem;
  margin-bottom: 12px;
}
.help-slide h2 {
  font-size: 1.35rem;
  margin-bottom: 12px;
  color: var(--text);
}
.help-narration {
  font-size: 1rem;
  line-height: 1.6;
  color: var(--text);
  margin-bottom: 12px;
}
.help-tip {
  font-size: 0.85rem;
  color: var(--muted);
  font-style: italic;
}
.help-progress {
  height: 4px;
  background: var(--bg);
}
.help-progress-fill {
  height: 100%;
  background: var(--green);
  transition: width 0.2s linear;
}
.help-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-top: 1px solid var(--border);
  gap: 10px;
}
.help-controls button {
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-family: var(--ui);
  font-size: 0.85rem;
}
.help-controls button.primary {
  background: var(--green);
  color: #050a14;
  border-color: var(--green);
  font-weight: 700;
}
.help-step-dots {
  display: flex;
  gap: 6px;
  justify-content: center;
  flex: 1;
}
.help-step-dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  cursor: pointer;
}
.help-step-dots span.active {
  background: var(--green);
}
`;

export default function HelpTour({ open, onClose, autoPlayOnOpen = false }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef(null);
  const progressRef = useRef(null);

  const STEP_MS = 6000;
  const current = STEPS[step];

  useEffect(() => {
    if (!open) {
      setPlaying(false);
      setStep(0);
      setProgress(0);
      return;
    }
    if (autoPlayOnOpen) setPlaying(true);
  }, [open, autoPlayOnOpen]);

  useEffect(() => {
    if (!playing || !open) {
      clearInterval(timerRef.current);
      clearInterval(progressRef.current);
      return;
    }

    setProgress(0);
    const tick = 50;
    let elapsed = 0;
    progressRef.current = setInterval(() => {
      elapsed += tick;
      setProgress(Math.min(100, (elapsed / STEP_MS) * 100));
    }, tick);

    timerRef.current = setInterval(() => {
      setStep((s) => {
        if (s >= STEPS.length - 1) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
      elapsed = 0;
    }, STEP_MS);

    return () => {
      clearInterval(timerRef.current);
      clearInterval(progressRef.current);
    };
  }, [playing, open, step]);

  if (!open) return null;

  return (
    <div className="help-overlay" role="dialog" aria-label="StockSage help tour">
      <style>{helpCss}</style>
      <div className="help-modal">
        <div className="help-video-badge">
          {playing && <span className="rec-dot" />}
          <span>{playing ? "Playing help tour" : "Help tour"}</span>
          <span style={{ marginLeft: "auto", color: "var(--muted)" }}>
            {step + 1} / {STEPS.length}
          </span>
        </div>
        <div className="help-progress">
          <div className="help-progress-fill" style={{ width: `${playing ? progress : (step / (STEPS.length - 1)) * 100}%` }} />
        </div>
        <div className="help-slide">
          <div className="help-slide-icon">{current.icon}</div>
          <h2>{current.title}</h2>
          <p className="help-narration">{current.narration}</p>
          <p className="help-tip">{current.tip}</p>
        </div>
        <div className="help-controls">
          <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            ← Back
          </button>
          <div className="help-step-dots">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={i === step ? "active" : ""}
                onClick={() => { setStep(i); setProgress(0); }}
                role="button"
                aria-label={`Step ${i + 1}`}
              />
            ))}
          </div>
          <button
            type="button"
            className="primary"
            onClick={() => {
              if (step >= STEPS.length - 1) onClose();
              else setPlaying(!playing);
            }}
          >
            {step >= STEPS.length - 1 ? "Done" : playing ? "Pause" : "▶ Play"}
          </button>
        </div>
        <div style={{ padding: "0 16px 14px", textAlign: "center" }}>
          <button type="button" className="settings-btn" style={{ width: "100%" }} onClick={onClose}>
            Close tour
          </button>
        </div>
      </div>
    </div>
  );
}

export function shouldShowHelpOnFirstVisit() {
  return !localStorage.getItem("stocksage_help_seen");
}

export function markHelpSeen() {
  localStorage.setItem("stocksage_help_seen", "1");
}
