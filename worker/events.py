from __future__ import annotations

import json
import sys
import uuid
from dataclasses import dataclass
from typing import Any


def generate_task_id() -> str:
    return uuid.uuid4().hex


@dataclass(slots=True)
class EventWriter:
    task_id: str

    def emit(self, event: str, payload: dict[str, Any]) -> None:
        message = {"event": event, "payload": {"taskId": self.task_id, **payload}}
        print(json.dumps(message, ensure_ascii=False), flush=True)

    def log(self, level: str, message: str) -> None:
        self.emit("job.log", {"level": level, "message": message})

    def progress(
        self,
        *,
        stage: str,
        percent: float,
        current_file: str | None,
        total_files: int,
        message: str,
        eta: float | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "stage": stage,
            "percent": round(percent, 2),
            "currentFile": current_file,
            "totalFiles": total_files,
            "message": message,
        }
        if eta is not None:
            payload["eta"] = eta
        self.emit("job.progress", payload)

    def done(self, outputs: list[str], summary: dict[str, Any]) -> None:
        self.emit("job.done", {"outputs": outputs, "summary": summary})

    def error(self, message: str, *, code: str = "JOB_FAILED", details: Any | None = None) -> None:
        payload: dict[str, Any] = {"message": message, "code": code}
        if details is not None:
            payload["details"] = details
        self.emit("job.error", payload)


def print_json(data: dict[str, Any]) -> None:
    json.dump(data, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    sys.stdout.flush()
