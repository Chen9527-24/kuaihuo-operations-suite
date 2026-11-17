from __future__ import annotations

import concurrent.futures
import json
import os
import re
import shutil
import subprocess
import time
from urllib.parse import urlsplit
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from playwright.sync_api import BrowserContext

from .process_utils import no_window_creationflags, no_window_startupinfo
from .runtime_env import app_root, apply_runtime_defaults, is_frozen_app

apply_runtime_defaults()


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

_WHISPER_MODEL: Any = None
_WHISPER_MODEL_KEY: tuple[str, str, str] | None = None


@dataclass
class SpeechAnalysisSettings:
    whisper_model: str = ""
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    transcript_language: str = "zh"
    capture_timeout_seconds: int = 180
    download_timeout_seconds: int = 300
    max_download_mb: int = 300
    max_audio_mb: int = 24
    max_video_duration_seconds: int = 900
    max_audio_seconds: int = 180
    max_candidates: int = 3
    max_candidate_seconds: int = 90
    max_transcribe_attempts: int = 2
    ffmpeg_path: str = ""

    @classmethod
    def from_env(cls) -> "SpeechAnalysisSettings":
        return cls(
            whisper_model=os.getenv("WHISPER_MODEL", ""),
            whisper_device=os.getenv("WHISPER_DEVICE", "cpu"),
            whisper_compute_type=os.getenv("WHISPER_COMPUTE_TYPE", "int8"),
            transcript_language=os.getenv("TRANSCRIPT_LANGUAGE", "zh"),
            capture_timeout_seconds=_env_int("PLAYWRIGHT_CAPTURE_TIMEOUT_SECONDS", 180),
            download_timeout_seconds=_env_int("DOWNLOAD_TIMEOUT_SECONDS", 300),
            max_download_mb=_env_int("MAX_DOWNLOAD_MB", 300),
            max_audio_mb=_env_int("MAX_AUDIO_MB", 24),
            max_video_duration_seconds=_env_int("MAX_VIDEO_DURATION_SECONDS", 900),
            max_audio_seconds=_env_int("ACS_SPEECH_MAX_AUDIO_SECONDS", 180),
            max_candidates=_env_int("ACS_SPEECH_MAX_CANDIDATES", 3),
            max_candidate_seconds=_env_int("ACS_SPEECH_MAX_CANDIDATE_SECONDS", 90),
            max_transcribe_attempts=_env_int("ACS_SPEECH_MAX_TRANSCRIBE_ATTEMPTS", 2),
            ffmpeg_path=os.getenv("ACS_FFMPEG_PATH", ""),
        )


@dataclass
class SpeechAnalysisResult:
    status: str
    transcript: str = ""
    error: str = ""
    title: str = ""
    description: str = ""
    tags: list[str] = field(default_factory=list)
    duration: int | float | None = None
    media_url: str = ""
    page_url: str = ""
    logs: list[str] = field(default_factory=list)


@dataclass
class CapturedMedia:
    media_path: Path
    page_url: str
    title: str = ""
    description: str = ""
    tags: list[str] = field(default_factory=list)
    duration: int | float | None = None
    media_url: str = ""


@dataclass
class MediaCandidate:
    url: str
    source: str = "page_response"
    exact_target: bool = False
    priority: int = 0
    discovered_at: float = 0.0
    content_type: str = ""


@dataclass
class TargetMediaHint:
    title: str = ""
    description: str = ""
    tags: list[str] = field(default_factory=list)
    duration: int | float | None = None
    media_urls: list[str] = field(default_factory=list)


class SpeechAnalyzer:
    """Playwright media capture -> ffmpeg audio extraction -> faster-whisper transcription.

    This is intentionally aligned with the standalone video-analysis POC.  The key point
    is to prefer the real progressive media captured from the target video page, and avoid
    treating Douyin's preloaded split streams / effects / live streams as the target work.
    """

    def __init__(
        self,
        context: BrowserContext,
        output_dir: Path,
        settings: Optional[SpeechAnalysisSettings] = None,
    ) -> None:
        self.context = context
        self.output_dir = output_dir
        self.settings = settings or SpeechAnalysisSettings.from_env()

    def analyze(
        self,
        video_url: str,
        debug_dir: Path,
        expected_content_id: str | None = None,
        expected_caption: str | None = None,
        source_account_url: str | None = None,
        max_runtime_seconds: int | None = None,
    ) -> SpeechAnalysisResult:
        debug_dir.mkdir(parents=True, exist_ok=True)
        logs: list[str] = []
        try:
            configured_budget = max(1, int(self.settings.capture_timeout_seconds or 1))
            if max_runtime_seconds is not None:
                configured_budget = min(configured_budget, max(1, int(max_runtime_seconds)))
            deadline_at = time.time() + configured_budget
            self._log(logs, f"开始口播分析：{video_url}，总预算={configured_budget}s")
            media, _audio_path, transcript = self._capture_media_extract_and_transcribe(
                video_url,
                debug_dir,
                logs,
                expected_content_id=expected_content_id,
                expected_caption=expected_caption,
                source_account_url=source_account_url,
                deadline_at=deadline_at,
            )
            if media.duration is not None and float(media.duration) > self.settings.max_video_duration_seconds:
                raise RuntimeError(
                    f"video duration {media.duration} seconds exceeds limit {self.settings.max_video_duration_seconds}"
                )
            self._log(logs, f"语音识别完成，转写字符数：{len(transcript)}")
            result = SpeechAnalysisResult(
                status="SUCCESS",
                transcript=transcript,
                title=media.title,
                description=media.description,
                tags=media.tags,
                duration=media.duration,
                media_url=media.media_url,
                page_url=media.page_url,
                logs=logs,
            )
            self._write_success_debug_files(debug_dir, result)
            return result
        except Exception as exc:
            self._log(logs, f"口播分析失败：{exc}")
            return SpeechAnalysisResult(status="FAILED", error=str(exc), logs=logs)
        finally:
            try:
                (debug_dir / "speech_logs.txt").write_text("\n".join(logs), encoding="utf-8")
            except Exception:
                pass


    def _write_success_debug_files(self, debug_dir: Path, result: SpeechAnalysisResult) -> None:
        try:
            (debug_dir / "transcript.txt").write_text(result.transcript or "", encoding="utf-8")
        except Exception:
            pass
        try:
            metadata = {
                "status": result.status,
                "title": result.title,
                "description": result.description,
                "tags": result.tags,
                "duration": result.duration,
                "media_url": result.media_url,
                "page_url": result.page_url,
                "transcript_chars": len(result.transcript or ""),
                "media_file": "source_playwright.mp4",
                "audio_file": "audio.mp3",
                "transcript_file": "transcript.txt",
            }
            (debug_dir / "metadata.json").write_text(json_dumps(metadata), encoding="utf-8")
        except Exception:
            pass

    def _capture_media_extract_and_transcribe(
        self,
        video_url: str,
        debug_dir: Path,
        logs: list[str],
        *,
        expected_content_id: str | None = None,
        expected_caption: str | None = None,
        source_account_url: str | None = None,
        deadline_at: float | None = None,
    ) -> tuple[CapturedMedia, Path, str]:
        """Capture and transcribe the exact work media.

        The standalone video-analysis project is accurate because it starts an isolated
        Playwright browser for one video link and consumes media candidates in the order
        the target detail page actually emits them.  The interception bot used to reuse
        the long-running crawler BrowserContext and also queried the aweme detail API
        through that same driver.  On Douyin this can poison/close the shared Playwright
        connection (`BrowserContext.new_page: Connection closed...`) and can also mix in
        recommendation/preload media from the crawler page.

        To keep the comment crawler stable and align with video-analysis, speech capture
        now runs in its own short-lived Playwright context.  The main context is never
        touched by the speech step.
        """
        def remaining_budget() -> int:
            return _bounded_timeout_seconds(int(self.settings.capture_timeout_seconds or 1), deadline_at)

        try:
            return self._run_dedicated_capture_in_worker_thread(
                video_url,
                debug_dir,
                logs,
                expected_content_id=expected_content_id,
                expected_caption=expected_caption,
                source_account_url=source_account_url,
                capture_timeout_seconds=remaining_budget(),
                force_headless=_env_bool("ACS_SPEECH_HEADLESS", True),
                browser_channel=_sanitize_browser_channel(os.getenv("ACS_SPEECH_BROWSER_CHANNEL", "").strip()),
                attempt_label="headless" if _env_bool("ACS_SPEECH_HEADLESS", True) else "configured",
            )
        except Exception as first_exc:
            # Keep the default experience silent, but when headless Douyin capture fails,
            # retry once with the same visible-Chrome style as video-analysis.  This is a
            # fallback only; set ACS_SPEECH_RETRY_VISIBLE_ON_FAIL=0 to disable it.
            if not _env_bool("ACS_SPEECH_RETRY_VISIBLE_ON_FAIL", False) or not _env_bool("ACS_SPEECH_HEADLESS", True):
                raise
            try:
                remaining = remaining_budget()
            except TimeoutError:
                raise RuntimeError("speech analysis total time budget exhausted before visible fallback") from first_exc
            self._log(logs, f"独立后台口播捕获失败，按 video-analysis 可见浏览器模式重试一次，剩余预算={remaining}s：{str(first_exc)[:300]}")
            return self._run_dedicated_capture_in_worker_thread(
                video_url,
                debug_dir,
                logs,
                expected_content_id=expected_content_id,
                expected_caption=expected_caption,
                source_account_url=source_account_url,
                capture_timeout_seconds=remaining_budget(),
                force_headless=False,
                browser_channel=_sanitize_browser_channel(os.getenv("ACS_SPEECH_VISIBLE_BROWSER_CHANNEL", "").strip()),
                attempt_label="video_analysis_visible_fallback",
            )

    def _run_dedicated_capture_in_worker_thread(
        self,
        video_url: str,
        debug_dir: Path,
        logs: list[str],
        *,
        expected_content_id: str | None = None,
        expected_caption: str | None = None,
        source_account_url: str | None = None,
        capture_timeout_seconds: int | None = None,
        force_headless: bool = True,
        browser_channel: str = "",
        attempt_label: str = "dedicated",
    ) -> tuple[CapturedMedia, Path, str]:
        """Run Playwright Sync API in a clean worker thread.

        The robot/GUI runtime can already be inside an asyncio event loop. Playwright's
        Sync API aborts immediately in that situation, before any page is opened or any
        media can be downloaded. The standalone video-analysis project runs the same
        Sync API from a normal request worker, so we isolate the capture here in a
        one-shot thread and keep the main crawler context untouched.
        """

        def worker() -> tuple[CapturedMedia, Path, str]:
            return self._capture_media_with_dedicated_context(
                video_url,
                debug_dir,
                logs,
                expected_content_id=expected_content_id,
                expected_caption=expected_caption,
                source_account_url=source_account_url,
                capture_timeout_seconds=capture_timeout_seconds,
                force_headless=force_headless,
                browser_channel=browser_channel,
                attempt_label=attempt_label,
            )

        self._log(logs, f"口播捕获已切换到独立线程执行：mode={attempt_label}")
        with concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix="speech-capture") as executor:
            future = executor.submit(worker)
            return future.result()


    def _capture_media_with_dedicated_context(
        self,
        video_url: str,
        debug_dir: Path,
        logs: list[str],
        *,
        expected_content_id: str | None = None,
        expected_caption: str | None = None,
        source_account_url: str | None = None,
        capture_timeout_seconds: int | None = None,
        force_headless: bool = True,
        browser_channel: str = "",
        attempt_label: str = "dedicated",
    ) -> tuple[CapturedMedia, Path, str]:
        target_id = _extract_video_id(expected_content_id or video_url)
        candidates: list[MediaCandidate] = []
        rejected: dict[str, str] = {}
        seen_candidate_keys: set[str] = set()
        profile_dir = (debug_dir / "_speech_playwright_profile").resolve()
        profile_dir.mkdir(parents=True, exist_ok=True)

        def enqueue(url: str, source: str, content_type: str = "") -> None:
            normalized = _normalize_media_url(url)
            if not normalized or not _is_media_url(normalized, content_type) or _is_known_non_content_media(normalized):
                return
            key = _media_candidate_key(normalized)
            if key in seen_candidate_keys:
                return
            seen_candidate_keys.add(key)
            priority = _media_candidate_priority(normalized, source, content_type=content_type)
            candidate = MediaCandidate(
                url=normalized,
                source=source,
                exact_target=False,
                priority=priority,
                discovered_at=time.time(),
                content_type=content_type or "",
            )
            candidates.append(candidate)
            candidates.sort(key=lambda item: (item.priority, -item.discovered_at), reverse=True)
            kind = "audio" if _is_audio_media_url(normalized, content_type) else "video"
            self._log(logs, f"捕获到候选媒体响应：source={source} kind={kind} priority={priority} url={normalized[:160]}")

        self._log(
            logs,
            f"启动独立 Playwright 口播捕获：mode={attempt_label} headless={force_headless} channel={browser_channel or 'playwright-chromium'}",
        )
        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            launch_kwargs: dict[str, Any] = {
                "user_data_dir": str(profile_dir),
                "headless": force_headless,
                "viewport": {"width": 1400, "height": 900},
                "user_agent": USER_AGENT,
                "locale": "zh-CN",
                "timezone_id": "Asia/Shanghai",
                "args": [
                    "--lang=zh-CN",
                    "--mute-audio",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--autoplay-policy=no-user-gesture-required",
                    "--disable-background-media-suspend",
                    "--disable-renderer-backgrounding",
                    "--disable-features=CalculateNativeWinOcclusion",
                ],
            }
            if browser_channel:
                launch_kwargs["channel"] = browser_channel
            context = playwright.chromium.launch_persistent_context(**launch_kwargs)
            try:
                page = context.pages[0] if context.pages else context.new_page()

                def on_response(response: Any) -> None:
                    try:
                        content_type = response.headers.get("content-type", "")
                        if response.status in (200, 206) and _is_media_url(response.url, content_type):
                            enqueue(response.url, "page_response", content_type)
                    except Exception:
                        pass

                page.on("response", on_response)
                page.goto(video_url, wait_until="domcontentloaded", timeout=45_000)
                self._log(logs, f"Playwright 已打开作品页：{page.url}")
                if target_id and target_id not in str(page.url):
                    self._log(logs, f"提示：打开后 URL 未直接包含目标作品ID，target={target_id} current={page.url}")
                self._log(logs, "口播媒体捕获策略：完全按 video-analysis 独立页面顺序处理候选；无音频/不可解码/明显无关时继续下一个。")
                capture_budget_seconds = max(1, int(capture_timeout_seconds or self.settings.capture_timeout_seconds or 1))
                deadline_at = time.time() + capture_budget_seconds
                max_candidates = max(1, int(self.settings.max_candidates or 1))
                max_candidate_seconds = max(10, int(self.settings.max_candidate_seconds or 10))
                candidate_index = 0
                candidate_limit_reached = False
                while time.time() < deadline_at:
                    for source_item in _page_media_sources(page):
                        enqueue(
                            str(source_item.get("url") or ""),
                            str(source_item.get("source") or "media_element"),
                            str(source_item.get("content_type") or ""),
                        )
                    try:
                        page.evaluate(
                            """() => Array.from(document.querySelectorAll('video,audio'))
                                .forEach((media) => {
                                  try { media.muted = true; media.defaultMuted = true; media.volume = 0; } catch (e) {}
                                  try { media.play && media.play().catch(() => {}); } catch (e) {}
                                })"""
                        )
                    except Exception:
                        pass

                    while candidates:
                        if time.time() >= deadline_at:
                            break
                        if candidate_index >= max_candidates:
                            candidate_limit_reached = True
                            candidates.clear()
                            break
                        candidate = candidates.pop(0)
                        candidate_key = _media_candidate_key(candidate.url)
                        if candidate_key in rejected:
                            continue
                        candidate_index += 1
                        candidate_label = f"{candidate_index:03d}"
                        candidate_deadline_at = min(deadline_at, time.time() + max_candidate_seconds)
                        try:
                            kind = "audio" if _is_audio_media_url(candidate.url, candidate.content_type) else "video"
                            self._log(
                                logs,
                                f"准备处理候选媒体 {candidate_label}/{max_candidates}：kind={kind} priority={candidate.priority} "
                                f"候选预算={int(max(candidate_deadline_at - time.time(), 0))}s url={candidate.url[:160]}",
                            )
                            media_path, audio_path = self._prepare_candidate_audio(
                                candidate,
                                page.url,
                                debug_dir,
                                candidate_label,
                                logs,
                                request_context=context,
                                deadline_at=candidate_deadline_at,
                            )
                            if time.time() >= candidate_deadline_at:
                                raise RuntimeError("candidate time budget exhausted before transcription")
                            title, description, tags, duration = _page_video_meta(page)
                            stable_audio = debug_dir / "audio.mp3"
                            if audio_path != stable_audio:
                                try:
                                    shutil.copyfile(audio_path, stable_audio)
                                except Exception:
                                    pass
                            if media_path != audio_path and media_path.exists():
                                stable_media = debug_dir / "source_playwright.mp4"
                                try:
                                    shutil.copyfile(media_path, stable_media)
                                except Exception:
                                    pass
                            self._log(logs, f"口播媒体准备完成：media={media_path.name} audio={audio_path.name}")
                            self._log(logs, "开始本地语音识别")
                            try:
                                transcript = self._transcribe(audio_path, logs)
                            except Exception as exc:
                                if _is_retryable_transcript_error(exc):
                                    raise RuntimeError(f"candidate transcription empty or unusable: {exc}") from exc
                                raise _FatalSpeechAnalysisError(str(exc)) from exc
                            if _should_reject_transcript_as_unrelated(
                                expected_caption,
                                title,
                                description,
                                transcript,
                                candidate,
                            ):
                                raise RuntimeError("candidate transcript/title looks unrelated to target caption; continue next media")
                            return (
                                CapturedMedia(
                                    media_path=media_path,
                                    page_url=page.url,
                                    title=title or (expected_caption or ""),
                                    description=description or (expected_caption or ""),
                                    tags=tags or _extract_tags(expected_caption or ""),
                                    duration=duration,
                                    media_url=candidate.url,
                                ),
                                audio_path,
                                transcript,
                            )
                        except _FatalSpeechAnalysisError:
                            raise
                        except Exception as exc:
                            rejected[candidate_key] = str(exc)
                            self._log(logs, f"候选媒体处理失败，继续监听：{str(exc)[:500]}")
                    if candidate_limit_reached:
                        break
                    page.wait_for_timeout(1000)
                reason = _format_candidate_rejections(rejected)
                if candidate_limit_reached:
                    raise RuntimeError(f"media candidate limit reached ({max_candidates}): {reason or 'all candidates failed'}")
                if reason:
                    raise RuntimeError(f"media capture failed after trying candidates: {reason}")
                raise RuntimeError(f"media capture timeout after {capture_budget_seconds} seconds")
            finally:
                try:
                    context.close()
                except Exception:
                    pass


    def _fetch_target_media_hint(self, aweme_id: str, referer_url: str, logs: list[str]) -> TargetMediaHint | None:
        """Fetch exact media metadata for one aweme id before listening to page noise.

        Direct video pages can preload recommendation / related-feed media while keeping the
        target URL in the address bar.  The detail API, when available in the current
        authenticated context, lets us bind media candidates to the exact target aweme id.
        """
        urls = [
            f"https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id={aweme_id}&aid=6383&device_platform=webapp",
            f"https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id={aweme_id}&aid=1128&device_platform=webapp",
        ]
        last_error = ""
        for api_url in urls:
            try:
                response = self.context.request.get(
                    api_url,
                    headers={
                        "User-Agent": USER_AGENT,
                        "Referer": referer_url,
                        "Accept": "application/json, text/plain, */*",
                    },
                    timeout=max(5, min(self.settings.download_timeout_seconds, 30)) * 1000,
                )
                if not response.ok:
                    last_error = f"HTTP {response.status}"
                    continue
                try:
                    payload = response.json()
                except Exception:
                    payload = json.loads(response.text())
                aweme = _find_aweme_by_id(payload, aweme_id)
                if not aweme:
                    last_error = "response has no matching aweme"
                    continue
                hint = _build_media_hint_from_aweme(aweme)
                self._log(
                    logs,
                    f"作品详情接口命中目标作品：aweme_id={aweme_id}，媒体候选={len(hint.media_urls)}，时长={hint.duration if hint.duration is not None else '-'}",
                )
                return hint
            except Exception as exc:
                last_error = str(exc)[:300]
        self._log(logs, f"作品详情接口未拿到目标媒体，转入页面捕获兜底：aweme_id={aweme_id} reason={last_error or '-'}")
        return None


    def _prepare_candidate_audio(
        self,
        candidate: MediaCandidate,
        page_url: str,
        debug_dir: Path,
        candidate_label: str,
        logs: list[str],
        request_context: Any | None = None,
        deadline_at: float | None = None,
    ) -> tuple[Path, Path]:
        """Prepare a 16 kHz mono audio file for transcription.

        Priority:
        1. If the page exposes an audio resource, download only that audio-like media
           and transcode it to audio.mp3.
        2. If only a video resource exists, ask ffmpeg to read the remote URL and
           extract audio directly, avoiding a large local video file when possible.
        3. If remote extraction fails, fall back to the historical behavior: download
           the video and then extract audio locally.
        """
        if _is_audio_media_url(candidate.url, candidate.content_type):
            self._log(logs, f"优先处理音频候选 {candidate_label}，跳过视频下载：{candidate.url[:160]}")
            media_path = self._download_media(
                candidate.url,
                page_url,
                debug_dir,
                candidate_label,
                logs,
                request_context=request_context,
                content_type_hint=candidate.content_type,
                deadline_at=deadline_at,
            )
            return media_path, self._extract_audio(media_path, debug_dir, candidate_label, logs, deadline_at=deadline_at)

        try:
            self._log(logs, f"未命中音频候选，尝试 ffmpeg 远程抽取视频音频 {candidate_label}：{candidate.url[:160]}")
            audio_path = self._extract_audio_from_remote_media_url(candidate.url, page_url, debug_dir, candidate_label, logs, deadline_at=deadline_at)
            return audio_path, audio_path
        except Exception as exc:
            self._log(logs, f"远程抽音频失败，回退为下载视频后提取：{str(exc)[:300]}")

        media_path = self._download_media(
            candidate.url,
            page_url,
            debug_dir,
            candidate_label,
            logs,
            request_context=request_context,
            content_type_hint=candidate.content_type,
            deadline_at=deadline_at,
        )
        return media_path, self._extract_audio(media_path, debug_dir, candidate_label, logs, deadline_at=deadline_at)

    def _download_media(
        self,
        media_url: str,
        page_url: str,
        debug_dir: Path,
        candidate_label: str,
        logs: list[str],
        request_context: Any | None = None,
        content_type_hint: str = "",
        deadline_at: float | None = None,
    ) -> Path:
        suffix = ".m4a" if _is_audio_media_url(media_url, content_type_hint) else ".mp4"
        target = debug_dir / f"source_playwright_{candidate_label}{suffix}"
        self._log(logs, f"开始下载候选媒体 {candidate_label}：{media_url[:160]}")
        active_context = request_context or self.context
        if active_context is None:
            raise RuntimeError("Playwright context is unavailable for media download")
        response = active_context.request.get(
            media_url,
            headers={
                "User-Agent": USER_AGENT,
                "Referer": page_url,
                "Accept": "*/*",
            },
            timeout=_bounded_timeout_seconds(self.settings.download_timeout_seconds, deadline_at) * 1000,
        )
        if not response.ok:
            raise RuntimeError(f"media download failed: HTTP {response.status}")
        content_type = response.headers.get("content-type", "") or content_type_hint
        if "text/html" in content_type.lower() or "application/json" in content_type.lower():
            raise RuntimeError(f"candidate is not media: Content-Type={content_type}")
        body = response.body()
        head = body[:64].lower()
        looks_like_mp4 = len(body) > 12 and b"ftyp" in body[:32]
        looks_like_m3u8 = head.startswith(b"#extm3u")
        if looks_like_m3u8:
            raise RuntimeError("m3u8 media is not supported")
        if not looks_like_mp4 and "video/" not in content_type.lower() and "audio/" not in content_type.lower():
            raise RuntimeError(f"candidate body is not recognized as media: Content-Type={content_type}")
        max_bytes = max(1, self.settings.max_download_mb) * 1024 * 1024
        if len(body) > max_bytes:
            raise RuntimeError(f"downloaded media exceeds {self.settings.max_download_mb} MB")
        target.write_bytes(body)
        self._log(logs, f"候选媒体下载完成 {candidate_label}：{target.name}，{len(body) / 1024 / 1024:.2f} MB，Content-Type={content_type or '-'}")
        ffmpeg = self._ffmpeg_path()
        if not _probe_media(target, ffmpeg, timeout=min(self.settings.download_timeout_seconds, 30)):
            target.unlink(missing_ok=True)
            raise RuntimeError("downloaded media cannot be decoded by ffmpeg")
        if not _has_audio_stream(target, ffmpeg, timeout=min(self.settings.download_timeout_seconds, 30)):
            target.unlink(missing_ok=True)
            raise RuntimeError("candidate media has no audio stream")
        return target

    def _extract_audio_from_remote_media_url(
        self,
        media_url: str,
        page_url: str,
        debug_dir: Path,
        candidate_label: str,
        logs: list[str],
        deadline_at: float | None = None,
    ) -> Path:
        ffmpeg = self._ffmpeg_path()
        audio_path = debug_dir / f"audio_remote_{candidate_label}.mp3"
        self._log(logs, f"开始用 ffmpeg 远程抽取音频：{candidate_label}")
        headers = f"User-Agent: {USER_AGENT}\r\nReferer: {page_url}\r\nAccept: */*\r\n"
        command = [
            ffmpeg,
            "-y",
            "-headers",
            headers,
            "-rw_timeout",
            str(_bounded_timeout_seconds(self.settings.download_timeout_seconds, deadline_at) * 1_000_000),
            "-i",
            media_url,
            "-t",
            str(max(5, int(self.settings.max_audio_seconds or 5))),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-b:a",
            "64k",
            str(audio_path),
        ]
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=_bounded_timeout_seconds(self.settings.download_timeout_seconds, deadline_at),
            check=False,
            **_subprocess_no_window_kwargs(),
        )
        if completed.returncode != 0:
            raw_output = (completed.stderr or completed.stdout or "").strip()
            detail = _format_subprocess_output(raw_output)
            try:
                (debug_dir / f"ffmpeg_remote_extract_error_{candidate_label}.txt").write_text(raw_output, encoding="utf-8")
            except Exception:
                pass
            if audio_path.exists():
                audio_path.unlink(missing_ok=True)
            raise RuntimeError(f"ffmpeg remote audio extraction failed: {detail}")
        _check_file_size(audio_path, self.settings.max_audio_mb, "audio")
        self._log(logs, f"远程音频抽取完成：{audio_path.name}")
        return audio_path

    def _extract_audio(self, media_path: Path, debug_dir: Path, candidate_label: str, logs: list[str], deadline_at: float | None = None) -> Path:
        ffmpeg = self._ffmpeg_path()
        audio_path = debug_dir / f"audio_{candidate_label}.mp3"
        self._log(logs, f"开始用 ffmpeg 提取音频：{media_path.name}")
        command = [
            ffmpeg,
            "-y",
            "-i",
            str(media_path),
            "-t",
            str(max(5, int(self.settings.max_audio_seconds or 5))),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-b:a",
            "64k",
            str(audio_path),
        ]
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=_bounded_timeout_seconds(self.settings.download_timeout_seconds, deadline_at),
            check=False,
            **_subprocess_no_window_kwargs(),
        )
        if completed.returncode != 0:
            raw_output = (completed.stderr or completed.stdout or "").strip()
            detail = _format_subprocess_output(raw_output)
            try:
                (debug_dir / f"ffmpeg_extract_audio_error_{candidate_label}.txt").write_text(raw_output, encoding="utf-8")
                (debug_dir / "ffmpeg_extract_audio_error.txt").write_text(raw_output, encoding="utf-8")
            except Exception:
                pass
            raise RuntimeError(f"ffmpeg audio extraction failed: {detail}")
        _check_file_size(audio_path, self.settings.max_audio_mb, "audio")
        self._log(logs, f"音频提取完成：{audio_path.name}")
        return audio_path

    def _transcribe(self, audio_path: Path, logs: list[str]) -> str:
        global _WHISPER_MODEL, _WHISPER_MODEL_KEY
        _check_file_size(audio_path, self.settings.max_audio_mb, "audio")
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise RuntimeError("faster-whisper is not installed") from exc

        resolved_model = _resolve_whisper_model(self.settings.whisper_model)
        model_key = (
            resolved_model,
            self.settings.whisper_device,
            self.settings.whisper_compute_type,
        )
        if _WHISPER_MODEL is None or _WHISPER_MODEL_KEY != model_key:
            self._log(logs, f"加载 faster-whisper 模型：{resolved_model}")
            _WHISPER_MODEL = WhisperModel(
                resolved_model,
                device=self.settings.whisper_device,
                compute_type=self.settings.whisper_compute_type,
            )
            _WHISPER_MODEL_KEY = model_key
        language = self.settings.transcript_language.strip() or None
        max_attempts = max(1, int(self.settings.max_transcribe_attempts or 1))
        attempts: list[tuple[str | None, bool, str]] = [(language, True, "VAD")]
        if max_attempts >= 2:
            attempts.append((language, False, "关闭 VAD"))
        if max_attempts >= 3 and language:
            attempts.append((None, False, "自动语言"))
        transcript = ""
        last_error: Exception | None = None
        for attempt_no, (attempt_language, vad_filter, label) in enumerate(attempts[:max_attempts], start=1):
            try:
                if attempt_no > 1:
                    self._log(logs, f"语音识别第 {attempt_no}/{max_attempts} 次重试：{label}")
                transcript = self._run_transcribe_once(audio_path, language=attempt_language, vad_filter=vad_filter)
                if transcript:
                    break
            except Exception as exc:
                last_error = exc
                if _is_vad_runtime_asset_error(exc) and vad_filter and attempt_no < max_attempts:
                    self._log(logs, f"VAD 运行资产不可用，按有限重试策略继续：{_format_exception_message(exc)}")
                    continue
                if attempt_no >= max_attempts:
                    raise
        if not transcript:
            if last_error and not _is_vad_runtime_asset_error(last_error):
                raise last_error
            raise RuntimeError(f"speech transcript is empty after {min(len(attempts), max_attempts)} attempts")
        return transcript

    def _run_transcribe_once(self, audio_path: Path, language: str | None, vad_filter: bool) -> str:
        assert _WHISPER_MODEL is not None
        segments, _info = _WHISPER_MODEL.transcribe(
            str(audio_path),
            language=language,
            beam_size=5,
            vad_filter=vad_filter,
        )
        return "\n".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()

    def _ffmpeg_path(self) -> str:
        value = (self.settings.ffmpeg_path or "").strip().strip('"')
        if value:
            path = Path(value)
            if not path.is_absolute():
                path = app_root() / path
            if path.exists():
                return str(path)
            raise RuntimeError(f"ffmpeg is missing: {path}; set ACS_FFMPEG_PATH or add ffmpeg to PATH")
        bundled = app_root() / "bin" / "ffmpeg" / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
        if bundled.exists():
            return str(bundled)
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise RuntimeError("ffmpeg is missing; set ACS_FFMPEG_PATH or add ffmpeg to PATH")
        return ffmpeg

    def _log(self, logs: list[str], message: str) -> None:
        logs.append(message)
        print(f"[SPEECH] {message}", flush=True)



def json_dumps(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)

class _FatalSpeechAnalysisError(RuntimeError):
    pass


def _is_retryable_transcript_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return "transcript is empty" in text or "transcription empty" in text or "no speech" in text


def _is_vad_runtime_asset_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return (
        "silero_vad" in text
        or "vad" in text and ".onnx" in text and ("no_suchfile" in text or "file doesn't exist" in text or "does not exist" in text)
    )


def _format_exception_message(exc: Exception) -> str:
    return " ".join(str(exc).split())[:500]


def _is_known_non_content_media(url: str) -> bool:
    """Filter UI/static/live/effect resources that are not the target work media."""
    lower = url.lower()
    if "douyin-pc-web" in lower and "douyinvod.com" not in lower:
        return True
    if re.search(r"/(uuu|user)_\d+\.mp4(?:$|[?#])", lower):
        return True
    if "byteeffecttos.com" in lower or "effectcdn" in lower or "/ies.fe.effect/" in lower:
        return True
    if "thirdgame/stream" in lower or "pull-t" in lower and ".flv" in lower:
        return True
    if "live" in lower and (".flv" in lower or "stream" in lower):
        return True
    return False



def _media_candidate_priority(url: str, source: str, *, exact_target: bool = False, content_type: str = "") -> int:
    lower = url.lower()
    score = 0
    if exact_target:
        score += 100
    if source == "audio_element":
        score += 45
    elif source == "video_element":
        score += 25
    elif source == "aweme_detail_api":
        score += 20
    elif source == "page_response":
        score += 10

    # 口播识别只需要声音。优先处理真正的音频资源，减少大视频下载和
    # Playwright driver 读取大 body 时的断连风险。
    if _is_audio_media_url(url, content_type):
        score += 120
    elif _is_video_media_url(url, content_type):
        score += 20

    if "douyinvod.com" in lower:
        score += 15
    if "media-audio-" in lower:
        score += 80
    if "media-video-" in lower:
        score += 5
    if ".m3u8" in lower or "mpegurl" in lower:
        score -= 50
    if "douyinvod.com" in lower and "media-video-" not in lower and "media-audio-" not in lower:
        score += 20
    if re.search(r"/video/tos/", lower):
        score += 5
    return score


def _has_high_confidence_candidate(candidates: list[MediaCandidate]) -> bool:
    return any(item.priority >= 85 for item in candidates)


def _should_reject_transcript_as_unrelated(
    expected_caption: str | None,
    title: str,
    description: str,
    transcript: str,
    candidate: MediaCandidate,
) -> bool:
    """Reject obvious recommendation-media accidents, but keep the rule conservative.

    If the caption contains several concrete Chinese tokens and none appear in the page
    title/description/transcript, the captured media is almost certainly a recommendation or
    preloaded unrelated video.  Exact API candidates are never rejected by this heuristic.
    """
    if candidate.exact_target:
        return False
    tokens = _caption_tokens(expected_caption or "")
    if len(tokens) < 2:
        return False
    joined = f"{title}\n{description}\n{transcript}"
    hits = sum(1 for token in tokens if token and token in joined)
    return hits <= 0


def _extract_video_id(value: str | None) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    # Prefer explicit /video/<id> or id-like values passed from ContentRecord.platform_content_id.
    match = re.search(r"(?:/video/|[?&](?:aweme_id|item_id|modal_id|video_id)=)(\d{15,25})", text)
    if match:
        return match.group(1)
    match = re.search(r"\b(\d{15,25})\b", text)
    return match.group(1) if match else ""


def _merge_media_hints(base: TargetMediaHint, extra: TargetMediaHint) -> TargetMediaHint:
    return TargetMediaHint(
        title=extra.title or base.title,
        description=extra.description or base.description,
        tags=extra.tags or base.tags,
        duration=extra.duration if extra.duration is not None else base.duration,
        media_urls=_unique_urls([*(base.media_urls or []), *(extra.media_urls or [])]),
    )


def _find_aweme_by_id(payload: Any, aweme_id: str) -> dict[str, Any] | None:
    if not aweme_id:
        return None
    stack = [payload]
    seen = 0
    while stack and seen < 20000:
        seen += 1
        value = stack.pop()
        if isinstance(value, dict):
            direct = _dict_any_str(value, "aweme_id", "awemeId", "aweme_id_str", "awemeIdStr", "item_id", "itemId", "id")
            if direct == aweme_id and _looks_like_aweme(value):
                return value
            stack.extend(value.values())
        elif isinstance(value, list):
            stack.extend(value)
    return None


def _looks_like_aweme(value: dict[str, Any]) -> bool:
    return any(key in value for key in ("video", "desc", "aweme_id", "awemeId", "statistics", "author"))


def _dict_any_str(value: dict[str, Any], *keys: str) -> str:
    for key in keys:
        raw = value.get(key)
        if raw is None:
            continue
        text = str(raw).strip()
        if text:
            return text
    return ""


def _build_media_hint_from_aweme(aweme: dict[str, Any]) -> TargetMediaHint:
    desc = str(aweme.get("desc") or aweme.get("caption") or "").strip()
    title = desc
    tags = _extract_tags(desc)
    duration = _extract_aweme_duration(aweme)
    media_urls = _extract_aweme_media_urls(aweme)
    return TargetMediaHint(
        title=title,
        description=desc,
        tags=tags,
        duration=duration,
        media_urls=media_urls,
    )


def _extract_aweme_duration(aweme: dict[str, Any]) -> int | float | None:
    candidates: list[Any] = []
    video = aweme.get("video")
    if isinstance(video, dict):
        candidates.extend([video.get("duration"), video.get("duration_ms"), video.get("durationMs")])
    candidates.extend([aweme.get("duration"), aweme.get("duration_ms"), aweme.get("durationMs")])
    for raw in candidates:
        if raw in (None, ""):
            continue
        try:
            value = float(raw)
            if value <= 0:
                continue
            # Douyin API usually uses milliseconds for video.duration.
            return round(value / 1000, 3) if value > 3600 else value
        except Exception:
            continue
    return None


def _extract_aweme_media_urls(aweme: dict[str, Any]) -> list[str]:
    weighted: list[tuple[int, str]] = []

    def add_urls(obj: Any, score: int) -> None:
        if isinstance(obj, dict):
            urls = obj.get("url_list") or obj.get("urlList") or obj.get("urls")
            if isinstance(urls, list):
                for raw in urls:
                    url = _normalize_media_url(raw)
                    if url and _is_media_url(url) and not _is_known_non_content_media(url):
                        weighted.append((score, url))
            for key in ("uri", "url", "main_url", "backup_url"):
                url = _normalize_media_url(obj.get(key))
                if url and _is_media_url(url) and not _is_known_non_content_media(url):
                    weighted.append((score, url))

    video = aweme.get("video") if isinstance(aweme, dict) else None
    if isinstance(video, dict):
        for key, score in (
            ("play_addr", 10),
            ("playAddr", 10),
            ("download_addr", 9),
            ("downloadAddr", 9),
            ("play_addr_lowbr", 8),
            ("playApi", 8),
        ):
            add_urls(video.get(key), score)
        bit_rates = video.get("bit_rate") or video.get("bitRate") or []
        if isinstance(bit_rates, list):
            for bit_rate in bit_rates:
                if isinstance(bit_rate, dict):
                    add_urls(bit_rate.get("play_addr") or bit_rate.get("playAddr"), 12)
                    add_urls(bit_rate, 7)
        add_urls(video, 5)
    music = aweme.get("music") if isinstance(aweme, dict) else None
    if isinstance(music, dict):
        for key in ("play_url", "playUrl", "audition_url", "auditionUrl"):
            add_urls(music.get(key), 4)
    # Final generic sweep as fallback, with low priority.
    _collect_media_urls_recursive(aweme, weighted, score=1)
    weighted.sort(key=lambda item: item[0], reverse=True)
    return _unique_urls([url for _score, url in weighted])


def _collect_media_urls_recursive(obj: Any, weighted: list[tuple[int, str]], score: int = 1, depth: int = 0) -> None:
    if depth > 8:
        return
    if isinstance(obj, dict):
        urls = obj.get("url_list") or obj.get("urlList")
        if isinstance(urls, list):
            for raw in urls:
                url = _normalize_media_url(raw)
                if url and _is_media_url(url) and not _is_known_non_content_media(url):
                    weighted.append((score, url))
        for key, value in obj.items():
            if key in ("cover", "origin_cover", "dynamic_cover", "animated_cover", "images"):
                continue
            _collect_media_urls_recursive(value, weighted, score=score, depth=depth + 1)
    elif isinstance(obj, list):
        for value in obj:
            _collect_media_urls_recursive(value, weighted, score=score, depth=depth + 1)
    elif isinstance(obj, str):
        url = _normalize_media_url(obj)
        if url and _is_media_url(url) and not _is_known_non_content_media(url):
            weighted.append((score, url))


def _media_candidate_key(url: str) -> str:
    """Normalize volatile CDN URLs so signature/query variants are not retried as new media."""
    try:
        parsed = urlsplit(str(url or ""))
        host = (parsed.hostname or "").lower()
        if host.endswith(".douyinvod.com"):
            host = "douyinvod.com"
        path = re.sub(r"/+", "/", parsed.path or "")
        return f"{host}{path}".lower()
    except Exception:
        return str(url or "").split("?", 1)[0].split("#", 1)[0].lower()


def _bounded_timeout_seconds(default_timeout: int, deadline_at: float | None = None) -> int:
    """Return a timeout that never exceeds the remaining candidate budget."""
    default_value = max(1, int(default_timeout or 1))
    if deadline_at is None:
        return default_value
    remaining = int(max(0, deadline_at - time.time()))
    if remaining <= 0:
        raise TimeoutError("speech candidate time budget exhausted")
    return max(1, min(default_value, remaining))


def _normalize_media_url(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip().strip('"\'')
    if not text:
        return ""
    text = text.replace("\\u0026", "&").replace("\\/", "/")
    if text.startswith("//"):
        text = "https:" + text
    return text


def _unique_urls(urls: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for url in urls:
        key = url.split("#", 1)[0]
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(url)
    return result


def _page_matches_expected_content(page: Any, aweme_id: str, expected_caption: str | None = None) -> bool:
    """Guard against Douyin preloading/replacing the detail page with recommendation media."""
    try:
        current_url = str(page.url or "")
    except Exception:
        current_url = ""
    try:
        title, description, _tags, _duration = _page_video_meta(page)
    except Exception:
        title, description = "", ""
    joined = f"{current_url}\n{title}\n{description}"
    if aweme_id and aweme_id not in joined:
        # Some Douyin meta descriptions omit the id, so do not fail solely on this branch.
        pass
    tokens = _caption_tokens(expected_caption or "")
    if tokens:
        hit_count = sum(1 for token in tokens if token and token in joined)
        return hit_count >= min(2, len(tokens))
    if aweme_id:
        return aweme_id in joined
    return True


def _caption_tokens(caption: str) -> list[str]:
    text = re.sub(r"#[A-Za-z0-9_\-\u4e00-\u9fff]+", " ", caption or "")
    raw_tokens = re.findall(r"[A-Za-z0-9]{3,}|[\u4e00-\u9fff]{2,}", text)
    stopwords = {"这个", "那个", "一个", "我们", "你们", "他们", "不用", "视频", "作品", "方法", "使用", "旗舰店"}
    tokens: list[str] = []
    for token in raw_tokens:
        token = token.strip()
        if not token or token in stopwords:
            continue
        tokens.append(token[:12])
    return tokens[:8]

def _subprocess_no_window_kwargs() -> dict:
    kwargs = {"creationflags": no_window_creationflags()}
    startupinfo = no_window_startupinfo()
    if startupinfo is not None:
        kwargs["startupinfo"] = startupinfo
    return kwargs


def _env_bool(name: str, fallback: bool) -> bool:
    value = os.getenv(name)
    if value is None or value == "":
        return fallback
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _sanitize_browser_channel(channel: str) -> str:
    """Prevent speech capture from opening local Chrome/Edge by default."""
    value = (channel or "").strip().lower()
    if not value:
        return ""
    branded = {
        "chrome", "chrome-beta", "chrome-dev", "chrome-canary",
        "msedge", "msedge-beta", "msedge-dev", "msedge-canary",
    }
    if value in branded and not _env_bool("ACS_ALLOW_SYSTEM_BROWSER_FALLBACK", False):
        return ""
    return value


def _resolve_whisper_model(model_value: str) -> str:
    """Resolve faster-whisper model for source and packaged runtime.

    Packaged releases must use the bundled local model under app_root()/models.
    Both source and packaged runs require an explicit local path or an explicit
    download opt-in; no model is downloaded by default.
    """
    raw = (model_value or "").strip()
    if not raw:
        raise RuntimeError("请在 .env 中配置 WHISPER_MODEL 的本地模型路径；默认不下载模型")
    raw_path = Path(raw).expanduser()
    if raw_path.is_absolute() and raw_path.exists():
        return str(raw_path)

    root = app_root()
    relative_path = root / raw
    if relative_path.exists():
        return str(relative_path)

    simple_name = raw.replace("/", "_").replace("\\", "_").replace(":", "_")
    if not simple_name.startswith("faster-whisper-") and not simple_name.startswith("Systran_"):
        simple_name = f"faster-whisper-{simple_name}"
    bundled_path = root / "models" / simple_name
    if bundled_path.exists():
        return str(bundled_path)

    if os.getenv("ACS_ALLOW_WHISPER_DOWNLOAD", "0").strip().lower() not in {"1", "true", "yes", "on"}:
        raise RuntimeError(
            "缺少本地口播模型，默认禁止联网下载 HuggingFace 模型。"
            f"请重新打包并确保 dist 下存在 models/{simple_name}，"
            "或在 .env 中显式设置 ACS_ALLOW_WHISPER_DOWNLOAD=1。"
        )
    return raw

def _env_int(name: str, fallback: int) -> int:
    try:
        value = os.getenv(name)
        return int(value) if value not in (None, "") else fallback
    except Exception:
        return fallback


def _check_file_size(path: Path, max_mb: int, label: str) -> None:
    if not path.exists():
        raise RuntimeError(f"{label} file does not exist")
    max_bytes = max(1, int(max_mb or 1)) * 1024 * 1024
    size = path.stat().st_size
    if size <= 0:
        raise RuntimeError(f"{label} file is empty")
    if size > max_bytes:
        raise RuntimeError(f"{label} file exceeds {max_mb} MB")


def _probe_media(path: Path, ffmpeg: str, timeout: int = 30) -> bool:
    command = [ffmpeg, "-v", "error", "-i", str(path), "-f", "null", "-"]
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False, **_subprocess_no_window_kwargs())
    except Exception:
        return False
    return completed.returncode == 0


def _has_audio_stream(path: Path, ffmpeg: str, timeout: int = 30) -> bool:
    ffprobe = _resolve_ffprobe_path(ffmpeg)
    if ffprobe:
        command = [
            ffprobe,
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "default=nokey=1:noprint_wrappers=1",
            str(path),
        ]
        try:
            completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False, **_subprocess_no_window_kwargs())
            if completed.returncode == 0 and "audio" in (completed.stdout or "").lower():
                return True
            if completed.returncode == 0:
                return False
        except Exception:
            pass

    command = [ffmpeg, "-hide_banner", "-i", str(path)]
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False, **_subprocess_no_window_kwargs())
    except Exception:
        return False
    detail = (completed.stderr or completed.stdout or "").lower()
    return "audio:" in detail


def _resolve_ffprobe_path(ffmpeg: str) -> str:
    if ffmpeg:
        ffmpeg_path = Path(ffmpeg)
        sibling = ffmpeg_path.with_name("ffprobe.exe" if os.name == "nt" else "ffprobe")
        if sibling.exists():
            return str(sibling)
    return shutil.which("ffprobe") or ""


def _format_subprocess_output(text: str, limit: int = 900) -> str:
    detail = (text or "").strip()
    if not detail:
        return "no stderr/stdout returned"
    lines = [line.strip() for line in detail.splitlines() if line.strip()]
    important = [
        line
        for line in lines
        if any(
            token in line.lower()
            for token in (
                "error",
                "invalid",
                "failed",
                "audio",
                "stream",
                "codec",
                "permission",
                "no such",
                "not contain",
                "could not",
                "moov",
                "unsupported",
            )
        )
    ]
    compact = " | ".join((important[-8:] or lines[-8:]))
    if len(compact) > limit:
        compact = compact[-limit:]
    return compact


def _format_candidate_rejections(rejected: dict[str, str], limit: int = 900) -> str:
    if not rejected:
        return ""
    parts: list[str] = []
    for url, reason in list(rejected.items())[-5:]:
        short_url = url[:120] + ("..." if len(url) > 120 else "")
        parts.append(f"{short_url} => {reason}")
    text = " ; ".join(parts)
    if len(text) > limit:
        text = text[-limit:]
    return text


def _is_media_url(url: str, content_type: str = "") -> bool:
    lower_url = url.lower()
    lower_type = content_type.lower()
    if lower_url.startswith("blob:"):
        return False
    if "text/html" in lower_type or "application/json" in lower_type:
        return False
    if _is_audio_media_url(url, content_type) or _is_video_media_url(url, content_type) or "mpegurl" in lower_type:
        return True
    if "octet-stream" in lower_type and "douyinvod.com" in lower_url:
        return True
    return any(
        token in lower_url
        for token in (
            ".mp4",
            ".m4a",
            ".mp3",
            ".aac",
            ".wav",
            ".m3u8",
            "mime_type=video",
            "mime_type=audio",
            "playwm",
            "play/?",
            "video_id=",
            "douyinvod.com",
        )
    )


def _is_audio_media_url(url: str, content_type: str = "") -> bool:
    lower_url = url.lower()
    lower_type = content_type.lower()
    return (
        "audio/" in lower_type
        or "mime_type=audio" in lower_url
        or "media-audio-" in lower_url
        or lower_url.endswith((".m4a", ".mp3", ".aac", ".wav", ".ogg", ".opus"))
        or any(token in lower_url for token in (".m4a?", ".mp3?", ".aac?", ".wav?", ".ogg?", ".opus?"))
    )


def _is_video_media_url(url: str, content_type: str = "") -> bool:
    lower_url = url.lower()
    lower_type = content_type.lower()
    return (
        "video/" in lower_type
        or "mime_type=video" in lower_url
        or "media-video-" in lower_url
        or lower_url.endswith((".mp4", ".mov", ".mkv", ".webm"))
        or any(token in lower_url for token in (".mp4?", ".mov?", ".mkv?", ".webm?", "douyinvod.com"))
    )


def _page_media_sources(page: Any) -> list[dict[str, str]]:
    try:
        values = page.evaluate(
            """() => Array.from(document.querySelectorAll('video,audio'))
                .map((media) => ({
                    url: media.currentSrc || media.src || '',
                    source: media.tagName && media.tagName.toLowerCase() === 'audio' ? 'audio_element' : 'video_element',
                    content_type: media.tagName && media.tagName.toLowerCase() === 'audio' ? 'audio/*' : ''
                }))
                .filter((item) => item.url && !item.url.startsWith('blob:'))"""
        )
    except Exception:
        return []
    return [value for value in values if isinstance(value, dict) and isinstance(value.get("url"), str)]


def _page_video_sources(page: Any) -> list[str]:
    # Backward-compatible wrapper for old callers/tests. New speech capture uses
    # _page_media_sources so audio elements can be prioritized.
    return [item["url"] for item in _page_media_sources(page) if item.get("source") == "video_element"]


def _page_video_meta(page: Any) -> tuple[str, str, list[str], int | float | None]:
    title = ""
    description = ""
    tags: list[str] = []
    duration: int | float | None = None
    try:
        title = _clean_title(str(page.title() or ""))
    except Exception:
        pass
    description = _meta_content(page, "meta[name='description']") or _meta_content(page, "meta[property='og:description']")
    keywords = _meta_content(page, "meta[name='keywords']")
    tags = _extract_tags(title, description, keywords=keywords)
    try:
        value = page.evaluate(
            """() => {
                const video = document.querySelector('video');
                if (!video || !Number.isFinite(video.duration)) return null;
                return video.duration;
            }"""
        )
        if isinstance(value, (int, float)) and value > 0:
            duration = value
    except Exception:
        pass
    return title, description, tags, duration


def _clean_title(title: str) -> str:
    title = title.strip()
    for suffix in (" - Douyin", "- Douyin", " - douyin", "- douyin", " - TikTok", "- TikTok"):
        if title.endswith(suffix):
            title = title[: -len(suffix)].strip()
    for suffix in (" - 抖音", "- 抖音", "_抖音", " | 抖音"):
        if title.endswith(suffix):
            title = title[: -len(suffix)].strip()
    return title


def _meta_content(page: Any, selector: str) -> str:
    try:
        value = page.locator(selector).first.get_attribute("content", timeout=1000)
    except Exception:
        return ""
    return str(value or "").strip()


def _extract_tags(*texts: str, keywords: str = "") -> list[str]:
    joined = "\n".join(text for text in texts if text)
    hash_tags = re.findall(r"#([A-Za-z0-9_\-\u4e00-\u9fff]+)", joined)
    keyword_tags = re.split(r"[,，\s]+", keywords) if keywords else []
    seen: set[str] = set()
    result: list[str] = []
    for raw in hash_tags + keyword_tags:
        tag = raw.strip("# \t\r\n")
        if not tag or tag in seen:
            continue
        seen.add(tag)
        result.append(tag)
    return result
