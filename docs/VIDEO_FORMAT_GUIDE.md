# 视频格式兼容性和转换指南

## 支持的视频格式

### ✅ 完全支持的格式

| 容器格式 | 视频编码 | 音频编码 | 浏览器支持 |
|---------|---------|---------|-----------|
| MP4 | H.264 (AVC) | AAC | Chrome, Firefox, Safari, Edge (全部) |
| WebM | VP8, VP9 | Vorbis, Opus | Chrome, Firefox, Edge (部分) |
| OGG | Theora | Vorbis | Chrome, Firefox (部分) |

### ⚠️ 部分支持的格式

| 容器格式 | 视频编码 | 问题 | 解决方案 |
|---------|---------|------|---------|
| MP4 | H.265 (HEVC) | Chrome/Firefox 不支持 | 转换为 H.264 |
| MOV | ProRes, H.264 | 容器问题 | 转换为 MP4 |
| MKV | 各种 | 容器问题 | 转换为 MP4 |
| AVI | 各种 | 容器过时 | 转换为 MP4 |

### ❌ 不支持的格式

- FLV (Flash Video) - 已废弃
- WMV (Windows Media Video) - 专有格式
- RMVB (RealMedia) - 专有格式
- 大多数专业编辑格式（ProRes, DNxHD 等）

## 常见错误码

根据你的错误信息：
```
Video error code 4: DEMUXER_ERROR_COULD_NOT_OPEN: FFmpegDemuxer: open context failed
```

### 错误码 4 - MEDIA_ERR_SRC_NOT_SUPPORTED

**含义**：浏览器无法打开或解析该视频文件

**常见原因**：
1. 使用了 H.265/HEVC 编码（最常见）
2. 容器格式不被支持（MOV, MKV, AVI 等）
3. 视频文件损坏或不完整
4. 使用了特殊的编码配置文件

## 推荐的视频设置

### 🎯 最佳兼容性配置

```
容器格式: MP4
视频编码: H.264 (x264)
音频编码: AAC
分辨率: 1920x1080 或更低
帧率: 30fps 或 60fps
比特率: 5-10 Mbps (1080p)
编码预设: Medium
质量: CRF 23 (推荐) 或 CRF 18-28
```

### 为什么选择这些设置？

- **MP4 + H.264**：所有现代浏览器都支持
- **AAC 音频**：通用音频格式
- **CRF 23**：视觉质量和文件大小的最佳平衡
- **30fps**：流畅且文件大小合理

## 视频转换工具

### 1. HandBrake（推荐）⭐

**免费、开源、跨平台**

#### 下载
- 官网：https://handbrake.fr/
- Windows/Mac/Linux 均可用

#### 快速转换步骤

1. **打开 HandBrake** 并拖入视频文件

2. **选择预设**：
   - 点击 "Presets" 面板
   - 选择 **"Fast 1080p30"** 或 **"General > Very Fast 1080p30"**

3. **确认设置**（通常无需修改）：
   - Video 标签：
     - Encoder: H.264 (x264)
     - Framerate: Same as source 或 30fps
     - Quality: Constant Quality, RF 23
   - Audio 标签：
     - Codec: AAC

4. **开始转换**：
   - 选择保存位置
   - 点击 "Start Encode"

#### 高级设置（可选）

```
Video 标签：
- Encoder Preset: Medium (更快用 Fast，更好画质用 Slow)
- Encoder Profile: Main 或 High
- Quality (Constant Quality): 
  - RF 18: 高画质，大文件
  - RF 23: 推荐，平衡
  - RF 28: 低画质，小文件

Dimensions 标签：
- 如果视频过大，可以降低分辨率
- Width: 1920 (1080p) 或 1280 (720p)
- 保持 "Keep Aspect Ratio" 选中

Audio 标签：
- Bitrate: 128 kbps (语音) 或 192 kbps (音乐)
```

### 2. FFmpeg（命令行）

**强大但需要技术知识**

#### 安装
- Windows: https://www.gyan.dev/ffmpeg/builds/
- Mac: `brew install ffmpeg`
- Linux: `sudo apt install ffmpeg`

#### 基本转换命令

```bash
# 基本转换（推荐）
ffmpeg -i input.mp4 -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 128k output.mp4

# 快速转换（较低画质）
ffmpeg -i input.mp4 -c:v libx264 -crf 28 -preset fast -c:a aac -b:a 128k output.mp4

# 高质量转换（较慢）
ffmpeg -i input.mp4 -c:v libx264 -crf 18 -preset slow -c:a aac -b:a 192k output.mp4

# 转换 H.265 到 H.264
ffmpeg -i input_hevc.mp4 -c:v libx264 -crf 23 -preset medium -c:a copy output_h264.mp4

# 降低分辨率
ffmpeg -i input.mp4 -vf scale=1280:720 -c:v libx264 -crf 23 -c:a aac output.mp4

# 批量转换（PowerShell）
Get-ChildItem *.mp4 | ForEach-Object {
    ffmpeg -i $_.Name -c:v libx264 -crf 23 -preset medium -c:a aac "converted_$($_.Name)"
}
```

### 3. 在线工具

#### CloudConvert
- 网址：https://cloudconvert.com/mp4-converter
- 优点：无需安装，支持多种格式
- 缺点：需要上传文件，有大小限制

#### Convertio
- 网址：https://convertio.co/zh/video-converter/
- 类似 CloudConvert

## 检查视频信息

### 使用 MediaInfo（推荐）

1. 下载：https://mediaarea.net/en/MediaInfo
2. 打开视频文件
3. 查看：
   - Format: 容器格式（应该是 MPEG-4）
   - Codec ID: 编码格式（应该是 avc1 而不是 hvc1）
   - Width/Height: 分辨率
   - Frame rate: 帧率

### 使用 FFprobe（命令行）

```bash
# 查看详细信息
ffprobe -i "Girl live 2.mp4"

# 只查看编码格式
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "Girl live 2.mp4"
```

## 针对你的具体错误

### "Girl live 2.mp4" 的问题诊断

根据错误信息 `DEMUXER_ERROR_COULD_NOT_OPEN`，这个文件很可能是：

1. **H.265/HEVC 编码** - Chrome 不支持
2. **容器损坏** - 文件头部有问题
3. **特殊编码参数** - 使用了浏览器不支持的配置

### 解决步骤

#### 步骤 1：检查编码格式

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "Girl live 2.mp4"
```

如果输出是 `hevc` 或 `h265`，那就是 H.265 编码问题。

#### 步骤 2：转换视频

**使用 HandBrake：**
1. 打开 HandBrake
2. 添加 "Girl live 2.mp4"
3. 选择预设 "Fast 1080p30"
4. 保存为 "Girl live 2_converted.mp4"
5. 开始转换

**或使用 FFmpeg：**
```bash
ffmpeg -i "Girl live 2.mp4" -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 128k "Girl live 2_converted.mp4"
```

#### 步骤 3：重新上传

使用转换后的 `Girl live 2_converted.mp4` 文件重新上传到系统。

## 预防措施

### 在录制/导出视频时

1. **始终使用 H.264 编码**
   - OBS Studio: Settings > Output > Encoder: x264
   - Premiere Pro: Export > H.264
   - Final Cut Pro: Export > Master File > H.264

2. **使用 MP4 容器**
   - 避免使用 MOV, MKV, AVI

3. **限制分辨率和帧率**
   - 最高 1920x1080
   - 30fps 或 60fps

4. **使用适中的比特率**
   - 1080p: 5-10 Mbps
   - 720p: 2-5 Mbps

## 系统优化建议

### 添加视频格式预检查（开发者）

可以在上传前添加格式检查：

```typescript
async function checkVideoFormat(file: File): Promise<{ compatible: boolean; message: string }> {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            resolve({ 
                compatible: false, 
                message: '无法读取视频元数据，文件可能已损坏或格式不支持' 
            });
        }, 5000);
        
        video.onloadedmetadata = () => {
            clearTimeout(timeout);
            // 可以添加更多检查，如分辨率、时长等
            resolve({ compatible: true, message: '格式兼容' });
        };
        
        video.onerror = () => {
            clearTimeout(timeout);
            resolve({ 
                compatible: false, 
                message: '视频格式不兼容，请转换为 H.264/MP4 格式' 
            });
        };
        
        video.src = URL.createObjectURL(file);
    });
}
```

## 常见问题 FAQ

### Q: 为什么 Chrome 不支持 H.265？
A: H.265/HEVC 受专利保护，需要授权费用。Chrome 选择不内置支持以避免授权成本。

### Q: Safari 支持 H.265 吗？
A: 在某些平台上支持（如 macOS、iOS），但不是跨平台的可靠解决方案。

### Q: 转换会损失画质吗？
A: 使用 CRF 23 几乎看不出差异。如果需要更高画质，使用 CRF 18。

### Q: 转换需要多长时间？
A: 取决于视频长度和电脑性能。通常 1 分钟的 1080p 视频需要 30 秒到 2 分钟。

### Q: 可以批量转换吗？
A: 可以。HandBrake 支持队列功能，FFmpeg 可以写脚本批量处理。

## 总结

**最佳实践：**
1. ✅ 使用 **MP4 + H.264 + AAC** 格式
2. ✅ 使用 **HandBrake** 转换不兼容的视频
3. ✅ 保持分辨率在 **1920x1080** 或以下
4. ✅ 使用 **CRF 23** 作为质量设置

**避免：**
1. ❌ H.265/HEVC 编码
2. ❌ MOV, MKV, AVI 容器
3. ❌ 过高的分辨率（4K+）
4. ❌ 不常见的编码格式
