@echo off
echo ====================================
echo    启动B站下载服务
echo ====================================

echo 1. 检查Python依赖...
pip install -r bili_requirements.txt

echo.
echo 2. 启动B站下载API服务...
echo 服务地址: http://localhost:8888
echo WebSocket: ws://localhost:8888/ws/progress
echo.

python bili_api_server.py

pause