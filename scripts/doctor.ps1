$ErrorActionPreference = "Continue"

function Check-Command($label, $command) {
  if (Get-Command $command -ErrorAction SilentlyContinue) {
    $version = try {
      if ($command -eq "ffmpeg") {
        (& $command -version | Select-Object -First 1)
      } else {
        (& $command --version | Select-Object -First 1)
      }
    } catch {
      "available"
    }
    Write-Host "[OK] ${label}: $version" -ForegroundColor Green
    return $true
  }

  Write-Host "[MISS] ${label}: command '$command' not found" -ForegroundColor Yellow
  return $false
}

Write-Host "AudioToText Doctor" -ForegroundColor Cyan
Write-Host ""

$hasNode = Check-Command "Node.js" "node"
$hasNpm = Check-Command "npm" "npm"
$hasRust = Check-Command "rustc" "rustc"
$hasCargo = Check-Command "cargo" "cargo"
$hasFfmpeg = Check-Command "ffmpeg" "ffmpeg"

if (Test-Path "venv\Scripts\python.exe") {
  Write-Host "[OK] Python venv: $( & 'venv\Scripts\python.exe' --version )" -ForegroundColor Green
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
  Write-Host "[WARN] Python venv: missing, run 'npm run setup:windows' first" -ForegroundColor Yellow
} else {
  Write-Host "[MISS] Python: no venv and no 'py' command" -ForegroundColor Yellow
}

if (Test-Path "venv\Scripts\python.exe") {
  Write-Host ""
  Write-Host "Worker environment snapshot:" -ForegroundColor Cyan
  & "venv\Scripts\python.exe" -m worker.cli detect-environment
}

Write-Host ""
if (-not ($hasNode -and $hasNpm -and $hasCargo -and $hasRust)) {
  Write-Host "Desktop dependencies are incomplete. Install Node.js and the Rust toolchain first." -ForegroundColor Yellow
} elseif (-not $hasFfmpeg) {
  Write-Host "ffmpeg is missing. Put ffmpeg on PATH or configure ffmpegPath in the app settings." -ForegroundColor Yellow
} else {
  Write-Host "Primary dependency check finished." -ForegroundColor Green
}
