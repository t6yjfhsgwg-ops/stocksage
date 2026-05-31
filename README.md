# StockSage — AI Stock Monitor

Bloomberg-style dashboard with live Yahoo Finance data, technical signals, predictions, and AI chat.

**Design document:**
- Markdown: [docs/DESIGN.md](docs/DESIGN.md)
- Word: [docs/StockSage-Design-Document.docx](docs/StockSage-Design-Document.docx)

Regenerate Word from markdown: `python scripts/md_to_docx.py`

## Run locally (required)

StockSage uses **JSX** — you cannot open `index.html` by double-clicking. Use the dev server:

```powershell
cd c:\Users\anil1299\projects\stocksage
powershell -ExecutionPolicy Bypass -File start.ps1
```

Or manually:

```powershell
cd c:\Users\anil1299\projects\stocksage
npm install
npm run dev
```

Browser opens at **http://localhost:5173**

## Build for production

```powershell
npm run build
npm run preview
```

## Deploy (production)

**Full guide:** [DEPLOY.md](DEPLOY.md)

1. Push repo to GitHub  
2. Import on [Vercel](https://vercel.com) → Framework: **Vite**  
3. Set env `ALLOWED_ORIGINS` = your Vercel URL  
4. Deploy — `/api/chart` and `/api/predict*` run server-side (no browser CORS proxy)

Copy [.env.example](.env.example) for variable reference.

## Near real-time (quotes + predictions)

Click **○ Live** in the top bar (or Settings → Live polling):

- **Quotes** — 1m Yahoo data every 15–60s  
- **Predictions** — `/api/predict-batch` refreshes signals & price targets every 30–60s (when deployed with API)

Details: [docs/REALTIME.md](docs/REALTIME.md)

See [docs/REALTIME.md](docs/REALTIME.md) for true tick-by-tick / WebSocket setup.

## Features

- Live watchlist via Yahoo Finance
- Charts + SMA overlays (Recharts)
- BUY/SELL signals, price predictions, single-leg option predictions, spread outlook (verticals, iron condor)
- Daily pick, AI chat (optional Anthropic key in Settings)

## Freemium plans (demo)

- **Free** — 5 watchlist tickers, 10 AI chats/day, 1M/3M charts, limited signals & predictions
- **Plus** — 14-day trial (demo): 20 tickers, unlimited chat, all timeframes, CSV export, full analytics
- Use **Upgrade to Plus** or **Join Free** in the top bar; manage plan in Settings

## Help tour & video script

- In the app: click **❓ Help** for an interactive spotlight tour (try each feature to advance)
- To record a real video: see [HELP-VIDEO-SCRIPT.md](HELP-VIDEO-SCRIPT.md)

_Not financial advice._
