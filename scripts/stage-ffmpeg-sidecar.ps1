$ErrorActionPreference = "Stop"

$ffmpeg = Get-Command ffmpeg -ErrorAction Stop
$target = "src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe"

Copy-Item $ffmpeg.Source $target -Force
Write-Host "FFmpeg sidecar staged: $target" -ForegroundColor Green
