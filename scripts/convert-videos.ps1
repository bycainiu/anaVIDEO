# FFmpeg 批量视频转换脚本
# 用途：将不兼容的视频格式批量转换为 H.264/MP4 格式
# 要求：需要先安装 FFmpeg (https://www.gyan.dev/ffmpeg/builds/)

param(
    [string]$InputFolder = ".",
    [string]$OutputFolder = "converted",
    [string]$Quality = "23",  # CRF 值: 18(高质量) 23(推荐) 28(低质量)
    [string]$Preset = "medium",  # fast, medium, slow
    [switch]$SkipExisting = $true
)

# 检查 FFmpeg 是否安装
try {
    $ffmpegVersion = ffmpeg -version 2>$null
    if (-not $ffmpegVersion) {
        throw "FFmpeg not found"
    }
} catch {
    Write-Host "错误: 未找到 FFmpeg!" -ForegroundColor Red
    Write-Host ""
    Write-Host "请先安装 FFmpeg:" -ForegroundColor Yellow
    Write-Host "1. 访问: https://www.gyan.dev/ffmpeg/builds/" -ForegroundColor Cyan
    Write-Host "2. 下载 'ffmpeg-release-essentials.zip'" -ForegroundColor Cyan
    Write-Host "3. 解压并将 ffmpeg.exe 所在目录添加到系统 PATH" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "或使用 Chocolatey 安装: choco install ffmpeg" -ForegroundColor Cyan
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  FFmpeg 批量视频转换工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 创建输出文件夹
if (-not (Test-Path $OutputFolder)) {
    New-Item -ItemType Directory -Path $OutputFolder | Out-Null
    Write-Host "✓ 已创建输出目录: $OutputFolder" -ForegroundColor Green
}

# 支持的输入格式
$videoExtensions = @("*.mp4", "*.mov", "*.avi", "*.mkv", "*.wmv", "*.flv", "*.m4v", "*.webm")

# 获取所有视频文件
$videoFiles = Get-ChildItem -Path $InputFolder -Include $videoExtensions -File

if ($videoFiles.Count -eq 0) {
    Write-Host "❌ 在 '$InputFolder' 中未找到视频文件" -ForegroundColor Red
    exit 1
}

Write-Host "找到 $($videoFiles.Count) 个视频文件" -ForegroundColor Yellow
Write-Host ""
Write-Host "设置:" -ForegroundColor Cyan
Write-Host "  - 质量 (CRF): $Quality" -ForegroundColor Gray
Write-Host "  - 预设: $Preset" -ForegroundColor Gray
Write-Host "  - 输出目录: $OutputFolder" -ForegroundColor Gray
Write-Host ""

$successCount = 0
$skipCount = 0
$failCount = 0

foreach ($file in $videoFiles) {
    $outputFile = Join-Path $OutputFolder "$($file.BaseName)_converted.mp4"
    
    # 如果输出文件已存在且 SkipExisting 为 true，则跳过
    if ((Test-Path $outputFile) -and $SkipExisting) {
        Write-Host "⏭️  跳过 (已存在): $($file.Name)" -ForegroundColor DarkGray
        $skipCount++
        continue
    }
    
    Write-Host "🎬 转换中: $($file.Name)" -ForegroundColor Cyan
    Write-Host "   输入大小: $([math]::Round($file.Length / 1MB, 2)) MB" -ForegroundColor Gray
    
    # FFmpeg 转换命令
    $arguments = @(
        "-i", $file.FullName,
        "-c:v", "libx264",
        "-crf", $Quality,
        "-preset", $Preset,
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",  # 优化在线播放
        "-y",  # 覆盖已存在的文件
        $outputFile
    )
    
    try {
        $process = Start-Process -FilePath "ffmpeg" -ArgumentList $arguments -NoNewWindow -Wait -PassThru
        
        if ($process.ExitCode -eq 0) {
            $outputFileInfo = Get-Item $outputFile
            $compressionRatio = [math]::Round(($file.Length - $outputFileInfo.Length) / $file.Length * 100, 1)
            
            Write-Host "   ✅ 成功" -ForegroundColor Green
            Write-Host "   输出大小: $([math]::Round($outputFileInfo.Length / 1MB, 2)) MB" -ForegroundColor Gray
            Write-Host "   压缩率: $compressionRatio%" -ForegroundColor Gray
            Write-Host ""
            $successCount++
        } else {
            Write-Host "   ❌ 失败 (退出码: $($process.ExitCode))" -ForegroundColor Red
            Write-Host ""
            $failCount++
        }
    } catch {
        Write-Host "   ❌ 错误: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        $failCount++
    }
}

# 总结
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  转换完成" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ 成功: $successCount" -ForegroundColor Green
Write-Host "⏭️  跳过: $skipCount" -ForegroundColor DarkGray
Write-Host "❌ 失败: $failCount" -ForegroundColor Red
Write-Host ""

if ($successCount -gt 0) {
    Write-Host "转换后的文件位于: $OutputFolder" -ForegroundColor Yellow
}
