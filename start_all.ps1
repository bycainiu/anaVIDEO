# anaVIDEO - 一键启动所有服务脚本
# 启动顺序：Node后端 -> Python API -> 前端

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "    anaVIDEO 服务启动脚本" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# 检查端口是否被占用
function Test-Port {
    param($Port)
    $connection = Test-NetConnection -ComputerName localhost -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue
    return $connection
}

# 检查并关闭占用端口的进程
function Stop-PortProcess {
    param($Port, $ServiceName)
    
    if (Test-Port -Port $Port) {
        Write-Host "⚠️  端口 $Port 已被占用，尝试关闭..." -ForegroundColor Yellow
        $process = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
        if ($process) {
            Stop-Process -Id $process -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            Write-Host "✅ 已关闭端口 $Port 上的进程" -ForegroundColor Green
        }
    }
}

# 检查依赖
Write-Host "🔍 检查依赖..." -ForegroundColor Yellow

# 检查 Node.js
try {
    $nodeVersion = node --version 2>$null
    Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ 未安装 Node.js，请先安装！" -ForegroundColor Red
    exit 1
}

# 检查 Python
try {
    $pythonVersion = python --version 2>$null
    Write-Host "✅ Python: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ 未安装 Python，请先安装！" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 检查并安装依赖
Write-Host "📦 检查项目依赖..." -ForegroundColor Yellow

# 检查前端依赖
if (!(Test-Path "node_modules")) {
    Write-Host "⚠️  前端依赖未安装，正在安装..." -ForegroundColor Yellow
    npm install
    Write-Host "✅ 前端依赖安装完成" -ForegroundColor Green
} else {
    Write-Host "✅ 前端依赖已安装" -ForegroundColor Green
}

# 检查后端依赖
if (!(Test-Path "server\node_modules")) {
    Write-Host "⚠️  后端依赖未安装，正在安装..." -ForegroundColor Yellow
    Push-Location server
    npm install
    Pop-Location
    Write-Host "✅ 后端依赖安装完成" -ForegroundColor Green
} else {
    Write-Host "✅ 后端依赖已安装" -ForegroundColor Green
}

# 检查 Python 依赖
Write-Host "🐍 检查 Python 依赖..." -ForegroundColor Yellow
try {
    python -c "import fastapi, uvicorn, httpx, bs4, yt_dlp" 2>$null
    Write-Host "✅ Python 依赖已安装" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Python 依赖未完整安装，正在安装..." -ForegroundColor Yellow
    pip install fastapi uvicorn httpx beautifulsoup4 yt-dlp
    Write-Host "✅ Python 依赖安装完成" -ForegroundColor Green
}

Write-Host ""

# 清理旧进程
Write-Host "🧹 清理旧进程..." -ForegroundColor Yellow
Stop-PortProcess -Port 3004 -ServiceName "Node后端"
Stop-PortProcess -Port 8888 -ServiceName "Python API"
Stop-PortProcess -Port 5173 -ServiceName "前端开发服务器"
Write-Host ""

# 启动 Node.js 后端服务器 (端口 3004)
Write-Host "🚀 启动 Node.js 后端服务 (端口 3004)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\server'; Write-Host '=== Node.js 后端服务 ===' -ForegroundColor Green; npm start" -WindowStyle Normal
Write-Host "✅ Node.js 后端服务已启动" -ForegroundColor Green
Start-Sleep -Seconds 3

# 启动 Python FastAPI 服务 (端口 8888)
Write-Host "🚀 启动 Python API 服务 (端口 8888)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; Write-Host '=== Python API 服务 ===' -ForegroundColor Green; python bili_api_server.py" -WindowStyle Normal
Write-Host "✅ Python API 服务已启动" -ForegroundColor Green
Start-Sleep -Seconds 3

# 启动前端开发服务器 (端口 5173)
Write-Host "🚀 启动前端开发服务器 (端口 5173)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; Write-Host '=== 前端开发服务器 ===' -ForegroundColor Green; npm run dev" -WindowStyle Normal
Write-Host "✅ 前端开发服务器已启动" -ForegroundColor Green
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "    所有服务启动完成！" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📌 服务信息：" -ForegroundColor Yellow
Write-Host "   - Node.js 后端:  http://localhost:3004" -ForegroundColor White
Write-Host "   - Python API:    http://localhost:8888" -ForegroundColor White
Write-Host "   - 前端界面:       http://localhost:5173" -ForegroundColor White
Write-Host ""
Write-Host "📝 使用说明：" -ForegroundColor Yellow
Write-Host "   1. 等待所有服务启动完成（约10秒）" -ForegroundColor White
Write-Host "   2. 在浏览器中打开 http://localhost:5173" -ForegroundColor White
Write-Host "   3. 支持 46+ 个视频平台的下载" -ForegroundColor White
Write-Host ""
Write-Host "⚠️  注意：关闭此窗口不会停止服务，请手动关闭各服务窗口" -ForegroundColor Yellow
Write-Host ""

# 等待5秒后自动打开浏览器
Write-Host "⏳ 5秒后自动打开浏览器..." -ForegroundColor Cyan
Start-Sleep -Seconds 5
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "✨ 浏览器已打开，祝您使用愉快！" -ForegroundColor Green
Write-Host ""
Write-Host "按任意键退出此窗口（服务将继续运行）..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
