import React from "react";

const lockCss = `
.feature-lock-wrap { position: relative; }
.feature-lock-overlay {
  position: absolute; inset: 0; z-index: 10;
  background: rgba(5, 10, 20, 0.75); backdrop-filter: blur(4px);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 16px; border-radius: 8px; text-align: center;
}
.feature-lock-overlay p { font-size: 0.85rem; color: var(--muted); max-width: 220px; }
.feature-lock-overlay button {
  background: var(--green); color: #050a14; border: none; padding: 8px 16px;
  border-radius: 6px; font-weight: 700; cursor: pointer; font-family: var(--ui);
}
`;

export default function FeatureLock({ locked, message, onUpgrade, children }) {
  if (!locked) return children;
  return (
    <div className="feature-lock-wrap">
      <style>{lockCss}</style>
      {children}
      <div className="feature-lock-overlay">
        <span style={{ fontSize: "1.5rem" }}>🔒</span>
        <p>{message}</p>
        <button type="button" onClick={onUpgrade}>Upgrade to Plus</button>
      </div>
    </div>
  );
}
