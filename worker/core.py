from __future__ import annotations

import os
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from faster_whisper import WhisperModel

from .events import EventWriter

AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".aac", ".ogg"}
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".avi", ".webm", ".flv", ".m4v"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".webp", ".tif", ".tiff"}
APP_DIR_NAME = "MultiConverter"
LEGACY_APP_DIR_NAME = "AudioToText"


@dataclass(slots=True)
class RunConfig:
    job_type: str
    inputs: list[Path]
    output_dir: Path
    model_name: str = "medium"
    model_dir: Path | None = None
    language: str = "zh"
    device: str = "auto"
    beam_size: int = 5
    initial_prompt: str = "这是一段中文音频内容，请使用简体中文输出，并保留专业术语。"
    ffmpeg_path: str = "ffmpeg"


def detect_device(preferred: str = "auto") -> str:
    if preferred in {"cpu", "cuda"}:
        return preferred
    try:
        import torch
    except Exception:
        return "cpu"
    return "cuda" if torch.cuda.is_available() else "cpu"


def default_model_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA")
    if base:
        root = Path(base)
        legacy = root / LEGACY_APP_DIR_NAME / "models"
        if legacy.exists():
            return legacy
        return root / APP_DIR_NAME / "models"
    return Path.cwd() / "models"


def resolve_input_files(inputs: Iterable[Path], job_type: str) -> list[Path]:
    if job_type == "video_extract_audio":
        valid_extensions = VIDEO_EXTENSIONS
    elif job_type == "video_transcribe":
        valid_extensions = VIDEO_EXTENSIONS
    elif job_type == "image_ocr":
        valid_extensions = IMAGE_EXTENSIONS
    else:
        valid_extensions = AUDIO_EXTENSIONS | {".mp4"}

    resolved: list[Path] = []
    for item in inputs:
        if item.is_dir():
            children = sorted(
                child
                for child in item.rglob("*")
                if child.is_file() and child.suffix.lower() in valid_extensions
            )
            resolved.extend(children)
        elif item.is_file() and item.suffix.lower() in valid_extensions:
            resolved.append(item)

    unique: list[Path] = []
    seen: set[Path] = set()
    for file_path in resolved:
        normalized = file_path.resolve()
        if normalized in seen:
            continue
        seen.add(normalized)
        unique.append(normalized)
    return unique


def format_timestamp(seconds: float) -> str:
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes:02d}:{secs:02d}"


def environment_snapshot(ffmpeg_path: str = "ffmpeg", model_dir: Path | None = None) -> dict[str, object]:
    model_root = (model_dir or default_model_dir()).resolve()
    ffmpeg_available = True
    ffmpeg_version = None
    try:
        result = subprocess.run(
            [ffmpeg_path, "-version"],
            capture_output=True,
            text=True,
            check=False,
            encoding="utf-8",
            errors="ignore",
        )
        ffmpeg_available = result.returncode == 0
        if result.stdout:
            ffmpeg_version = result.stdout.splitlines()[0].strip()
    except FileNotFoundError:
        ffmpeg_available = False

    detected_device = detect_device()
    model_exists = model_root.exists() and any(model_root.rglob("model.bin"))
    ocr_available = can_use_ocr()

    return {
        "pythonVersion": os.sys.version.split()[0],
        "device": detected_device,
        "ffmpegAvailable": ffmpeg_available,
        "ffmpegVersion": ffmpeg_version,
        "defaultModelDir": str(model_root),
        "modelExists": model_exists,
        "ocrAvailable": ocr_available,
    }


def ensure_model(
    model_name: str,
    model_dir: Path | None = None,
    device: str = "auto",
    compute_type: str | None = None,
) -> dict[str, str]:
    resolved_device = detect_device(device)
    resolved_model_dir = (model_dir or default_model_dir()).resolve()
    resolved_model_dir.mkdir(parents=True, exist_ok=True)
    model = WhisperModel(
        model_name,
        device=resolved_device,
        compute_type=compute_type or ("float16" if resolved_device == "cuda" else "float32"),
        download_root=str(resolved_model_dir),
    )
    return {
        "modelName": model_name,
        "device": resolved_device,
        "modelDir": str(resolved_model_dir),
        "modelPath": str(model.model.model_path),
    }


def run_job(config: RunConfig, events: EventWriter) -> dict[str, object]:
    input_files = resolve_input_files(config.inputs, config.job_type)
    if not input_files:
        raise ValueError("未找到可处理的输入文件。")

    config.output_dir.mkdir(parents=True, exist_ok=True)
    events.progress(
        stage="preflight",
        percent=2,
        current_file=None,
        total_files=len(input_files),
        message="输入文件检查完成，开始执行任务。",
    )

    if config.job_type == "video_extract_audio":
        outputs = extract_audio(config, input_files, events)
    elif config.job_type == "image_ocr":
        outputs = extract_text_from_images(config, input_files, events)
    else:
        outputs = transcribe_media(config, input_files, events)

    return {
        "jobType": config.job_type,
        "totalFiles": len(input_files),
        "outputDir": str(config.output_dir.resolve()),
        "outputs": [str(path) for path in outputs],
    }


def transcribe_media(config: RunConfig, files: list[Path], events: EventWriter) -> list[Path]:
    resolved_device = detect_device(config.device)
    compute_type = "float16" if resolved_device == "cuda" else "float32"
    model_dir = (config.model_dir or default_model_dir()).resolve()
    model_dir.mkdir(parents=True, exist_ok=True)

    events.log("info", f"Loading Whisper model {config.model_name} on {resolved_device}")
    model = WhisperModel(
        config.model_name,
        device=resolved_device,
        compute_type=compute_type,
        download_root=str(model_dir),
    )

    outputs: list[Path] = []
    total = len(files)
    for index, file_path in enumerate(files, start=1):
        started_at = time.time()
        events.progress(
            stage="transcribing",
            percent=((index - 1) / total) * 100,
            current_file=file_path.name,
            total_files=total,
            message=f"读取 {file_path.name}",
        )

        output_file = config.output_dir / f"{file_path.stem}.txt"
        segments, _info = model.transcribe(
            str(file_path),
            language=config.language,
            initial_prompt=config.initial_prompt,
            beam_size=config.beam_size,
        )

        lines: list[str] = []
        for segment in segments:
            text = segment.text.strip()
            if not text:
                continue
            lines.append(text)
            events.log(
                "debug",
                f"[{format_timestamp(segment.start)} -> {format_timestamp(segment.end)}] {text}",
            )

        write_text_output(output_file, file_path.name, lines, events, total, index, "writing")

        elapsed = time.time() - started_at
        percent = (index / total) * 100
        remaining = total - index
        events.progress(
            stage="transcribing",
            percent=percent,
            current_file=file_path.name,
            total_files=total,
            eta=round(elapsed * remaining, 2) if remaining else 0,
            message=f"已生成 {output_file.name}",
        )
        outputs.append(output_file.resolve())

    return outputs


def extract_text_from_images(config: RunConfig, files: list[Path], events: EventWriter) -> list[Path]:
    ocr = create_ocr_engine()
    outputs: list[Path] = []
    total = len(files)

    for index, file_path in enumerate(files, start=1):
        started_at = time.time()
        events.progress(
            stage="recognizing",
            percent=((index - 1) / total) * 100,
            current_file=file_path.name,
            total_files=total,
            message=f"识别 {file_path.name}",
        )

        result, _elapsed = ocr(str(file_path))
        lines = extract_ocr_lines(result)
        output_file = config.output_dir / f"{file_path.stem}.txt"
        write_text_output(output_file, file_path.name, lines, events, total, index, "writing")

        elapsed = time.time() - started_at
        percent = (index / total) * 100
        remaining = total - index
        events.progress(
            stage="recognizing",
            percent=percent,
            current_file=file_path.name,
            total_files=total,
            eta=round(elapsed * remaining, 2) if remaining else 0,
            message=f"已生成 {output_file.name}",
        )
        outputs.append(output_file.resolve())

    return outputs


def extract_audio(config: RunConfig, files: list[Path], events: EventWriter) -> list[Path]:
    outputs: list[Path] = []
    total = len(files)
    for index, file_path in enumerate(files, start=1):
        output_file = config.output_dir / f"{file_path.stem}.mp3"
        started_at = time.time()
        events.log("info", f"Extracting audio from {file_path.name}")
        command = [
            config.ffmpeg_path,
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostats",
            "-progress",
            "pipe:1",
            "-y",
            "-i",
            str(file_path),
            "-vn",
            "-acodec",
            "libmp3lame",
            "-b:a",
            "192k",
            str(output_file),
        ]
        try:
            process = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                universal_newlines=True,
            )
        except FileNotFoundError as exc:
            raise RuntimeError("未找到 ffmpeg，可执行文件未安装或未配置。") from exc

        last_timestamp = ""
        while True:
            line = process.stdout.readline() if process.stdout else ""
            if not line:
                if process.poll() is not None:
                    break
                continue
            line = line.strip()
            if line.startswith("out_time_ms="):
                raw = line.split("=", 1)[1]
                if raw.isdigit():
                    stamp = format_timestamp(int(raw) / 1_000_000)
                    if stamp != last_timestamp:
                        last_timestamp = stamp
                        base_percent = ((index - 1) / total) * 100
                        intra_percent = min(int(raw) / 3_000_000, 0.99) * (100 / total)
                        events.progress(
                            stage="extracting",
                            percent=min(base_percent + intra_percent, 99.0),
                            current_file=file_path.name,
                            total_files=total,
                            message=f"{file_path.name} -> {stamp}",
                        )
            elif line == "progress=end":
                break

        return_code = process.wait()
        if return_code != 0:
            error_output = process.stderr.read().strip() if process.stderr else ""
            raise RuntimeError(error_output or f"ffmpeg failed with exit code {return_code}")

        elapsed = time.time() - started_at
        remaining = total - index
        events.progress(
            stage="extracting",
            percent=(index / total) * 100,
            current_file=file_path.name,
            total_files=total,
            eta=round(elapsed * remaining, 2) if remaining else 0,
            message=f"已生成 {output_file.name}",
        )
        outputs.append(output_file.resolve())
    return outputs


def write_text_output(
    output_file: Path,
    source_name: str,
    lines: list[str],
    events: EventWriter,
    total: int,
    index: int,
    stage: str,
) -> None:
    events.progress(
        stage=stage,
        percent=min(((index - 1) / total) * 100 + 5, 99),
        current_file=source_name,
        total_files=total,
        message=f"写入 {output_file.name}",
    )
    with output_file.open("w", encoding="utf-8") as handle:
        handle.write(f"文件名: {source_name}\n")
        handle.write("-" * 30 + "\n\n")
        handle.write("\n".join(lines))
        if lines:
            handle.write("\n")


def can_use_ocr() -> bool:
    try:
        from rapidocr_onnxruntime import RapidOCR  # noqa: F401
    except Exception:
        return False
    return True


def create_ocr_engine():
    try:
        from rapidocr_onnxruntime import RapidOCR
    except Exception as exc:
        raise RuntimeError("未安装图片 OCR 依赖，请先重新执行 npm run setup:windows。") from exc
    return RapidOCR()


def extract_ocr_lines(result: object) -> list[str]:
    if not result:
        return []

    lines: list[str] = []
    for item in result:
        if not isinstance(item, (list, tuple)) or len(item) < 2:
            continue
        text_info = item[1]
        if isinstance(text_info, (list, tuple)) and text_info:
            text = str(text_info[0]).strip()
        else:
            text = str(text_info).strip()
        if text:
            lines.append(text)
    return lines


def requires_ffmpeg(job_type: str) -> bool:
    return job_type == "video_extract_audio"


def requires_whisper_model(job_type: str) -> bool:
    return job_type in {"audio_transcribe", "video_transcribe"}
