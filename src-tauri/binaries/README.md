# FFmpeg Sidecar

Installer builds stage the Windows ffmpeg sidecar here automatically:

- `ffmpeg-x86_64-pc-windows-msvc.exe`

Use `npm run build:installer` from the repository root. The build script will:

1. Ensure the frontend dependencies are installed
2. Ensure the Python `venv` exists and install worker requirements
3. Copy the system `ffmpeg.exe` into this directory
4. Build the NSIS installer through Tauri
