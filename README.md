# anaVIDEO - 智能视频语义分析系统

> **An Intelligent Video Semantic Analysis System with Multi-Modal Understanding and Cross-Platform Download Capabilities**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://www.python.org/)
[![React](https://img.shields.io/badge/React-19.2.0-blue.svg)](https://reactjs.org/)

---

## § 概述 (Overview)

anaVIDEO 是一个基于多模态大语言模型的智能视频分析平台，集成了视频语义理解、语音转文本、跨平台下载、智能检索推荐等功能。系统采用分布式架构设计，支持在线/离线混合存储模式，可处理大规模视频数据集。

### § 核心特性 (Core Features)

| 功能模块 | 描述 | 技术栈 |
|:--------|:-----|:------|
| **视频语义分析** | 基于关键帧提取与多模态LLM的深度语义理解 | Gemini API / Custom API |
| **语音转字幕** | 本地化语音识别模型，支持中文语音识别 | zh_recogn (FunASR) |
| **跨平台下载** | 支持46+视频平台的解析与下载 | yt-dlp / bili23-core |
| **智能推荐** | 基于视频上下文的语义检索与聊天推荐 | Vector Search / LLM |
| **混合存储** | 在线/离线自适应存储，支持数据迁移 | SQLite / IndexedDB |
| **秒传机制** | 基于SHA256文件哈希的重复检测 | Crypto API |

---

## § 系统架构 (System Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                      前端层 (Frontend)                        │
│  React 19 + TypeScript + Vite + TailwindCSS                 │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │
│  │ 视频管理  │ 智能聊天  │ 图像生成  │ B站下载  │ 搜索检索 │  │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ RESTful API / WebSocket
┌────────────────────────┴────────────────────────────────────┐
│                     服务层 (Services)                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Node.js Express (Port 3004)                           │ │
│  │  - 视频上传与存储                                        │ │
│  │  - 帧提取与分析管理                                      │ │
│  │  - 字幕生成与查询                                        │ │
│  │  - SQLite 数据持久化                                     │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Python FastAPI (Port 8888)                            │ │
│  │  - B站视频解析与下载 (bili23-core)                      │ │
│  │  - 多站点下载服务 (yt-dlp)                              │ │
│  │  - WebSocket 实时进度推送                               │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Python Flask (Port 9527)                              │ │
│  │  - 本地语音识别服务 (zh_recogn)                            │ │
│  │  - FunASR Paraformer-zh 中文语音模型                           │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────┐
│                    外部服务层 (External)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Gemini API   │  │ Custom LLM   │  │ FFmpeg       │     │
│  │ 2.5 Flash/Pro  │  │ (OpenAI)     │  │ 视频处理     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### § 数据流 (Data Flow)

```
视频上传 → 文件哈希计算 → 秒传检测
    ↓ (不存在)
FFmpeg 提取音频 → zh_recogn 转写字幕 → SSE 实时推送
    ↓
关键帧提取 (24帧) → 感知哈希去重 → 保留约14-16关键帧
    ↓
字幕注入帧上下文 → 构建多模态Prompt → LLM分析
    ↓
结构化分析结果 → 保存至数据库 → 索引关键词
    ↓
前端渲染 + 语义检索 + 智能推荐
```

---

## § 安装与部署 (Installation)

### § 系统要求 (Requirements)

| 组件 | 最低版本 | 推荐版本 |
|:-----|:---------|:---------|
| Node.js | v18.0+ | v20.x |
| Python | v3.8+ | v3.11 |
| FFmpeg | v4.4+ | v6.0 |
| RAM | 8GB | 16GB+ |
| VRAM | - | 4GB+ (本地语音识别) |

### § 依赖安装 (Dependencies)

#### ① 前端依赖

```bash
# 安装前端依赖
npm install

# 依赖清单:
# - @google/genai: ^1.26.0  (Gemini SDK)
# - react: ^19.2.0
# - video.js: ^8.23.4
# - localforage: ^1.10.0
```

#### ② Node.js 后端依赖

```bash
cd server
npm install

# 主要依赖:
# - express: ^4.18.2
# - sql.js: ^1.10.3 (SQLite WASM)
# - fluent-ffmpeg: ^2.1.3
# - multer: ^1.4.5-lts.1 (文件上传)
```

#### ③ Python 依赖

```bash
# B站下载服务
pip install -r bili_requirements.txt
# fastapi, uvicorn, websockets, pydantic, httpx, beautifulsoup4

# 语音识别服务 (zh_recogn)
cd zh_recogn
pip install -r requirements.txt
# funasr, flask, waitress
```

#### ④ yt-dlp 安装 (可选，用于多站点下载)

```bash
# Windows
.\install_ytdlp.bat

# Linux/Mac
pip install yt-dlp
```

### § 配置文件 (Configuration)

复制环境变量模板并根据需要配置：

```bash
cp .env.example .env.local
```

**配置项说明：**

```ini
# === API 配置 ===
# Gemini API 密钥（支持多密钥轮询，逗号分隔）
VITE_GEMINI_API_KEY=your_gemini_key_1,your_gemini_key_2

# 自定义 LLM API（OpenAI 兼容）
VITE_OPENAI_API_KEY=your_openai_compatible_key
VITE_OPENAI_BASE_URL=https://api.example.com/v1
VITE_OPENAI_MODEL=gpt-4o-mini

# === 后端服务地址 ===
VITE_API_URL=http://localhost:3004
VITE_BILI_API_URL=http://localhost:8888
VITE_WHISPER_API_URL=http://localhost:9527

# === 功能开关 ===
# 视频分析时是否自动生成字幕
VITE_ENABLE_SUBTITLE_GENERATION=true

# === 模型配置 ===
# 关键帧提取数量（影响 token 消耗）
VITE_KEYFRAME_COUNT=24
# 去重阈值（感知哈希汉明距离）
VITE_SIMILARITY_THRESHOLD=5
```

---

## § 启动服务 (Service Startup)

### § 方式一：一键启动（推荐）

```powershell
# Windows PowerShell
.\start_all.ps1
```

**启动流程：**
1. **检查依赖** → Node.js / Python / FFmpeg
2. **清理端口** → 3004, 8888, 9527, 5173
3. **启动后端** → Express (3004)
4. **启动 Python API** → FastAPI (8888)
5. **启动语音服务** → Flask (9527) *(可选)*
6. **启动前端** → Vite Dev Server (5173)
7. **自动打开浏览器** → http://localhost:5173

### § 方式二：手动启动

#### ① Express 后端

```bash
cd server
npm start
# 监听端口: 3004
```

#### ② Python 下载服务

```bash
python bili_api_server.py
# 监听端口: 8888
# 支持的站点: B站、YouTube、Twitch、虎牙等46+平台
```

#### ③ 语音识别服务 (zh_recogn)

```bash
cd zh_recogn
python start.py
# 监听端口: 9527
# 首次启动会自动下载 FunASR 模型 (~1GB)
```

#### ④ 前端开发服务器

```bash
npm run dev
# 访问: http://localhost:5173
```

---

## § 功能详解 (Detailed Features)

### § 1. 视频语义分析全流程

#### 1.1 上传与预处理

```typescript
// 支持的视频格式
const SUPPORTED_FORMATS = [
  '.mp4', '.mov', '.avi', '.mkv', 
  '.webm', '.flv', '.wmv', '.m4v'
];

// 文件大小限制: 2GB
// 处理流程:
// 1. 计算 SHA256 文件哈希
// 2. 检查数据库是否存在相同哈希
// 3. 若存在 → 秒传（返回已有 videoId）
// 4. 若不存在 → 执行完整处理流程
```

#### 1.2 关键帧提取算法

```javascript
// 参数配置
const POTENTIAL_FRAMES = 24;  // 候选帧数量
const HASH_SIZE = 8;          // 感知哈希大小
const SIMILARITY_THRESHOLD = 5; // 汉明距离阈值

// 算法流程:
// 1. 等间隔采样 24 帧
// 2. 计算每帧的感知哈希 (pHash)
// 3. 去除相似帧（汉明距离 ≤ 5）
// 4. 最终保留约 14-16 关键帧
```

**感知哈希实现（Difference Hash）：**

```typescript
function createPerceptualHash(
  ctx: CanvasRenderingContext2D, 
  canvas: HTMLCanvasElement
): string {
  const smallSize = HASH_SIZE + 1;
  ctx.drawImage(canvas, 0, 0, smallSize, HASH_SIZE);
  const imageData = ctx.getImageData(0, 0, smallSize, HASH_SIZE);
  
  const grayPixels = [];
  for (let i = 0; i < imageData.data.length; i += 4) {
    const gray = 
      imageData.data[i] * 0.299 +      // R
      imageData.data[i + 1] * 0.587 +  // G
      imageData.data[i + 2] * 0.114;   // B
    grayPixels.push(gray);
  }
  
  let hash = '';
  for (let y = 0; y < HASH_SIZE; y++) {
    for (let x = 0; x < HASH_SIZE; x++) {
      hash += (grayPixels[y * smallSize + x] < 
               grayPixels[y * smallSize + x + 1]) ? '1' : '0';
    }
  }
  return hash;
}
```

#### 1.3 语音转文本（字幕生成）

**使用的模型：**

| 模型 | 类型 | 语言 | 精度 | 速度 |
|:-----|:-----|:-----|:-----|:-----|
| **FunASR Paraformer-zh** | 本地 | 中文 | 高 | 快 |

**处理流程：**

```
视频上传 → 后端接收
    ↓
FFmpeg 提取音频 → WAV 格式
    ↓
POST /api/transcribe → zh_recogn 服务
    ↓
FunASR Paraformer-zh 推理 → VAD 分段
    ↓
返回结构化字幕 (SRT/VTT)
    ↓
存储到数据库 + SSE 实时通知前端
```

**API 调用示例：**

```bash
curl -X POST http://localhost:9527/api \
  -F "audio=@video.mp4" \
  -o subtitles.json

# 返回格式:
{
  "code": 0,
  "msg": "ok",
  "data": [
    {
      "line": 1,
      "text": "这是一段测试语音",
      "start_time": 0,
      "end_time": 2500,
      "time": "00:00:00,000 --> 00:00:02,500"
    }
  ]
}
```

#### 1.4 多模态提示词构建

**字幕注入策略：**

```typescript
// 为每个关键帧查询前后5秒的字幕
const framesWithSubtitles = await Promise.all(
  keyframes.map(async (frame) => {
    const subtitles = await querySubtitlesAtTimestamp(
      videoId,
      frame.timestamp,
      5  // 上下文窗口: ±5秒
    );
    
    return {
      timestamp: frame.timestamp,
      base64Data: frame.base64Data,
      subtitleContext: subtitles.map(s => s.text).join(' ')
    };
  })
);
```

**Prompt 模板：**

```
你是一个专业的视频内容分析专家。

【任务】分析视频的关键帧，并结合语音字幕理解内容。

【输入数据】
- 关键帧数量: 16
- 每帧附带:
  1. 时间戳
  2. 画面图像（JPEG, 1024px, 0.6质量）
  3. 对应的语音字幕（±5秒范围）

【输出要求】
返回严格的JSON格式:
{
  "videoTitle": "视频标题",
  "overallSummary": {
    "en": "英文总结",
    "cn": "中文总结"
  },
  "frameAnalyses": [
    {
      "timestamp": 10.5,
      "personDescription": {"en": "...", "cn": "..."},
      "clothingDescription": {"en": "...", "cn": "..."},
      "actionDescription": {"en": "...", "cn": "..."},
      "inferredBehavior": {"en": "...", "cn": "..."},
      "keywords": {"en": [...], "cn": [...]},
      "expandedKeywords": {"en": [...], "cn": [...]}
    }
  ]
}
```

#### 1.5 LLM 分析

**支持的模型：**

| 提供商 | 模型 | 上下文长度 | 多模态 | 备注 |
|:-------|:-----|:-----------|:-------|:-----|
| **Google** | gemini-2.5-pro | 1M tokens | ✓ | 推荐 |

**Token 预算计算：**

```
基础 Prompt: ~2000 tokens
单帧图像 (1024px JPEG 0.6): ~1300 tokens
字幕文本: ~50 tokens/帧

总计 (16帧): 2000 + 16 × (1300 + 50) = ~23,600 tokens
输出预留: ~10,000 tokens
-----------------------------------
总需求: ~33,600 tokens (< Gemini 1M 限制)
```

---

### § 2. 跨平台视频下载

#### 2.1 支持的平台列表

系统集成了 **yt-dlp** 和 **bili23-core**，支持以下平台：

**中国大陆：**
- Bilibili (哔哩哔哩) - *使用 bili23-core，支持登录态*
- 虎牙直播 (Huya) - *支持实时直播流*
- 斗鱼直播 (Douyu)
- 西瓜视频 (Xigua)
- 腾讯视频 (Tencent Video)

**国际平台：**
- YouTube - *4K/8K 支持*
- Twitch - *直播+VOD*
- TikTok
- Twitter (X)
- Instagram
- Facebook
- Vimeo
- DailyMotion

**共计 46+ 平台**（完整列表见 yt-dlp 官方文档）

#### 2.2 B站下载详细教程

**步骤一：登录 B站账号**

```typescript
// 1. 浏览器访问 https://www.bilibili.com/
// 2. F12 打开开发者工具 → Application → Cookies
// 3. 复制以下 Cookie 值:
const bilibiliCookies = {
  SESSDATA: 'your_sessdata_value',
  bili_jct: 'your_csrf_token',
  DedeUserID: 'your_uid',
  DedeUserID__ckMd5: 'your_uid_md5'
};

// 4. 在前端界面 → B站下载 → 登录设置 → 粘贴Cookie
```

**步骤二：解析视频**

```bash
# API 调用
POST http://localhost:8888/api/bili/parse
Content-Type: application/json

{
  "url": "https://www.bilibili.com/video/BV1xx411c7XD"
}

# 响应示例
{
  "bvid": "BV1xx411c7XD",
  "title": "视频标题",
  "duration": 1234,
  "owner": {
    "name": "UP主昵称",
    "mid": 123456
  },
  "pic": "https://i0.hdslb.com/...",
  "quality_options": [
    {"quality": 120, "description": "4K"},
    {"quality": 80, "description": "1080P"},
    {"quality": 64, "description": "720P"}
  ]
}
```

**步骤三：下载视频**

```typescript
// 前端调用
const downloadResult = await fetch('http://localhost:8888/api/bili/download', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://www.bilibili.com/video/BV1xx411c7XD',
    quality: 80,  // 1080P
    output_dir: './downloads',
    filename: 'my_video'
  })
});

// WebSocket 实时进度
const ws = new WebSocket('ws://localhost:8888/ws/progress');
ws.onmessage = (event) => {
  const { type, task_id, data } = JSON.parse(event.data);
  if (type === 'progress') {
    console.log(`${data.progress}% - ${data.speed}`);
  }
};
```

**高级功能：批量下载**

```typescript
// 解析 UP主空间或番剧
POST /api/bili/parse
{
  "url": "https://space.bilibili.com/123456"
}

// 返回视频列表后批量下载
POST /api/bili/batch-download
{
  "bvids": ["BV1xxx...", "BV1yyy...", "BV1zzz..."],
  "quality": 80
}
```

#### 2.3 通用下载（yt-dlp）

**使用场景：** YouTube、Twitch、Twitter 等非B站平台

```typescript
// 解析
POST http://localhost:8888/api/universal/parse
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}

// 下载（自动选择最佳质量）
POST http://localhost:8888/api/universal/download
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "output_dir": "./downloads",
  "format": "bv*[height<=1080]+ba/best"  // 可选
}
```

**格式选择器语法：**

```bash
# 示例
bestvideo+bestaudio         # 最佳视频+音频（需合并）
bv*[height<=1080]+ba        # 1080P视频+最佳音频
worst                       # 最低质量（省流量）
bv*[ext=mp4]+ba[ext=m4a]    # 指定容器格式
```

---

### § 3. 智能推荐与检索

#### 3.1 语义检索原理

系统在视频分析时提取双语关键词，支持以下检索方式：

| 检索类型 | 描述 | 示例 |
|:---------|:-----|:-----|
| **标题搜索** | 模糊匹配视频名称 | "教程" |
| **关键词检索** | 匹配提取的关键词 | "机器学习" |
| **总结搜索** | 在视频总结中检索 | "如何优化算法" |
| **时间戳定位** | 跳转到特定内容 | "10:30 处的讲解" |

**SQL 查询示例：**

```sql
-- 多字段联合搜索
SELECT v.*, 
       GROUP_CONCAT(f.keywords_cn) as all_keywords
FROM videos v
LEFT JOIN frames f ON v.id = f.video_id
WHERE v.name LIKE '%关键词%'
   OR v.overall_summary_cn LIKE '%关键词%'
   OR f.keywords_cn LIKE '%关键词%'
GROUP BY v.id
ORDER BY v.created_at DESC;
```

#### 3.2 聊天式推荐

**上下文注入：**

```typescript
// 自动加载所有视频的摘要信息
const videoContext = await getVideoContext({
  maxVideos: 30,         // 最多加载30个视频
  maxTokensPerVideo: 150, // 每个视频150 tokens
  language: 'cn',
  includeFrameDetails: false
});

// 构建系统提示词
const systemPrompt = `
你是一个专业的视频助手。

当前视频库:
${videoContext}

用户可能会问:
1. "有哪些关于XX的视频？"
2. "推荐一些YY相关的内容"
3. "视频[ID]讲了什么？"

请基于视频库数据准确回答。
`;
```

**智能推荐示例：**

```
用户: "有没有关于深度学习的视频？"

AI: 找到以下相关视频：

1. 【视频 abc-123】《深度学习入门教程》
   - 时长: 45分钟
   - 关键词: 神经网络, 反向传播, PyTorch
   - 摘要: 从零开始讲解深度学习基础概念...

2. 【视频 def-456】《CNN卷积神经网络实战》
   - 时长: 1小时20分
   - 关键词: 卷积, 池化, 图像分类
   - 摘要: 使用TensorFlow实现经典CNN架构...

点击视频ID即可播放。
```

---

### § 4. 离线功能与数据迁移

#### 4.1 混合存储架构

```typescript
// 存储优先级
const storageStrategy = {
  online: {
    primary: 'Express Backend (SQLite)',
    features: [
      '视频文件存储',
      '帧图像存储',
      '字幕数据',
      '秒传机制'
    ]
  },
  offline: {
    fallback: 'IndexedDB (LocalForage)',
    features: [
      '分析结果缓存',
      '视频文件 (Blob)',
      '离线访问'
    ]
  }
};

// 自动降级逻辑
async function saveAnalysis(video, analysis) {
  try {
    // 尝试在线保存
    await backend.save(video, analysis);
  } catch (error) {
    // 降级到本地
    console.warn('Backend unavailable, using local storage');
    await localStorage.save(video, analysis);
  }
}
```

#### 4.2 数据迁移工具

**使用场景：**
- 从本地 IndexedDB 迁移到服务器
- 服务器数据备份到本地
- 跨设备同步

**迁移步骤：**

```typescript
// 1. 打开迁移工具
// 前端界面 → 设置 → 数据迁移

// 2. 检测数据源
const localVideos = await localforage.getItem('analyzedVideos');
const serverVideos = await fetch('/api/videos').then(r => r.json());

console.log(`本地视频: ${Object.keys(localVideos).length}`);
console.log(`服务器视频: ${serverVideos.length}`);

// 3. 执行迁移
for (const [videoId, video] of Object.entries(localVideos)) {
  // 检查服务器是否已存在
  const exists = serverVideos.some(v => v.id === videoId);
  if (!exists) {
    // 上传视频文件
    const videoBlob = await localforage.getItem(`video_${videoId}`);
    const formData = new FormData();
    formData.append('video', videoBlob, video.name);
    
    // 上传分析结果
    await fetch('/api/videos/upload', {
      method: 'POST',
      body: formData
    });
  }
}
```

**冲突处理：**

| 情况 | 策略 | 备注 |
|:-----|:-----|:-----|
| 相同 videoId | 跳过 | 以服务器为准 |
| 相同文件哈希 | 秒传 | 自动关联 |
| 不同分析结果 | 保留最新 | 按 updatedAt 判断 |

---

### § 5. 提示词预设系统

#### 5.1 预设模板

系统内置了针对不同视频类型的分析模板：

```typescript
const promptPresets = {
  教程视频: {
    focus: ['步骤分解', '关键操作', '注意事项'],
    keywords: ['教程', '演示', '操作', '步骤'],
    outputFormat: '按时间轴列出关键步骤'
  },
  
  会议记录: {
    focus: ['发言人', '议题', '决策'],
    keywords: ['会议', '讨论', '决定', '任务'],
    outputFormat: '结构化会议纪要'
  },
  
  娱乐视频: {
    focus: ['情节', '情绪', '高潮'],
    keywords: ['搞笑', '剧情', '反转', '情绪'],
    outputFormat: '情节概要 + 精彩时刻'
  },
  
  技术分享: {
    focus: ['技术栈', '架构', '代码示例'],
    keywords: ['技术', '架构', '实现', '优化'],
    outputFormat: '技术要点 + 代码片段'
  }
};
```

#### 5.2 自定义提示词

**配置路径：** 设置 → 高级 → 提示词编辑器

```typescript
// 自定义模板示例
const customPrompt = `
你是一个专注于{{videoType}}的分析专家。

分析重点:
{{#each focusPoints}}
- {{this}}
{{/each}}

输出格式:
{{outputFormat}}

额外要求:
- 使用{{language}}语言
- 详细程度: {{detailLevel}}
- 提取{{keywordCount}}个关键词
`;

// 变量注入
const finalPrompt = customPrompt
  .replace('{{videoType}}', '教育培训')
  .replace('{{language}}', '中文')
  .replace('{{detailLevel}}', '详细')
  .replace('{{keywordCount}}', '10');
```

---

## § 性能优化 (Performance Optimization)

### § 6.1 关键优化点

| 优化项 | 方法 | 效果 |
|:-------|:-----|:-----|
| **视频下载** | 多线程分片下载 + 断点续传 | 提速 3-5x |
| **帧提取** | Canvas 硬件加速 + Worker 并发 | 减少 40% 时间 |
| **字幕识别** | VAD 预过滤 + 批处理 | 降低 60% 无效推理 |
| **关键帧去重** | 感知哈希 + 汉明距离 | O(n) 复杂度 |
| **数据库查询** | 索引优化 + 查询缓存 | 查询时间 <10ms |
| **前端渲染** | 虚拟滚动 + 懒加载 | 支持 1000+ 视频 |

### § 6.2 Token 优化策略

```typescript
// 图像压缩
const compressFrame = (dataUrl: string): string => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const img = new Image();
  img.src = dataUrl;
  
  // 限制最大宽度为 1024px
  const maxWidth = 1024;
  const scale = Math.min(1, maxWidth / img.width);
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  
  // JPEG 质量 0.6（平衡质量与大小）
  return canvas.toDataURL('image/jpeg', 0.6);
};

// 节省约 50% tokens
// 原始 PNG (1920x1080): ~2500 tokens
// 压缩 JPEG (1024xN, 0.6): ~1300 tokens
```

---

## § 待优化功能 (Future Improvements)

### § 7.1 已知限制

| 模块 | 当前状态 | 待优化点 |
|:-----|:---------|:---------|
| **视频下载** | 基础功能完成 | • 下载队列管理优化<br>• 更好的错误重试机制<br>• 支持更多小众平台 |
| **聊天推荐** | 基于关键词匹配 | • 引入向量数据库（如 Qdrant）<br>• 基于 Embedding 的语义搜索<br>• 多轮对话上下文记忆 |
| **字幕识别** | 单一模型 | • 支持多语言模型切换<br>• 实时流式识别<br>• 说话人分离（Diarization） |
| **关键帧识别** | 感知哈希去重 | • 基于场景检测的智能分割<br>• 运动估计 + 光流分析<br>• 自适应帧率采样 |
| **视频分析** | LLM 推理 | • 本地化多模态模型（如 LLaVA）<br>• 流式输出（SSE）<br>• 批量处理优化 |
| **视频检索** | 关键词匹配 | • CLIP 视觉编码器<br>• 向量近邻搜索（ANN）<br>• 跨模态检索（图搜视频） |

### § 7.2 Roadmap

#### **v2.0 计划特性**

```
Q2 2025
├─ 引入向量数据库（Qdrant / Milvus）
├─ CLIP 图像编码 → 语义检索
├─ 实时字幕流式识别
└─ 本地化 LLaVA 模型推理

Q3 2025
├─ 说话人分离（Diarization）
├─ 场景检测（PySceneDetect）
├─ 移动端 App（React Native）
└─ 云端部署方案（Docker + K8s）

Q4 2025
├─ 跨模态检索（图/文搜视频）
├─ 视频摘要自动生成
├─ AI 剪辑推荐
└─ 协同标注工具
```

---

## § 致谢与参考 (Acknowledgments)

本项目参考并集成了以下优秀开源项目：

### § 核心依赖

| 项目 | 作者 | 功能 | 许可证 |
|:-----|:-----|:-----|:-------|
| [**yt-dlp**](https://github.com/yt-dlp/yt-dlp) | yt-dlp team | 多平台视频下载 | Unlicense |
| [**FunASR**](https://github.com/alibaba-damo-academy/FunASR) | Alibaba DAMO Academy | 语音识别模型 | MIT |
| [**FFmpeg**](https://ffmpeg.org/) | FFmpeg Developers | 视频处理 | LGPL/GPL |
| [**Gemini API**](https://ai.google.dev/) | Google | 多模态大语言模型 | Proprietary |

### § 参考实现

- **Bilibili 下载核心**: [bili23-download](https://github.com/ScottSloan/Bili23-Downloader) by ScottSloan
- **感知哈希算法**: [Looks Like It](https://www.hackerfactor.com/blog/index.php?/archives/432-Looks-Like-It.html) by Dr. Neal Krawetz
- **视频关键帧提取**: [PySceneDetect](https://github.com/Breakthrough/PySceneDetect)
- **字幕格式处理**: [FFmpeg subtitle filters](https://ffmpeg.org/ffmpeg-filters.html#subtitles-1)

### § 特别鸣谢

- **Bilibili API 逆向**: 感谢 bilibili-API-collect 项目提供的接口文档
- **Whisper 模型**: OpenAI 提供的高质量语音识别模型
- **React 生态**: Vite、TailwindCSS、video.js 等工具链

---

## § 许可证 (License)

```
MIT License

Copyright (c) 2025 anaVIDEO Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software...
```

**免责声明：**
- 本软件仅供学习研究使用
- 使用本软件下载视频需遵守各平台服务条款
- 请勿用于侵犯版权的商业用途
- 作者不对因使用本软件导致的法律问题负责

---

**最后更新**: 2025-10-25  
**文档版本**: v1.0.0  
**系统版本**: anaVIDEO v1.0.0

---

<div align="center">

**Made with ❤️ for Video Researchers**

[⬆ 回到顶部](#anavideo---智能视频语义分析系统)

</div>

