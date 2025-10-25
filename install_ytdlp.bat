@echo off
echo ========================================
echo   Install yt-dlp (Multi-Site Support)
echo ========================================
echo.

echo [1/3] Checking Python environment...
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found, please install Python 3.8+
    pause
    exit /b 1
)
echo [OK] Python installed

echo.
echo [2/3] Installing yt-dlp...
pip install yt-dlp
if errorlevel 1 (
    echo [ERROR] Installation failed, check network connection
    pause
    exit /b 1
)
echo [OK] yt-dlp installed successfully

echo.
echo [3/3] Verifying installation...
python -c "import yt_dlp; print('yt-dlp version:', yt_dlp.version.__version__)"
if errorlevel 1 (
    echo [WARNING] Verification failed, but may be installed
) else (
    echo [OK] Verification successful
)

echo.
echo ========================================
echo   Installation Complete!
echo ========================================
echo.
echo Now you can:
echo   1. Run start.bat to launch the app
echo   2. Copy any supported video link (YouTube, Twitter, TikTok, etc.)
echo   3. Download videos automatically
echo.
echo Supported sites:
echo   Bilibili, YouTube, Twitter, TikTok
echo   Instagram, Vimeo, Twitch, and 20+ more
echo.
pause

