$ErrorActionPreference = "Stop"

function Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Exe,
    [string[]]$CommandArgs = @()
  )

  & $Exe @CommandArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $Exe $($CommandArgs -join ' ')"
  }
}

function Resolve-PythonLauncher {
  if (Get-Command python -ErrorAction SilentlyContinue) {
    $version = (& python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null)
    if ($LASTEXITCODE -eq 0 -and $version -eq "3.13") {
      return @{
        Exe = "python"
        Args = @("-m", "venv", "venv")
      }
    }
  }

  if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3.13 -c "import sys" *> $null
    if ($LASTEXITCODE -eq 0) {
      return @{
        Exe = "py"
        Args = @("-3.13", "-m", "venv", "venv")
      }
    }
  }

  throw "Python 3.13 was not found. Install Python 3.13 and make sure 'python' or 'py -3.13' is available."
}

function Ensure-Venv {
  if (Test-Path "venv\Scripts\python.exe") {
    return
  }

  $pythonLauncher = Resolve-PythonLauncher
  Step "Create Python virtual environment"
  Invoke-CheckedCommand $pythonLauncher.Exe $pythonLauncher.Args
}

Step "Install frontend dependencies"
Invoke-CheckedCommand "npm" @("install", "--prefix", "frontend")

Ensure-Venv

Step "Upgrade pip"
Invoke-CheckedCommand "venv\Scripts\python.exe" @("-m", "pip", "install", "--upgrade", "pip")

Step "Install Python requirements"
Invoke-CheckedCommand "venv\Scripts\python.exe" @("-m", "pip", "install", "-r", "requirements.txt")

Step "Generate brand assets"
Invoke-CheckedCommand "venv\Scripts\python.exe" @("scripts\generate-logo.py")

Step "Stage ffmpeg sidecar"
Invoke-CheckedCommand "powershell" @("-ExecutionPolicy", "Bypass", "-File", "scripts\stage-ffmpeg-sidecar.ps1")

Step "Build desktop installer"
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
Invoke-CheckedCommand "npx" @("@tauri-apps/cli", "build", "-c", "src-tauri/tauri.conf.json")

$installer = Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" |
  Sort-Object LastWriteTime |
  Select-Object -Last 1

if ($null -eq $installer) {
  throw "Installer was not generated."
}

Step "Done"
Write-Host "Installer ready: $($installer.FullName)" -ForegroundColor Green
