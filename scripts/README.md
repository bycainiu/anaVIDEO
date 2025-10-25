# 视频转换脚本使用说明

## 脚本：convert-videos.ps1

这是一个 PowerShell 脚本，用于批量将不兼容的视频格式转换为浏览器支持的 H.264/MP4 格式。

## 前置要求

### 安装 FFmpeg

#### 方法 1：手动安装（推荐）

1. 访问 [FFmpeg 下载页面](https://www.gyan.dev/ffmpeg/builds/)
2. 下载 `ffmpeg-release-essentials.zip`
3. 解压到任意目录，例如 `C:\ffmpeg`
4. 将 `C:\ffmpeg\bin` 添加到系统 PATH：
   - 右键 "此电脑" → "属性" → "高级系统设置"
   - 点击 "环境变量"
   - 在 "系统变量" 中找到 `Path`，点击 "编辑"
   - 点击 "新建"，添加 `C:\ffmpeg\bin`
   - 确定所有窗口
5. 重新打开 PowerShell 验证：`ffmpeg -version`

#### 方法 2：使用 Chocolatey（如果已安装）

```powershell
choco install ffmpeg
```

#### 方法 3：使用 Scoop

```powershell
scoop install ffmpeg
```

## 基本使用

### 1. 转换当前目录下的所有视频

```powershell
cd "D:\your-videos-folder"
..\anaVIDEO\scripts\convert-videos.ps1
```

### 2. 指定输入和输出目录

```powershell
.\convert-videos.ps1 -InputFolder "D:\original-videos" -OutputFolder "D:\converted-videos"
```

### 3. 调整质量（CRF 值）

```powershell
# 高质量（文件更大）
.\convert-videos.ps1 -Quality 18

# 推荐平衡
.\convert-videos.ps1 -Quality 23

# 低质量（文件更小）
.\convert-videos.ps1 -Quality 28
```

### 4. 调整转换速度

```powershell
# 快速转换（质量稍低）
.\convert-videos.ps1 -Preset fast

# 平衡模式（推荐）
.\convert-videos.ps1 -Preset medium

# 慢速转换（质量更好）
.\convert-videos.ps1 -Preset slow
```

### 5. 覆盖已存在的文件

```powershell
.\convert-videos.ps1 -SkipExisting:$false
```

## 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|-----|------|-------|------|
| `-InputFolder` | String | `.` (当前目录) | 输入视频所在目录 |
| `-OutputFolder` | String | `converted` | 输出视频保存目录 |
| `-Quality` | String | `23` | CRF 质量值 (18-28，越小质量越高) |
| `-Preset` | String | `medium` | 编码速度预设 (fast/medium/slow) |
| `-SkipExisting` | Switch | `$true` | 跳过已存在的输出文件 |

## 支持的输入格式

- MP4 (包括 H.265/HEVC 编码)
- MOV
- AVI
- MKV
- WMV
- FLV
- M4V
- WebM

## 输出格式

- 容器：MP4
- 视频编码：H.264 (x264)
- 音频编码：AAC, 128 kbps
- 优化：启用 faststart（优化在线播放）

## 示例场景

### 场景 1：转换单个不兼容的视频

```powershell
# 将视频文件放在某个文件夹中
cd "D:\problematic-videos"

# 运行脚本
D:\anaVIDEO\scripts\convert-videos.ps1

# 转换后的文件在 D:\problematic-videos\converted\ 目录中
```

### 场景 2：批量转换 iPhone 录制的视频

```powershell
# iPhone 视频通常是 H.265/HEVC 编码
.\convert-videos.ps1 -InputFolder "D:\iPhone-Videos" -OutputFolder "D:\Web-Compatible-Videos" -Quality 20
```

### 场景 3：快速转换大量视频（质量适中）

```powershell
.\convert-videos.ps1 -Preset fast -Quality 25
```

### 场景 4：高质量转换（用于重要视频）

```powershell
.\convert-videos.ps1 -Preset slow -Quality 18 -OutputFolder "high-quality"
```

## 故障排除

### 错误：无法加载脚本（执行策略限制）

```powershell
# 临时允许运行脚本（仅当前会话）
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# 然后再运行脚本
.\convert-videos.ps1
```

### 错误：未找到 FFmpeg

- 确认 FFmpeg 已安装：`ffmpeg -version`
- 确认 FFmpeg 在 PATH 中
- 重新打开 PowerShell

### 转换速度很慢

- 使用 `-Preset fast` 加快速度
- 提高 `-Quality` 值（如 25 或 28）
- 检查 CPU 使用率（FFmpeg 会占用较多 CPU）

### 输出文件很大

- 降低 `-Quality` 值（如 25 或 28）
- 检查输入视频的分辨率（可能需要降低分辨率）

## 高级技巧

### 只转换特定格式的文件

修改脚本第 43 行，例如只转换 MOV 文件：

```powershell
$videoExtensions = @("*.mov")
```

### 添加分辨率缩放

修改脚本第 79-89 行的 FFmpeg 参数，添加：

```powershell
$arguments = @(
    "-i", $file.FullName,
    "-vf", "scale=1280:720",  # 缩放到 720p
    "-c:v", "libx264",
    # ... 其他参数
)
```

### 转换后自动删除原文件（危险！）

在脚本第 102 行后添加：

```powershell
if ($process.ExitCode -eq 0) {
    # ... 现有代码
    Remove-Item $file.FullName -Force
}
```

## 质量参考表

| CRF 值 | 质量 | 用途 | 文件大小（相对） |
|-------|------|------|----------------|
| 18 | 接近无损 | 归档、重要视频 | 最大 |
| 20 | 优秀 | 高质量需求 | 大 |
| 23 | 良好（推荐） | 日常使用 | 中等 |
| 25 | 可接受 | 快速转换 | 小 |
| 28 | 可用 | 临时文件 | 最小 |

## 时间估算

转换时间取决于：
- 视频长度
- 输入分辨率
- CPU 性能
- Preset 设置

**参考数据**（Intel i5, 1080p 视频）：
- Fast preset: 1 分钟视频 ≈ 20 秒
- Medium preset: 1 分钟视频 ≈ 45 秒
- Slow preset: 1 分钟视频 ≈ 2 分钟

## 相关文档

- [视频格式兼容性指南](../docs/VIDEO_FORMAT_GUIDE.md)
- [视频加载错误分析](../docs/VIDEO_LOADING_ERROR_ANALYSIS.md)

## 许可

此脚本为 anaVIDEO 项目的一部分，遵循项目许可证。
FFmpeg 本身遵循 LGPL/GPL 许可证。
