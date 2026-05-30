# StockSage — AI Stock Monitor

Bloomberg-style dashboard with live Yahoo Finance data, technical signals, predictions, and AI chat.

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

Deploy the `dist/` folder to Vercel (Framework: Vite).

## Features

- Live watchlist via Yahoo Finance
- Charts + SMA overlays (Recharts)
- BUY/SELL signals, price predictions
- Daily pick, AI chat (optional Anthropic key in Settings)

## Help tour & video script

- In the app: click **❓ Help** (auto-plays on first visit like a video tour)
- To record a real video: see [HELP-VIDEO-SCRIPT.md](HELP-VIDEO-SCRIPT.md)

_Not financial advice._
