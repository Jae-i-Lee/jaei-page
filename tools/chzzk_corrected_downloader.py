#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CHANNEL_ID = "2048d5800616cc805f41b187c5868882"
PAGE_SIZE = 24
OUT = Path("output")
LOG = Path("logs")
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/151 Safari/537.36"


@dataclass(frozen=True)
class Clip:
    uid: str
    title: str
    created: str
    duration: float
    views: int
    url: str


def get_json(url: str) -> Any:
    last_error: Exception | None = None
    for attempt in range(6):
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "application/json",
                    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
                    "Referer": "https://chzzk.naver.com/",
                },
            )
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.loads(response.read().decode("utf-8-sig"))
        except Exception as exc:
            last_error = exc
            if attempt < 5:
                time.sleep(min(2**attempt, 16))
    raise RuntimeError(f"GET failed: {url}: {last_error}")


def pick(mapping: dict[str, Any], *keys: str, default: Any = "") -> Any:
    for key in keys:
        value = mapping.get(key)
        if value not in (None, ""):
            return value
    return default


def rows(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []
    candidates: list[Any] = []
    content = payload.get("content")
    if isinstance(content, dict):
        candidates.extend(content.get(key) for key in ("data", "clips", "items"))
    candidates.extend(payload.get(key) for key in ("data", "clips", "items"))
    for candidate in candidates:
        if isinstance(candidate, list):
            return [item for item in candidate if isinstance(item, dict)]
    return []


def fetch_clips() -> list[Clip]:
    result: list[Clip] = []
    seen: set[str] = set()

    # CHZZK의 이 목록 API는 1-based 페이지입니다. page=0은 page=1과 같은 첫 페이지를 반환합니다.
    for page in range(1, 1001):
        query = urllib.parse.urlencode(
            {
                "filterType": "ALL",
                "orderType": "RECENT",
                "page": page,
                "size": PAGE_SIZE,
            }
        )
        items: list[dict[str, Any]] | None = None
        errors: list[str] = []
        for version in ("v1", "v2"):
            try:
                endpoint = f"https://api.chzzk.naver.com/service/{version}/channels/{CHANNEL_ID}/clips?{query}"
                items = rows(get_json(endpoint))
                break
            except Exception as exc:
                errors.append(str(exc))
        if items is None:
            raise RuntimeError(" | ".join(errors))
        if not items:
            break

        added = 0
        for item in items:
            uid = str(pick(item, "clipUID", "clipUid", "clipId", "clipNo")).strip()
            if not uid or uid in seen:
                continue
            seen.add(uid)
            added += 1
            result.append(
                Clip(
                    uid=uid,
                    title=str(pick(item, "clipTitle", "title", "contentTitle", default=f"clip_{uid}")),
                    created=str(pick(item, "createdDate", "publishDate", "createdAt")),
                    duration=float(pick(item, "duration", "clipDuration", default=0) or 0),
                    views=int(float(pick(item, "readCount", "viewCount", "views", default=0) or 0)),
                    url=f"https://chzzk.naver.com/clips/{uid}",
                )
            )

        print(f"API page {page}: received={len(items)}, added={added}, total={len(result)}", flush=True)
        if len(items) < PAGE_SIZE:
            break
        if added == 0:
            raise RuntimeError(f"페이지 {page}에서 새 ID가 하나도 없어 페이지네이션 오류로 중단합니다.")

    return result


def safe_filename(value: str, limit: int = 180) -> str:
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value)
    value = re.sub(r"\s+", " ", value).strip(" .")
    return (value or "제목없음")[:limit].rstrip(" .")


def day(value: str) -> str:
    match = re.search(r"(\d{4})[-./](\d{1,2})[-./](\d{1,2})", value or "")
    if not match:
        return "날짜미상"
    return f"{int(match[1]):04d}-{int(match[2]):02d}-{int(match[3]):02d}"


def write_manifest(clips: list[Clip], folder: Path) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "클립_목록.json").write_text(
        json.dumps([asdict(clip) for clip in clips], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    with (folder / "클립_목록.csv").open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=["uid", "title", "created", "duration", "views", "url"])
        writer.writeheader()
        writer.writerows(asdict(clip) for clip in clips)


def run(command: list[str], log_path: Path) -> int:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    print("RUN:", subprocess.list2cmdline(command), flush=True)
    with log_path.open("a", encoding="utf-8", errors="replace") as file:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        assert process.stdout is not None
        for line in process.stdout:
            sys.stdout.write(line)
            file.write(line)
        return process.wait()


def download_clip(clip: Clip, folder: Path, threads: int) -> dict[str, Any]:
    name = safe_filename(f"{day(clip.created)}_{clip.title}_[{clip.uid}]")
    final = folder / f"{name}.mp4"
    temporary = folder / f".{name}.part.ts"
    stream_log = LOG / f"clip_{clip.uid}.log"
    ffmpeg_log = LOG / f"clip_{clip.uid}_ffmpeg.log"
    folder.mkdir(parents=True, exist_ok=True)
    final.unlink(missing_ok=True)
    temporary.unlink(missing_ok=True)

    stream_command = [
        "streamlink",
        "--force",
        "--retry-open", "5",
        "--stream-segment-attempts", "12",
        "--stream-segment-timeout", "30",
        "--stream-timeout", "120",
        "--stream-segment-threads", str(threads),
        "--output", str(temporary),
        clip.url,
        "best",
    ]

    for attempt in range(3):
        if run(stream_command, stream_log) == 0 and temporary.exists() and temporary.stat().st_size > 0:
            remux_command = [
                "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y",
                "-fflags", "+genpts",
                "-i", str(temporary),
                "-map", "0:v:0?", "-map", "0:a:0?",
                "-c", "copy",
                "-movflags", "+faststart",
                str(final),
            ]
            if run(remux_command, ffmpeg_log) == 0 and final.exists() and final.stat().st_size > 0:
                temporary.unlink(missing_ok=True)
                return {"uid": clip.uid, "title": clip.title, "ok": True, "path": str(final), "reason": ""}
        temporary.unlink(missing_ok=True)
        if attempt < 2:
            time.sleep(10 * (attempt + 1))

    return {"uid": clip.uid, "title": clip.title, "ok": False, "path": "", "reason": "재생 스트림 접근 불가"}


def inventory_job(_: argparse.Namespace) -> int:
    clips = fetch_clips()
    folder = OUT / "전체_목록"
    write_manifest(clips, folder)
    summary = {
        "channel_id": CHANNEL_ID,
        "clip_count": len(clips),
        "total_duration_seconds": sum(clip.duration for clip in clips),
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (folder / "요약.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    if len(clips) != 42:
        raise RuntimeError(f"예상한 42개가 아니라 {len(clips)}개가 조회되었습니다.")
    return 0


def clips_job(args: argparse.Namespace) -> int:
    all_clips = fetch_clips()
    if len(all_clips) != 42:
        raise RuntimeError(f"예상한 42개가 아니라 {len(all_clips)}개가 조회되었습니다.")
    selected = [clip for index, clip in enumerate(all_clips) if index % args.parts == args.part]
    folder = OUT / f"클립_파트_{args.part + 1}"
    write_manifest(selected, folder)

    results: list[dict[str, Any]] = []
    for index, clip in enumerate(selected, start=1):
        print(f"[{index}/{len(selected)}] {clip.title} [{clip.uid}]", flush=True)
        result = download_clip(clip, folder, args.threads)
        results.append(result)
        (folder / "다운로드_결과.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    succeeded = sum(bool(item["ok"]) for item in results)
    failed = len(results) - succeeded
    print(f"part={args.part} success={succeeded} failed={failed}", flush=True)
    return 0


def main() -> int:
    OUT.mkdir(exist_ok=True)
    LOG.mkdir(exist_ok=True)
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(required=True)

    inventory = subparsers.add_parser("inventory")
    inventory.set_defaults(function=inventory_job)

    clips = subparsers.add_parser("clips")
    clips.add_argument("--part", type=int, required=True)
    clips.add_argument("--parts", type=int, default=4)
    clips.add_argument("--threads", type=int, default=8)
    clips.set_defaults(function=clips_job)

    args = parser.parse_args()
    return args.function(args)


if __name__ == "__main__":
    raise SystemExit(main())
