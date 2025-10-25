@echo off
echo ========================================
echo   Starting AnaVideo Multi-Site Downloader
echo   Support: Bilibili, YouTube, Twitter, etc.
echo ========================================
echo.

echo [Check] Verifying yt-dlp installation...
python -c "import yt_dlp" >nul 2>&1
if errorlevel 1 (
    echo [WARNING] yt-dlp not installed, only Bilibili supported
    echo [TIP] Run install_ytdlp.bat to enable multi-site support
    echo.
    timeout /t 2 /nobreak >nul
) else (
    echo [OK] yt-dlp installed, multi-site support enabled
    echo.
)

echo [1/2] Starting API Server...
start "API Server" cmd /k python bili_api_server.py
timeout /t 3 /nobreak >nul

echo [2/2] Starting Web Application...
echo.
echo Opening browser at http://localhost:5173
echo.
npm run dev

pause
