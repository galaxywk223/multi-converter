# AudioToText Desktop

本项目是一个本地运行的音视频转换工具，当前采用 3 层结构：

- `worker/`：Python 本地处理内核，负责 `音频转文字`、`视频转文字`、`视频转音频`
- `frontend/`：React + TypeScript + Vite 现代桌面 UI
- `src-tauri/`：Tauri 2 Rust 桌面壳、任务队列、历史记录、设置存储

## 当前里程碑

- 真实桌面任务流：文件/文件夹导入、递归展开、串行队列、取消任务
- 本地 JSON 设置：输出目录、模型目录、语言、设备偏好、`ffmpegPath`
- SQLite 历史记录：支持失败原因查看和历史任务重跑
- 环境预检：Python worker、`ffmpeg`、模型目录、应用数据目录可写性
- 便携开发版交付：提供 `setup:windows` 和 `doctor` 脚本

## 目录结构

```text
.
|-- frontend/      # React + TypeScript + Vite UI
|-- scripts/       # Windows setup / doctor scripts
|-- src-tauri/     # Tauri 2 Rust shell, IPC, history store, settings store
|-- worker/        # Python worker CLI and media pipeline
|-- run.py         # Python worker entrypoint wrapper
`-- requirements.txt
```

## 路径一：当前开发机快速启动

首次准备环境：

```powershell
npm run setup:windows
```

检查环境：

```powershell
npm run doctor
```

启动桌面开发版：

```powershell
npm run dev
```

常用检查：

```powershell
npm run worker:check
npm run frontend:build
npm run frontend:lint
npm run tauri:check
```

## 路径二：另一台 Windows x64 机器如何跑通

目标平台默认是 `Windows 10/11 x64`。

### 1. 先准备系统依赖

- 安装 `Python 3.13`
- 安装 `Node.js 24+`
- 安装 Rust stable toolchain
- 安装 `ffmpeg`，或者准备一个本地 `ffmpeg.exe` 路径

### 2. 拉下仓库后执行

```powershell
npm run setup:windows
npm run doctor
```

### 3. 启动应用

```powershell
npm run dev
```

### 4. 首次运行建议

- 先进入“模型管理”，确认是否检测到本地模型
- 如果没有模型，点击安装模型，或手动选择已有模型目录
- 如果 `doctor` 没找到 `ffmpeg`，可以在“设置”页填写 `ffmpegPath`
- 先用 `CPU` 模式跑一条小音频，确认基本链路闭环

## 运行说明

- 输入支持文件和文件夹；文件夹会递归展开并自动过滤不支持的媒体类型
- 当前固定 `单并发 FIFO`，避免 GPU 和 `ffmpeg` 互相抢占
- 输出文本统一为 `UTF-8`
- 设置保存在 Tauri 应用数据目录下的 `settings.json`
- 历史记录保存在同一目录下的 `history.sqlite3`

## 依赖说明

- Python worker：`faster-whisper`、`torch`
- 桌面端：Tauri 2、React 19、TypeScript、Tailwind CSS v4
- Whisper 模型默认不提交到仓库，运行时优先复用本机已有模型
- 当前版本不包含：
  - NSIS 安装包
  - `ffmpeg` sidecar 打包
  - `whisper.cpp` 替换

## 当前限制

- 目前仍以“便携开发版”为主，不是可分发安装版
- `ffmpeg` 仍通过系统 `PATH` 或设置页的 `ffmpegPath` 提供
- 模型缺失时，任务不会自动开始下载；需要先在“模型管理”页准备好模型
