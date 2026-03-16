from __future__ import annotations

import argparse
import traceback
from pathlib import Path

from .core import RunConfig, default_model_dir, ensure_model, environment_snapshot, run_job
from .events import EventWriter, generate_task_id, print_json


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="MultiConverter worker CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run", help="Run a conversion job")
    run_parser.add_argument("--job-type", required=True, choices=["audio_transcribe", "video_transcribe", "video_extract_audio", "image_ocr"])
    run_parser.add_argument("--input", dest="inputs", action="append", required=True, help="Input file or folder")
    run_parser.add_argument("--output-dir", required=True, help="Output directory")
    run_parser.add_argument("--output-mode", default="separate", choices=["separate", "merged"])
    run_parser.add_argument("--output-name")
    run_parser.add_argument("--task-id", default=generate_task_id())
    run_parser.add_argument("--model-name", default="medium")
    run_parser.add_argument("--model-dir", default=str(default_model_dir()))
    run_parser.add_argument("--language", default="zh")
    run_parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    run_parser.add_argument("--beam-size", default=5, type=int)
    run_parser.add_argument("--initial-prompt", default="这是一段中文音频内容，请使用简体中文输出，并保留专业术语。")
    run_parser.add_argument("--ffmpeg-path", default="ffmpeg")

    detect_parser = subparsers.add_parser("detect-environment", help="Inspect runtime environment")
    detect_parser.add_argument("--ffmpeg-path", default="ffmpeg")
    detect_parser.add_argument("--model-dir", default=str(default_model_dir()))

    model_parser = subparsers.add_parser("ensure-model", help="Ensure a model is present locally")
    model_parser.add_argument("--model-name", default="medium")
    model_parser.add_argument("--model-dir", default=str(default_model_dir()))
    model_parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "detect-environment":
        print_json(environment_snapshot(args.ffmpeg_path, Path(args.model_dir)))
        return 0

    if args.command == "ensure-model":
        print_json(ensure_model(args.model_name, Path(args.model_dir), args.device))
        return 0

    events = EventWriter(task_id=args.task_id)
    try:
        config = RunConfig(
            job_type=args.job_type,
            inputs=[Path(item) for item in args.inputs],
            output_dir=Path(args.output_dir),
            output_mode=args.output_mode,
            output_name=args.output_name,
            model_name=args.model_name,
            model_dir=Path(args.model_dir),
            language=args.language,
            device=args.device,
            beam_size=args.beam_size,
            initial_prompt=args.initial_prompt,
            ffmpeg_path=args.ffmpeg_path,
        )
        summary = run_job(config, events)
        events.done(summary["outputs"], summary)
        return 0
    except Exception as exc:
        events.error(str(exc), details=traceback.format_exc())
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
