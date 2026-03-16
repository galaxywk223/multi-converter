$ErrorActionPreference = "Stop"

function Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Resolve-PythonCommand {
  if (Get-Command py -ErrorAction SilentlyContinue) {
    return "py"
  }
  if (Get-Command python -ErrorAction SilentlyContinue) {
    return "python"
  }
  throw "Python was not found. Install Python 3.13 and make sure 'py' or 'python' is available."
}

Step "Install frontend dependencies"
npm install --prefix frontend

$pythonCommand = Resolve-PythonCommand

if (-not (Test-Path "venv\Scripts\python.exe")) {
  Step "Create Python virtual environment"
  if ($pythonCommand -eq "py") {
    & py -3.13 -m venv venv
  } else {
    & python -m venv venv
  }
}

Step "Upgrade pip"
& "venv\Scripts\python.exe" -m pip install --upgrade pip

Step "Install Python requirements"
& "venv\Scripts\python.exe" -m pip install -r requirements.txt

Step "Done"
Write-Host "Frontend and Python runtime dependencies are ready." -ForegroundColor Green
