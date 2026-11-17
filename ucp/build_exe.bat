@echo off
setlocal
cd /d "%~dp0"
REM Usage: build_exe.bat local [CORE_URL]
set "ENV_NAME=%~1"
if "%ENV_NAME%"=="" set "ENV_NAME=local"
if "%~2"=="" (
  python build_exe.py --env %ENV_NAME%
) else (
  python build_exe.py --env %ENV_NAME% --api-base-url "%~2"
)
endlocal
