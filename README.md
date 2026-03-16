# AudioToText Desktop

本项目是一个本地运行的音视频转换工具，当前包含两层能力：

- `worker/`：Python 本地处理内核，负责 `音频转文字`、`视频转文字`、`视频转音频`
- `frontend/ + src-tauri/`：Tauri 2 桌面端壳与现代 UI 工作台

## 当前能力

- 音频转文字
- 视频转文字
- 视频转音频
- 本地模型检测与安装入口
- 任务队列、实时日志、历史记录、设置页桌面骨架

## 项目结构

```text
.
|-- frontend/      # React + TypeScript + Vite UI
|-- src-tauri/     # Tauri 2 Rust shell, IPC, history store
|-- worker/        # Python worker CLI and media pipeline
|-- run.py         # Python worker entrypoint wrapper
`-- requirements.txt
```

## 本地开发

Python worker:

```powershell
venv\Scripts\python.exe -m worker.cli detect-environment
```

前端预览:

```powershell
cd frontend
npm install
npm run dev
```

前端构建:

```powershell
cd frontend
npm run build
```

桌面端联调:

```powershell
cd frontend
npm run dev:desktop
```

## 依赖说明

- Python 3.13
- `faster-whisper`
- `torch` CUDA 版本
- `ffmpeg`
- Node.js 24+
- Rust stable toolchain

## 当前备注

- Whisper 模型默认不提交到仓库，运行时优先检查本机已有模型。
- `ffmpeg` sidecar 还需要在打包前放入 `src-tauri/binaries/`。
- 如果 Tauri 编译失败，优先检查本机 Rust toolchain 是否完整安装。
