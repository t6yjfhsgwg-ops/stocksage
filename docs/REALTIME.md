# Making StockSage Real-Time

## How it works today

| Layer | Behavior |
|-------|----------|
| **Full refresh** | Settings → 1 / 5 / 15 min — reloads watchlist, signals, predictions, charts |
| **Live quotes** | Top bar **○ Live quotes** / **● LIVE** — polls 1m Yahoo data every 15–60s |
| **Data source** | Yahoo Finance via `corsproxy.io` (browser only, no backend) |

Live mode is **near real-time** (seconds to a minute delay), not exchange tick-by-tick.

---

## Quick start (built-in)

1. Run the app: `.\start.ps1`
2. Click **○ Live quotes** in the plan bar (turns **● LIVE**)
3. Or open **⚙ Settings** → enable **Live polling** → pick 15s (Plus) or 30s
4. Watch **Updated HH:MM:SS** and watchlist prices refresh

**Free:** minimum 30s interval  
**Plus:** 15s interval  

Polling **pauses** when the browser tab is hidden (saves proxy quota).

---

## Why it isn’t true tick-by-tick yet

1. **No WebSocket** — the app only uses HTTP `fetch`.
2. **CORS** — browsers cannot call Yahoo directly; traffic goes through a public proxy (rate limits, latency).
3. **No backend** — v1 stores nothing server-side; all logic runs in the browser.
4. **Yahoo 1m bars** — live mode uses 1-minute candles, not every trade.

---

## Paths to *real* real-time

### Option A — Faster polling (easiest, already in app)

- Live quotes every 15s (Plus)
- Full analytics refresh every 1 min
- **Pros:** No new infrastructure  
- **Cons:** Proxy/Yahoo may throttle; not true ticks

### Option B — Small backend proxy (recommended for production)

```
Browser  →  your-api.example.com  →  Yahoo / Finnhub / Polygon
                ↓
           WebSocket fan-out
```

1. Deploy a Node/Express or Railway service.
2. Server fetches quotes every 1–5s (no CORS).
3. Push to clients via **WebSocket** or **SSE** (`EventSource`).

Example stack:

- **Finnhub** or **Polygon.io** WebSocket (paid free tiers)
- **Socket.io** or raw `ws` on Railway
- Frontend: `useEffect` → `new WebSocket(url)` → update `stocks` state

### Option C — Licensed market data (Bloomberg-grade)

- **Polygon**, **IEX Cloud**, **Alpaca**, **DxFeed**
- Sub-second trades + options chain (for real option premiums)
- Requires API key on **server only** (never in `localStorage`)

### Option D — Vercel + Edge (lightweight)

- Vercel serverless `/api/quote?ticker=AAPL` caches 5–10s
- Client polls your API every 5s (faster than corsproxy, more reliable)

---

## Suggested roadmap

| Phase | Work | Result |
|-------|------|--------|
| 1 ✅ | Live quote polling in UI | 15–60s price updates |
| 2 | `server/` proxy + `/api/quote` | Stable fetches, hide Yahoo URL |
| 3 | WebSocket on server | Push quotes to all clients |
| 4 | Commercial data feed | Tick data + live options chain |

---

## Environment variables (future backend)

```env
FINNHUB_API_KEY=...
POLYGON_API_KEY=...
QUOTE_CACHE_MS=5000
```

---

## Rate-limit tips

- Keep watchlist ≤ 10 symbols in live mode
- Use 30s+ on Free tier
- Do not run live + 1 min full refresh on the same 8 tickers without need
- Replace `corsproxy.io` with your own proxy in production

---

*Not financial advice.*
