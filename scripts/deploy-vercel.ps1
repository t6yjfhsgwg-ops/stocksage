# StockSage — Vercel deploy helper (Step 2)
# Requires: Node 18+ and Vercel login (one-time)

$node22 = @(
  "$env:LOCALAPPDATA\Programs\cursor\resources\app\resources\helpers\node.exe",
  "C:\Program Files\nodejs\node.exe"
) | Where-Object { Test-Path $_ } | ForEach-Object {
  $v = & $_ -v 2>$null
  if ($v -match 'v(1[89]|[2-9]\d)') { $_ }
} | Select-Object -First 1

if (-not $node22) {
  Write-Host "ERROR: Node.js 18+ required" -ForegroundColor Red
  exit 1
}

Set-Location $PSScriptRoot\..

Write-Host ""
Write-Host "=== StockSage Vercel Deploy ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Option A — Browser (easiest if CLI not logged in):" -ForegroundColor Yellow
Write-Host "  1. Open: https://vercel.com/new/import?s=https://github.com/t6yjfhsgwg-ops/stocksage"
Write-Host "  2. Framework: Vite (auto) | Root: . | Build: npm run build | Output: dist"
Write-Host "  3. Add env vars (after first deploy):" -ForegroundColor Yellow
Write-Host "       ALLOWED_ORIGINS = https://YOUR-PROJECT.vercel.app"
Write-Host "       VITE_USE_MARKET_API = true"
Write-Host "  4. Redeploy from Vercel dashboard"
Write-Host ""
Write-Host "Option B — CLI (this script continues after login):" -ForegroundColor Yellow
Write-Host ""

if (-not (Test-Path "node_modules\vercel")) {
  Write-Host "Installing Vercel CLI..." -ForegroundColor DarkGray
  & $node22 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install -D vercel@latest
}

Write-Host "Starting production deploy (login in browser if prompted)..." -ForegroundColor Green
& $node22 ".\node_modules\vercel\dist\index.js" deploy --prod

Write-Host ""
Write-Host "Test: https://YOUR-URL.vercel.app/api/health" -ForegroundColor Cyan
