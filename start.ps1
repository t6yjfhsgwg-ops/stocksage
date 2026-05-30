# Start StockSage locally (Vite — compiles JSX; do not open index.html directly)
$nodeCandidates = @(
  "C:\Program Files\nodejs\node.exe",
  "$env:LOCALAPPDATA\Programs\cursor\resources\app\resources\helpers\node.exe"
)

$node = $nodeCandidates | Where-Object { Test-Path $_ } | ForEach-Object {
  $v = & $_ -v 2>$null
  if ($v -match 'v(1[89]|[2-9]\d)') { $_ }
} | Select-Object -First 1

if (-not $node) {
  Write-Host "ERROR: Need Node.js 18+ (https://nodejs.org)" -ForegroundColor Red
  exit 1
}

Write-Host "Using Node: $node (& $node -v)" -ForegroundColor DarkGray
Set-Location $PSScriptRoot

if (-not (Test-Path "node_modules\vite")) {
  Write-Host "Installing dependencies..." -ForegroundColor Cyan
  $npm = "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"
  if (-not (Test-Path $npm)) { $npm = "npm" }
  & $node $npm install
}

Write-Host ""
Write-Host "StockSage → http://localhost:5173" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor DarkGray
Write-Host ""

$env:Path = "$(Split-Path $node -Parent);$env:Path"
& $node "$PSScriptRoot\node_modules\vite\bin\vite.js"
