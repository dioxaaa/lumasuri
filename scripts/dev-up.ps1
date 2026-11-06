# Starts the LumaSuri stack on Windows WITHOUT Docker.
# Pieces: Redis (tools/redis), Bifrost gateway (tools/bifrost-http.exe), the API + web UI.
# One-time setup:
#   1. npx -y @maximhq/bifrost        (downloads the binary; copy it to tools\bifrost-http.exe)
#   2. Download https://github.com/tporadowski/redis/releases -> extract to tools\redis
#   3. ollama pull qwen2.5:3b ; ollama pull qwen2.5:1.5b   (or use any local model via env vars)
#   4. optional: $env:TAVILY_API_KEY="tvly-..."            (works keyless without it)
$root = Split-Path -Parent $PSScriptRoot

Start-Process -WindowStyle Hidden -FilePath "$root\tools\redis\redis-server.exe" -ArgumentList '--port 6379'
Start-Process -WindowStyle Hidden -FilePath "$root\tools\bifrost-http.exe" -ArgumentList '-app-dir', "$root\bifrost\data", '-port 8080' -WorkingDirectory $root
Start-Sleep -Seconds 8
Write-Host 'Redis + Bifrost starting (Bifrost UI: http://localhost:8080)'
Set-Location $root
# Fast local defaults: qwen2.5:1.5b answers ~2x faster on CPU. Swap in 3b for max accuracy.
$env:LUMASURI_EXTRACT_MODEL = 'ollama/qwen2.5:1.5b'
$env:LUMASURI_VERDICT_MODEL = 'ollama/qwen2.5:1.5b'
$env:LUMASURI_FALLBACKS = 'ollama/qwen2.5:1.5b,ollama/qwen2.5:3b'
npm run dev
