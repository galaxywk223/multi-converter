# Multi Converter

本项目是一个本地运行的多功能转换器，当前支持：

- 图片提取文字
- 音频转文字
- 视频转文字
- 视频转音频

项目结构：

- `worker/`：Python 本地处理内核
- `frontend/`：React + TypeScript + Vite UI
- `src-tauri/`：Tauri 2 桌面壳、任务队列、历史记录、设置存储

## 快速启动

```powershell
npm run setup:windows
npm run doctor
npm run dev
```

## 常用检查

```powershell
npm run worker:check
npm run frontend:build
npm run frontend:lint
npm run tauri:check
```

## 依赖

- Python 3.13
- Node.js 24+
- Rust stable
- `ffmpeg`
- `faster-whisper`
- `torch`
- `rapidocr-onnxruntime`

## 说明

- 文件夹输入会递归展开。
- 文本输出统一为 `UTF-8`。
- 设置保存在应用数据目录下的 `settings.json`。
- 历史记录保存在同目录下的 `history.sqlite3`。
- 图片提取文字不依赖 Whisper 模型。
