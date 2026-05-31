import React, { useState, useEffect, useRef, useCallback } from "react";

/** @typedef {'info' | 'click' | 'state'} StepKind */

const STEPS = [
  {
    id: "welcome",
    kind: "info",
    title: "Interactive tour",
    body: "You'll explore the real dashboard — click highlighted areas to unlock each step. Skip anytime with Esc.",
    action: "Click Start to begin",
  },
  {
    id: "market",
    kind: "info",
    target: "market-strip",
    title: "Market overview",
    body: "Major indices update from Yahoo Finance. Green is up today, red is down.",
    action: "Press Next when ready",
    placement: "bottom",
  },
  {
    id: "watchlist",
    kind: "click",
    target: "watchlist",
    title: "Your watchlist",
    body: "Click any ticker in the list to load its chart, signals, and predictions.",
    action: "Click a stock row →",
    placement: "right",
    validate: "stockSelected",
  },
  {
    id: "daily-pick",
    kind: "info",
    target: "daily-pick",
    title: "Daily pick",
    body: "The strongest BUY in your watchlist, with reasons from RSI, MACD, and moving averages.",
    action: "Next",
    placement: "bottom",
  },
  {
    id: "chart",
    kind: "click",
    target: "chart",
    title: "Price chart",
    body: "Switch timeframes to zoom the history. The dashed line is the 7-day prediction.",
    action: "Click a timeframe tab (e.g. 1M) →",
    placement: "bottom",
    validate: "timeframeChanged",
  },
  {
    id: "signals",
    kind: "info",
    target: "signals",
    title: "Buy / Sell signals",
    body: "Composite score from RSI, MACD, SMA cross, Bollinger Bands, and volume.",
    action: "Next",
    placement: "top",
  },
  {
    id: "predictions",
    kind: "info",
    target: "predictions",
    title: "AI predictions",
    body: "Tomorrow, 7-day, and 30-day estimates with confidence — educational model only.",
    action: "Next",
    placement: "top",
  },
  {
    id: "options",
    kind: "info",
    target: "option-predictions",
    title: "Option prediction",
    body: "Single-leg calls and puts with estimated premium, predicted price at 7d, delta, breakeven move, and straddle/strangle combos.",
    action: "Next",
    placement: "top",
  },
  {
    id: "spreads",
    kind: "info",
    target: "spread-predictions",
    title: "Spread options prediction",
    body: "See bull/bear verticals, credit spreads, and iron condors ranked by fit to the 7d price forecast and historical volatility.",
    action: "Next",
    placement: "top",
  },
  {
    id: "chat",
    kind: "click",
    target: "chat",
    title: "AI assistant",
    body: "Try a quick prompt chip or type a question about your watchlist.",
    action: "Click a chip or Send a message →",
    placement: "left",
    validate: "chatUsed",
  },
  {
    id: "settings",
    kind: "click",
    target: "settings-btn",
    title: "Settings",
    body: "Theme, auto-refresh, portfolio shares, and optional Anthropic API key.",
    action: "Open Settings →",
    placement: "left",
    validate: "settingsOpen",
  },
  {
    id: "done",
    kind: "info",
    title: "You're set",
    body: "Reopen this tour anytime with ❓ Help. Happy researching — not financial advice.",
    action: "Finish tour",
  },
];

const helpCss = `
.help-root { position: fixed; inset: 0; z-index: 500; pointer-events: none; font-family: var(--ui); }
.help-shade { position: fixed; background: rgba(5, 10, 20, 0.82); pointer-events: auto; transition: all 0.25s ease; }
.help-ring {
  position: fixed;
  border: 2px solid var(--green);
  border-radius: 10px;
  box-shadow: 0 0 0 2px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15);
  pointer-events: none;
  transition: all 0.25s ease;
  z-index: 501;
}
.help-ring.pulse { animation: helpPulse 1.5s ease-in-out infinite; }
@keyframes helpPulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(0, 255, 136, 0.25), 0 0 20px rgba(0, 255, 136, 0.1); }
  50% { box-shadow: 0 0 0 4px rgba(0, 255, 136, 0.45), 0 0 32px rgba(0, 255, 136, 0.25); }
}
.help-card {
  position: fixed;
  z-index: 502;
  pointer-events: auto;
  max-width: 340px;
  width: calc(100vw - 32px);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px 18px 14px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
}
.help-card h2 { font-size: 1.1rem; margin-bottom: 8px; color: var(--text); }
.help-card p { font-size: 0.9rem; line-height: 1.55; color: var(--muted); margin-bottom: 12px; }
.help-task {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(0, 255, 136, 0.08);
  border: 1px solid rgba(0, 255, 136, 0.35);
  border-radius: 8px;
  font-size: 0.85rem;
  color: var(--green);
  margin-bottom: 14px;
}
.help-task.done { background: rgba(0, 255, 136, 0.15); border-color: var(--green); }
.help-task-wait { opacity: 0.85; }
.help-card-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.help-card-actions button {
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-family: var(--ui);
  font-size: 0.85rem;
}
.help-card-actions button.primary {
  background: var(--green);
  color: #050a14;
  border-color: var(--green);
  font-weight: 700;
}
.help-card-actions button:disabled { opacity: 0.4; cursor: not-allowed; }
.help-progress-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--bg);
  z-index: 503;
  pointer-events: none;
}
.help-progress-fill { height: 100%; background: var(--green); transition: width 0.3s ease; }
.help-step-label {
  position: fixed;
  top: 10px;
  right: 12px;
  z-index: 503;
  pointer-events: auto;
  font-size: 0.75rem;
  color: var(--muted);
  background: var(--panel);
  border: 1px solid var(--border);
  padding: 6px 10px;
  border-radius: 6px;
}
.help-step-label button {
  margin-left: 10px;
  background: none;
  border: none;
  color: var(--green);
  cursor: pointer;
  font-family: var(--ui);
  font-size: 0.75rem;
}
.help-welcome-center {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  pointer-events: auto;
  background: rgba(5, 10, 20, 0.92);
  z-index: 502;
}
.help-welcome-box {
  max-width: 420px;
  width: 100%;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 28px 24px;
  text-align: center;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
}
.help-welcome-box h2 { font-size: 1.4rem; margin-bottom: 12px; }
.help-welcome-box p { color: var(--muted); line-height: 1.6; margin-bottom: 20px; }
`;

const PAD = 8;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function placeCard(rect, placement, cardW = 340, cardH = 200) {
  const margin = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect) {
    return { left: (vw - cardW) / 2, top: (vh - cardH) / 2 };
  }
  const placements = placement === "auto"
    ? ["bottom", "top", "right", "left"]
    : [placement, "bottom", "top", "right", "left"];
  for (const p of placements) {
    let left = 0;
    let top = 0;
    if (p === "bottom") {
      left = rect.left + rect.width / 2 - cardW / 2;
      top = rect.bottom + margin;
    } else if (p === "top") {
      left = rect.left + rect.width / 2 - cardW / 2;
      top = rect.top - cardH - margin;
    } else if (p === "right") {
      left = rect.right + margin;
      top = rect.top + rect.height / 2 - cardH / 2;
    } else {
      left = rect.left - cardW - margin;
      top = rect.top + rect.height / 2 - cardH / 2;
    }
    left = clamp(left, margin, vw - cardW - margin);
    top = clamp(top, margin, vh - cardH - margin);
    if (top >= margin && top + cardH <= vh - margin) {
      return { left, top };
    }
  }
  return { left: margin, top: margin };
}

function Spotlight({ rect }) {
  if (!rect) return null;
  const x = rect.left - PAD;
  const y = rect.top - PAD;
  const w = rect.width + PAD * 2;
  const h = rect.height + PAD * 2;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const panels = [
    { left: 0, top: 0, width: vw, height: y },
    { left: 0, top: y, width: x, height: h },
    { left: x + w, top: y, width: vw - x - w, height: h },
    { left: 0, top: y + h, width: vw, height: vh - y - h },
  ];

  return (
    <>
      {panels.map((p, i) => (
        <div
          key={i}
          className="help-shade"
          style={{ left: p.left, top: p.top, width: p.width, height: p.height }}
        />
      ))}
      <div
        className="help-ring pulse"
        style={{ left: x, top: y, width: w, height: h }}
      />
    </>
  );
}

export default function HelpTour({
  open,
  onClose,
  appState = {},
  onStepEnter,
}) {
  const [step, setStep] = useState(0);
  const [started, setStarted] = useState(false);
  const [rect, setRect] = useState(null);
  const [cardPos, setCardPos] = useState({ left: 16, top: 16 });
  const baseline = useRef({ active: null, timeframe: null });
  const interactionRef = useRef({
    watchlist: false,
    timeframe: false,
    chat: false,
    settings: false,
  });
  const [, forceTick] = useState(0);
  const bump = () => forceTick((n) => n + 1);
  const cardRef = useRef(null);

  const current = STEPS[step];
  const isWelcome = current.id === "welcome" && !started;
  const isDone = current.id === "done";

  const updateGeometry = useCallback(() => {
    if (!current.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${current.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect(r);
    const cardH = cardRef.current?.offsetHeight || 200;
    setCardPos(placeCard(r, current.placement || "bottom", 340, cardH));
  }, [current.target, current.placement]);

  useEffect(() => {
    if (!open) {
      setStep(0);
      setStarted(false);
      setRect(null);
      interactionRef.current = { watchlist: false, timeframe: false, chat: false, settings: false };
      return;
    }
    baseline.current = {
      active: appState.active,
      timeframe: appState.timeframe,
    };
  }, [open]);

  useEffect(() => {
    if (!open || !started) return;

    const onWatchlistClick = (e) => {
      if (e.target.closest(".wl-row")) {
        interactionRef.current.watchlist = true;
        bump();
      }
    };
    const onTimeframeClick = (e) => {
      if (e.target.closest(".tf-tabs button")) {
        interactionRef.current.timeframe = true;
        bump();
      }
    };
    const onChatClick = (e) => {
      if (e.target.closest(".chip") || e.target.closest(".chat-in button")) {
        interactionRef.current.chat = true;
        bump();
      }
    };

    const wl = document.querySelector('[data-tour="watchlist"]');
    const chart = document.querySelector('[data-tour="chart"]');
    const chat = document.querySelector('[data-tour="chat"]');
    wl?.addEventListener("click", onWatchlistClick);
    chart?.addEventListener("click", onTimeframeClick);
    chat?.addEventListener("click", onChatClick);

    return () => {
      wl?.removeEventListener("click", onWatchlistClick);
      chart?.removeEventListener("click", onTimeframeClick);
      chat?.removeEventListener("click", onChatClick);
    };
  }, [open, started]);

  useEffect(() => {
    if (!open || !started) return;
    const id = current.id;
    if (id === "watchlist") interactionRef.current.watchlist = false;
    if (id === "chart") interactionRef.current.timeframe = false;
    if (id === "chat") interactionRef.current.chat = false;
    if (id === "settings") interactionRef.current.settings = false;
    bump();
    onStepEnter?.(id);
    updateGeometry();
    const onResize = () => updateGeometry();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    const t = setTimeout(updateGeometry, 100);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      clearTimeout(t);
    };
  }, [open, started, step, current.id, onStepEnter, updateGeometry]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (appState.settingsOpen) {
      interactionRef.current.settings = true;
      bump();
    }
  }, [appState.settingsOpen]);

  useEffect(() => {
    if ((appState.messagesLength || 0) > 0) {
      interactionRef.current.chat = true;
      bump();
    }
  }, [appState.messagesLength]);

  const taskDone = useCallback(() => {
    const v = current.validate;
    if (!v) return current.kind === "info";
    const ix = interactionRef.current;
    if (v === "stockSelected") return ix.watchlist;
    if (v === "timeframeChanged") return ix.timeframe;
    if (v === "chatUsed") return ix.chat;
    if (v === "settingsOpen") return ix.settings || !!appState.settingsOpen;
    return false;
  }, [current, appState.settingsOpen]);

  const completed = taskDone();

  useEffect(() => {
    if (!open || !started || current.kind !== "click" || !completed) return;
    const t = setTimeout(() => {
      if (step < STEPS.length - 1) setStep((s) => s + 1);
    }, 600);
    return () => clearTimeout(t);
  }, [open, started, completed, current.kind, step]);

  const goNext = () => {
    if (step >= STEPS.length - 1) {
      markHelpSeen();
      onClose();
      return;
    }
    if (current.kind === "click" && !completed && !isWelcome) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  if (!open) return null;

  const progress = ((step + (started ? 1 : 0)) / STEPS.length) * 100;
  const showSpotlight = started && current.target && !isDone;

  if (isWelcome) {
    return (
      <div className="help-root" role="dialog" aria-label="StockSage interactive help">
        <style>{helpCss}</style>
        <div className="help-welcome-center">
          <div className="help-welcome-box">
            <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>◈</div>
            <h2>{current.title}</h2>
            <p>{current.body}</p>
            <div className="help-card-actions" style={{ justifyContent: "center" }}>
              <button type="button" onClick={onClose}>Skip</button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  interactionRef.current = { watchlist: false, timeframe: false, chat: false, settings: false };
                  setStarted(true);
                  baseline.current = {
                    active: appState.active,
                    timeframe: appState.timeframe,
                  };
                  setStep(1);
                }}
              >
                Start interactive tour
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="help-root" role="dialog" aria-label="StockSage interactive help">
      <style>{helpCss}</style>
      <div className="help-progress-bar">
        <div className="help-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="help-step-label">
        Step {step + 1} / {STEPS.length}
        <button type="button" onClick={onClose}>Exit</button>
      </div>

      {showSpotlight && <Spotlight rect={rect} />}

      {isDone ? (
        <div className="help-welcome-center">
          <div className="help-welcome-box">
            <div style={{ fontSize: "2rem", marginBottom: 8 }}>✓</div>
            <h2>{current.title}</h2>
            <p>{current.body}</p>
            <div className="help-card-actions" style={{ justifyContent: "center" }}>
              <button type="button" className="primary" onClick={() => { markHelpSeen(); onClose(); }}>
                {current.action}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={cardRef}
          className="help-card"
          style={{ left: cardPos.left, top: cardPos.top }}
        >
          <h2>{current.title}</h2>
          <p>{current.body}</p>
          <div className={`help-task ${completed ? "done" : "help-task-wait"}`}>
            <span>{completed ? "✓" : "◎"}</span>
            <span>{completed ? "Nice — step complete!" : current.action}</span>
          </div>
          <div className="help-card-actions">
            <button type="button" onClick={goBack} disabled={step <= 1}>
              ← Back
            </button>
            {current.kind === "info" ? (
              <button type="button" className="primary" onClick={goNext}>
                {current.action === "Finish tour" ? current.action : "Next →"}
              </button>
            ) : (
              <button
                type="button"
                className="primary"
                onClick={goNext}
                disabled={!completed}
                title={completed ? "" : "Complete the action above first"}
              >
                {completed ? "Next →" : "Waiting…"}
              </button>
            )}
            <button type="button" onClick={onClose} style={{ marginLeft: "auto" }}>
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function shouldShowHelpOnFirstVisit() {
  return !localStorage.getItem("stocksage_help_seen");
}

export function markHelpSeen() {
  localStorage.setItem("stocksage_help_seen", "1");
}
