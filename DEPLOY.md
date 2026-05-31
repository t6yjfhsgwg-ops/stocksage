# StockSage — Deploy & Production Guide

Deploy the **Vite React app** + **serverless market API** on Vercel (recommended). One repo, automatic HTTPS, global CDN.

```
User  →  Vercel CDN (dist/)  →  SPA
              ↓
         /api/chart  →  Yahoo Finance (server-side, no browser CORS)
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ (22 recommended) |
| Git | Any recent |
| GitHub account | For Vercel import |
| Vercel account | Free tier works |

---

## Part 1 — Push to GitHub

```powershell
cd c:\Users\anil1299\projects\stocksage
git init
git add .
git commit -m "StockSage production deploy"
git remote add origin https://github.com/YOUR_USER/stocksage.git
git push -u origin main
```

**Never commit:** `.env`, API keys, `node_modules/`.

---

## Part 2 — Deploy on Vercel

### 1. Import project

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project**
2. Import your GitHub repo
3. **Root Directory:** `stocksage` (if repo is monorepo) or leave blank if repo root is StockSage
4. Framework Preset: **Vite** (auto-detected)
5. Build Command: `npm run build`
6. Output Directory: `dist`
7. Click **Deploy**

`vercel.json` in the repo already configures SPA routing, security headers, and `/api` routes.

### 2. Environment variables (Production)

Vercel → Project → **Settings** → **Environment Variables**:

| Name | Value | Environments |
|------|--------|--------------|
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` | Production |
| `VITE_USE_MARKET_API` | `true` | Production, Preview |

Replace `your-app.vercel.app` with your real Vercel URL after first deploy.

Optional (custom domain):

```
ALLOWED_ORIGINS=https://stocksage.yourdomain.com,https://your-app.vercel.app
```

Redeploy after changing variables (**Deployments** → ⋯ → **Redeploy**).

### 3. Verify deployment

| URL | Expected |
|-----|----------|
| `https://YOUR_APP.vercel.app` | StockSage dashboard loads |
| `https://YOUR_APP.vercel.app/api/health` | `{"ok":true,"service":"stocksage-api"}` |
| `https://YOUR_APP.vercel.app/api/chart?symbol=AAPL&range=5d&interval=1d` | Yahoo JSON (chart result) |

Open the app → watchlist should load prices (no corsproxy dependency in production).

---

## Part 3 — Custom domain (optional)

1. Vercel → **Settings** → **Domains**
2. Add `stocksage.yourdomain.com`
3. Add DNS records Vercel shows (CNAME or A)
4. Update `ALLOWED_ORIGINS` to include the custom domain
5. Redeploy

---

## Part 4 — Local production build test

Before deploying:

```powershell
cd c:\Users\anil1299\projects\stocksage
npm install
npm run build
npm run preview
```

Open `http://localhost:4173` — static preview (API routes need `vercel dev` for full API test locally).

**Full local prod parity:**

```powershell
npx vercel dev
```

Uses Vercel’s `/api` functions locally.

**Daily development:**

```powershell
.\start.ps1
# or: npm run dev
```

`npm run dev` includes `/api/chart` via Vite middleware (same as production).

---

## Production-ready checklist

### Done in this repo

- [x] `npm run build` → optimized `dist/`
- [x] SPA routing (`vercel.json` rewrites)
- [x] Security headers (X-Frame-Options, nosniff, etc.)
- [x] Same-origin `/api/chart` proxy (no public CORS proxy in prod)
- [x] `/api/health` monitoring endpoint
- [x] Asset caching headers
- [x] Code-split chunks (react, recharts)
- [x] `.env.example` documented

### You should do before launch

- [ ] Set `ALLOWED_ORIGINS` to your real domain (not `*`)
- [ ] Add custom domain + HTTPS (Vercel provides SSL)
- [ ] Test watchlist, live quotes, and chat on production URL
- [ ] Add disclaimer / terms page if public users will use it
- [ ] **Do not** expose Anthropic API keys in the browser for production — use a backend proxy (future)

### Recommended next steps (scale)

| Priority | Item |
|----------|------|
| High | Server-side `/api/chat` for Claude (hide API key) |
| High | Rate limiting on `/api/chart` (Upstash Redis or Vercel KV) |
| Medium | Error monitoring (Sentry) |
| Medium | Analytics (Vercel Analytics or Plausible) |
| Medium | Finnhub/Polygon for licensed data + WebSockets |
| Low | Auth (Clerk) + Stripe for real Plus billing |

See [docs/REALTIME.md](docs/REALTIME.md) for live data upgrades.

---

## Alternative hosts

| Host | Notes |
|------|--------|
| **Netlify** | `npm run build`, publish `dist/`, add `_redirects` for SPA; move `api/` to Netlify Functions |
| **Cloudflare Pages** | Static `dist/` + Cloudflare Workers for API |
| **Railway** | Run static `dist/` with Node server serving API (see below) |

### Railway (optional separate API)

If you prefer API on Railway and frontend on Vercel:

1. Deploy `server/` (future) or duplicate `api/chart` as Express on Railway
2. Set `VITE_API_URL=https://your-api.up.railway.app` on Vercel

Current setup uses **Vercel serverless only** — no Railway required.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Blank page after deploy | Check **Root Directory** and `dist` output; open browser console |
| 404 on refresh | Ensure `vercel.json` SPA rewrite exists |
| “Fetch failed” / no prices | Test `/api/health` and `/api/chart?symbol=AAPL`; check Vercel function logs |
| CORS errors | Set `ALLOWED_ORIGINS` to exact frontend URL |
| Build fails on Vercel | Set Node 20 in Vercel → Settings → Node.js Version |
| Live quotes slow | Expected with polling; see REALTIME.md |

### Vercel function logs

**Deployments** → select deployment → **Functions** → `api/chart` → logs.

---

## GitHub → auto deploy

Every push to `main` triggers a new Vercel deployment by default.

```powershell
git add .
git commit -m "Update features"
git push
```

---

## Security notes

- Market data is fetched **server-side** on Vercel — Yahoo URL is not exposed to clients as a direct call.
- User Anthropic keys in Settings stay in **localStorage** — acceptable for demo only; move to server for production AI.
- Freemium “Plus trial” is client-side demo — integrate Stripe before charging real users.

---

*StockSage is for education and research. Not financial advice.*
