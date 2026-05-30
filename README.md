# StockSage — AI Stock Monitor

Bloomberg-style dark dashboard with live Yahoo Finance data, technical signals, JS prediction model, and AI chat.

## Run locally

```powershell
cd c:\Users\anil1299\projects\stocksage
python -m http.server 8080
```

Open **http://localhost:8080** (ES modules require a local server).

## Features

- Live watchlist (Yahoo Finance via CORS proxy)
- Recharts price chart + SMA 20/50
- RSI, MACD, Bollinger, volume composite BUY/SELL signal
- 7d / 30d price prediction (weighted trend + seasonality)
- Daily top pick
- AI chat (local analyst, or add Anthropic API key in Settings)

## Optional: Claude API

Click **⚙ Settings** → paste your Anthropic API key for full Claude responses.

_Not financial advice._
