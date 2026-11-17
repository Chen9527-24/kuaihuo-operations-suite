@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"

rem -----------------------------------------------------------------------------
rem build_exe_no_download_v2.bat
rem Purpose:
rem   1) Package the interception bot.
rem   2) Do NOT download Playwright Chromium / Headless Shell during packaging.
rem   3) Reuse local AppData cache: %LOCALAPPDATA%\ms-playwright\chromium_headless_shell-xxxx
rem -----------------------------------------------------------------------------

echo.
echo [build-script] build_exe_no_download_v2.bat

set "BUILD_ENV=%~1"
if "%BUILD_ENV%"=="" set "BUILD_ENV=local"

set "BUILD_NAME="
set "BUILD_API_BASE_URL="

if /I "%BUILD_ENV%"=="local" goto env_local
if /I "%BUILD_ENV%"=="test" goto env_test
if /I "%BUILD_ENV%"=="prod" goto env_prod

echo Usage: build_exe.bat local^|test^|prod [CORE_URL]
echo Example: build_exe.bat prod
exit /b 1

:env_local
set "BUILD_ENV=local"
set "BUILD_NAME=authorized-content-sync-local"
set "BUILD_API_BASE_URL=http://localhost:3000"
goto env_done

:env_test
set "BUILD_ENV=test"
set "BUILD_NAME=authorized-content-sync-test"
set "BUILD_API_BASE_URL=http://localhost:3000"
goto env_done

:env_prod
set "BUILD_ENV=prod"
set "BUILD_NAME=authorized-content-sync-prod"
set "BUILD_API_BASE_URL=http://localhost:3000"
goto env_done

:env_done
if not "%~2"=="" set "BUILD_API_BASE_URL=%~2"
if defined CORE_NEXUS_API_BASE_URL set "BUILD_API_BASE_URL=%CORE_NEXUS_API_BASE_URL%"
echo.
echo [build] env : %BUILD_ENV%
echo [build] name: %BUILD_NAME%
echo [build] api : %BUILD_API_BASE_URL%
echo.

rem Pip can use domestic mirror. Playwright browser download is explicitly disabled in this script.
if not defined PIP_INDEX_URL set "PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple"
set "PLAYWRIGHT_DOWNLOAD_HOST="
set "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1"

echo [build] pip mirror          : %PIP_INDEX_URL%
echo [build] playwright download : disabled; use local AppData cache only
echo.

python -m pip install -r requirements-build.txt || goto error

call :prepare_playwright_headless_shell || goto error

set "ACS_BUILD_ENV=%BUILD_ENV%"
set "ACS_BUILD_NAME=%BUILD_NAME%"

if exist "build" rmdir /s /q "build"
if exist "dist\%BUILD_NAME%" rmdir /s /q "dist\%BUILD_NAME%"

python -m PyInstaller --noconfirm --clean authorized-content-sync.spec || goto error

call :bundle_faster_whisper_assets || goto error

if not exist "dist\%BUILD_NAME%\%BUILD_NAME%.exe" (
  echo [build] EXE not found: dist\%BUILD_NAME%\%BUILD_NAME%.exe
  goto error
)

call :bundle_ffmpeg || goto error
call :bundle_whisper_model || goto error
call :write_runtime_config || goto error
call :prepare_clean_release_dirs || goto error

echo.
echo Build finished.
echo ENV: %BUILD_ENV%
echo EXE: dist\%BUILD_NAME%\%BUILD_NAME%.exe
echo API: %BUILD_API_BASE_URL%
exit /b 0

:prepare_playwright_headless_shell
echo.
echo [build] prepare Playwright chromium headless shell from local cache

rem Put Playwright browsers under site-packages/playwright/driver/package/.local-browsers
rem so PyInstaller can package them with the exe.
set "PLAYWRIGHT_BROWSERS_PATH=0"
set "PW_LOCAL_BROWSERS="
set "PW_SHELL_REV="

for /f "usebackq delims=" %%I in (`python -c "from pathlib import Path; import playwright; print(Path(playwright.__file__).resolve().parent / 'driver' / 'package' / '.local-browsers')"`) do set "PW_LOCAL_BROWSERS=%%I"
for /f "usebackq delims=" %%I in (`python -c "import json; from pathlib import Path; import playwright; p=Path(playwright.__file__).resolve().parent/'driver'/'package'/'browsers.json'; data=json.loads(p.read_text(encoding='utf-8')); print(next(b['revision'] for b in data['browsers'] if b.get('name')=='chromium-headless-shell'))"`) do set "PW_SHELL_REV=%%I"

if "%PW_LOCAL_BROWSERS%"=="" (
  echo [build] Cannot detect Playwright package-local browser folder.
  exit /b 1
)
if "%PW_SHELL_REV%"=="" (
  echo [build] Cannot detect Playwright chromium-headless-shell revision.
  exit /b 1
)

set "PW_SHELL_DIR=chromium_headless_shell-%PW_SHELL_REV%"
set "PW_SHELL_EXE=chrome-headless-shell-win64\chrome-headless-shell.exe"
set "PW_DST=%PW_LOCAL_BROWSERS%\%PW_SHELL_DIR%"
set "PW_SRC=%LOCALAPPDATA%\ms-playwright\%PW_SHELL_DIR%"

echo [build] required shell      : %PW_SHELL_DIR%
echo [build] AppData source      : %PW_SRC%
echo [build] package destination : %PW_DST%

if exist "%PW_DST%\%PW_SHELL_EXE%" (
  echo [build] package-local headless shell already exists.
  exit /b 0
)

if not exist "%PW_SRC%\%PW_SHELL_EXE%" (
  echo.
  echo [build] ERROR: local AppData headless shell not found.
  echo [build] Expected file:
  echo [build] %PW_SRC%\%PW_SHELL_EXE%
  echo.
  echo [build] This script intentionally does not download Playwright browsers.
  echo [build] Please confirm the folder exists in Explorer, or manually copy:
  echo [build] from: %%LOCALAPPDATA%%\ms-playwright\%PW_SHELL_DIR%
  echo [build] to  : %PW_LOCAL_BROWSERS%\%PW_SHELL_DIR%
  exit /b 1
)

echo [build] copying local AppData headless shell into package-local folder...
if not exist "%PW_LOCAL_BROWSERS%" mkdir "%PW_LOCAL_BROWSERS%"
xcopy "%PW_SRC%" "%PW_DST%" /E /I /Y >nul
if errorlevel 1 (
  echo [build] Failed to copy Playwright headless shell cache.
  exit /b 1
)

if not exist "%PW_DST%\%PW_SHELL_EXE%" (
  echo [build] Copy finished, but expected exe still not found:
  echo [build] %PW_DST%\%PW_SHELL_EXE%
  exit /b 1
)

echo [build] headless shell ready.
exit /b 0


:bundle_faster_whisper_assets
echo.
echo [build] verify bundled faster-whisper runtime assets
python build_tools\bundle_faster_whisper_assets.py --dist "dist\%BUILD_NAME%"
if errorlevel 1 (
  echo [build] Failed to bundle faster-whisper runtime assets.
  exit /b 1
)
exit /b 0

:bundle_ffmpeg
echo.
echo [build] prepare bundled ffmpeg
set "BUILD_BUNDLED_FFMPEG="
if /I "%BUILD_ENV%"=="prod" (
  set "BUILD_FFMPEG_REQUIRED=--required"
) else (
  set "BUILD_FFMPEG_REQUIRED="
)
python build_tools\bundle_ffmpeg.py --dist "dist\%BUILD_NAME%" %BUILD_FFMPEG_REQUIRED%
if errorlevel 1 (
  echo [build] Failed to bundle ffmpeg.
  exit /b 1
)
if exist "dist\%BUILD_NAME%\.bundled_ffmpeg_path" (
  for /f "usebackq delims=" %%I in ("dist\%BUILD_NAME%\.bundled_ffmpeg_path") do set "BUILD_BUNDLED_FFMPEG=%%I"
  del /f /q "dist\%BUILD_NAME%\.bundled_ffmpeg_path" >nul 2>nul
  echo [build] bundled ffmpeg path: %BUILD_BUNDLED_FFMPEG%
) else (
  echo [build] no ffmpeg bundled.
)
exit /b 0

:bundle_whisper_model
echo.
echo [build] prepare bundled faster-whisper model
set "BUILD_BUNDLED_WHISPER_MODEL="
set "BUILD_WHISPER_MODEL=%WHISPER_MODEL%"
rem No implicit model: set WHISPER_MODEL or WHISPER_MODEL_SOURCE before packaging.

if /I "%BUILD_ENV%"=="prod" (
  set "BUILD_WHISPER_REQUIRED=--required"
) else (
  set "BUILD_WHISPER_REQUIRED="
)

python build_tools\bundle_whisper_model.py --dist "dist\%BUILD_NAME%" --model "%BUILD_WHISPER_MODEL%" %BUILD_WHISPER_REQUIRED%
if errorlevel 1 (
  echo [build] Failed to bundle faster-whisper model.
  exit /b 1
)

if exist "dist\%BUILD_NAME%\.bundled_whisper_model" (
  for /f "usebackq delims=" %%I in ("dist\%BUILD_NAME%\.bundled_whisper_model") do set "BUILD_BUNDLED_WHISPER_MODEL=%%I"
  del /f /q "dist\%BUILD_NAME%\.bundled_whisper_model" >nul 2>nul
  echo [build] bundled whisper model: %BUILD_BUNDLED_WHISPER_MODEL%
) else (
  echo [build] no local whisper model bundled.
)
exit /b 0

:write_runtime_config
if not exist "dist\%BUILD_NAME%" exit /b 1
if not exist "dist\%BUILD_NAME%\config" mkdir "dist\%BUILD_NAME%\config"

> "dist\%BUILD_NAME%\.env" echo CORE_NEXUS_API_BASE_URL=%BUILD_API_BASE_URL%
>> "dist\%BUILD_NAME%\.env" echo API_BASE_URL=%BUILD_API_BASE_URL%
>> "dist\%BUILD_NAME%\.env" echo ACS_HTTP_TRUST_ENV=0
>> "dist\%BUILD_NAME%\.env" echo ACS_SPEECH_HEADLESS=1
>> "dist\%BUILD_NAME%\.env" echo ACS_SPEECH_RETRY_VISIBLE_ON_FAIL=0
>> "dist\%BUILD_NAME%\.env" echo ACS_PLAYWRIGHT_AUTO_INSTALL=0
>> "dist\%BUILD_NAME%\.env" echo ACS_ALLOW_SYSTEM_BROWSER_FALLBACK=0
>> "dist\%BUILD_NAME%\.env" echo PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
>> "dist\%BUILD_NAME%\.env" echo HF_HUB_OFFLINE=1
>> "dist\%BUILD_NAME%\.env" echo TRANSFORMERS_OFFLINE=1
>> "dist\%BUILD_NAME%\.env" echo ACS_ALLOW_WHISPER_DOWNLOAD=0
>> "dist\%BUILD_NAME%\.env" echo WHISPER_DEVICE=cpu
>> "dist\%BUILD_NAME%\.env" echo WHISPER_COMPUTE_TYPE=int8
>> "dist\%BUILD_NAME%\.env" echo TRANSCRIPT_LANGUAGE=zh
if defined BUILD_BUNDLED_FFMPEG (
  >> "dist\%BUILD_NAME%\.env" echo ACS_FFMPEG_PATH=%BUILD_BUNDLED_FFMPEG%
)
if defined BUILD_BUNDLED_WHISPER_MODEL (
  >> "dist\%BUILD_NAME%\.env" echo WHISPER_MODEL=%BUILD_BUNDLED_WHISPER_MODEL%
) else (
  >> "dist\%BUILD_NAME%\.env" echo WHISPER_MODEL=
)

> "dist\%BUILD_NAME%\config\gui_settings.json" echo {
>> "dist\%BUILD_NAME%\config\gui_settings.json" echo   "apiBaseUrl": "%BUILD_API_BASE_URL%",
>> "dist\%BUILD_NAME%\config\gui_settings.json" echo   "tokenCachePath": "config/core_session.json",
>> "dist\%BUILD_NAME%\config\gui_settings.json" echo   "rememberCredentials": false,
>> "dist\%BUILD_NAME%\config\gui_settings.json" echo   "username": "",
>> "dist\%BUILD_NAME%\config\gui_settings.json" echo   "password": "",
>> "dist\%BUILD_NAME%\config\gui_settings.json" echo   "tenantId": "",
>> "dist\%BUILD_NAME%\config\gui_settings.json" echo   "guiLogEnabled": true,
>> "dist\%BUILD_NAME%\config\gui_settings.json" echo   "interfaceTraceEnabled": true,
>> "dist\%BUILD_NAME%\config\gui_settings.json" echo   "browserName": "chromium",
>> "dist\%BUILD_NAME%\config\gui_settings.json" echo   "prepareRuntimeBeforeStart": true,
>> "dist\%BUILD_NAME%\config\gui_settings.json" echo   "autoRestoreSession": false
>> "dist\%BUILD_NAME%\config\gui_settings.json" echo }

if exist "dist\%BUILD_NAME%\config\core_session.json" del /f /q "dist\%BUILD_NAME%\config\core_session.json"
exit /b 0

:prepare_clean_release_dirs
rem Keep the release package clean. Runtime folders are created empty, but local
rem login profiles/cache/debug output must not be shipped inside a formal build.
if not exist "dist\%BUILD_NAME%" exit /b 1

for %%D in (profiles state output) do (
  if exist "dist\%BUILD_NAME%\%%D" rmdir /s /q "dist\%BUILD_NAME%\%%D"
  mkdir "dist\%BUILD_NAME%\%%D" >nul 2>nul
)

rem Remove Python cache folders that may be copied by third-party hooks.
for /d /r "dist\%BUILD_NAME%" %%D in (__pycache__) do rmdir /s /q "%%D" 2>nul

exit /b 0

:error
echo.
echo Build failed.
exit /b 1
