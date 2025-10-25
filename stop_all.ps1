# anaVIDEO - 停止所有服务脚本

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "    anaVIDEO 服务停止脚本" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# 停止指定端口的进程
function Stop-PortProcess {
    param($Port, $ServiceName)
    
    Write-Host "🔍 检查端口 $Port ($ServiceName)..." -ForegroundColor Yellow
    
    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($connections) {
        $processes = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($processId in $processes) {
            try {
                $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                if ($process) {
                    Write-Host "   ⏹️  停止进程: $($process.ProcessName) (PID: $processId)" -ForegroundColor Yellow
                    Stop-Process -Id $processId -Force
                    Write-Host "   ✅ 已停止" -ForegroundColor Green
                }
            } catch {
                Write-Host "   ⚠️  无法停止进程 $processId" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "   ℹ️  端口未被占用" -ForegroundColor Gray
    }
}

# 停止所有相关服务
Write-Host "🛑 正在停止所有服务..." -ForegroundColor Cyan
Write-Host ""

Stop-PortProcess -Port 3004 -ServiceName "Node.js 后端"
Stop-PortProcess -Port 8888 -ServiceName "Python API"
Stop-PortProcess -Port 5173 -ServiceName "前端开发服务器"

# 额外清理：杀掉可能的残留进程
Write-Host ""
Write-Host "🧹 清理残留进程..." -ForegroundColor Yellow

# 清理 node 进程（包含 anaVIDEO 路径的）
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -like "*anaVIDEO_clean*"
}
foreach ($proc in $nodeProcesses) {
    Write-Host "   ⏹️  停止 Node 进程 (PID: $($proc.Id))" -ForegroundColor Yellow
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}

# 清理 python 进程（包含 bili_api_server 的）
$pythonProcesses = Get-Process -Name python* -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*bili_api_server*"
}
foreach ($proc in $pythonProcesses) {
    Write-Host "   ⏹️  停止 Python 进程 (PID: $($proc.Id))" -ForegroundColor Yellow
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "    所有服务已停止！" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
