import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 1000 / 60);

  if (minutes < 1) {
    return "刚刚";
  }
  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时前`;
  }

  const days = Math.round(hours / 24);
  return `${days} 天前`;
}

export function formatJobType(value: string) {
  switch (value) {
    case "audio_transcribe":
      return "音频转文字";
    case "video_transcribe":
      return "视频转文字";
    case "video_extract_audio":
      return "视频转音频";
    case "image_ocr":
      return "图片提取文字";
    default:
      return value;
  }
}

export function formatPercent(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

export function getPathLeaf(value: string) {
  const parts = value.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? value;
}

export function compactFileLabel(value: string, max = 36) {
  const leaf = getPathLeaf(value).trim();
  if (!leaf || leaf.length <= max) {
    return leaf || value;
  }

  const extensionIndex = leaf.lastIndexOf(".");
  const hasExtension = extensionIndex > 0 && extensionIndex < leaf.length - 1;
  const extension = hasExtension ? leaf.slice(extensionIndex) : "";
  const base = hasExtension ? leaf.slice(0, extensionIndex) : leaf;
  const safeMax = Math.max(max, 12);
  const reserved = extension ? extension.length : 0;
  const available = Math.max(6, safeMax - reserved - 1);
  const head = Math.max(4, Math.ceil(available * 0.55));
  const tail = Math.max(2, available - head);

  return `${base.slice(0, head)}...${base.slice(-tail)}${extension}`;
}
