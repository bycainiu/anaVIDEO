# anaVIDEO 后端服务器

## 功能特性

- 视频文件上传和存储
- 视频帧自动提取（使用FFmpeg）
- 视频分析结果持久化（SQLite数据库）
- 关键词搜索和检索
- RESTful API接口

## 依赖要求

1. **Node.js** (v18+)
2. **FFmpeg** - 需要在系统PATH中可用
   - Windows: 下载FFmpeg并添加到PATH
   - 检查: 运行 `ffmpeg -version`

## 安装

```bash
cd server
npm install
```

## 启动服务器

```bash
npm start
```

服务器将在 `http://localhost:3002` 启动

## API 接口

### 健康检查
```
GET /api/health
```

### 获取所有视频
```
GET /api/videos
GET /api/videos?search=关键词
```

### 获取单个视频详情
```
GET /api/videos/:id
```

### 上传视频并提取帧
```
POST /api/videos/upload
Content-Type: multipart/form-data

Body: { video: File }

Response: {
  videoId: string,
  videoName: string,
  framesData: Array<{timestamp: number, base64Data: string}>,
  frameCount: number
}
```

### 保存视频分析结果
```
POST /api/videos/:id/analysis
Content-Type: application/json

Body: {
  videoName: string,
  analysis: VideoAnalysisResult,
  frames: string[]
}
```

### 删除视频
```
DELETE /api/videos/:id
```

### 静态文件访问
```
GET /videos/:videoId/:filename    # 访问视频文件
GET /frames/:videoId/:framename   # 访问帧图片
```

## 数据存储

- **数据库**: `server/data/anavideo.db` (SQLite)
- **视频文件**: `server/storage/videos/`
- **帧图片**: `server/storage/frames/`

## 数据迁移

打开项目根目录的 `migrate-data.html` 文件，可以将浏览器IndexedDB中的数据迁移到后端服务器。

## 测试接口

```bash
# 健康检查
curl http://localhost:3002/api/health

# 获取所有视频
curl http://localhost:3002/api/videos

# 搜索视频
curl "http://localhost:3002/api/videos?search=关键词"
```

## 故障排除

### 服务器无法启动
1. 检查端口3002是否被占用
2. 查看控制台错误信息

### FFmpeg错误
1. 确保FFmpeg已安装: `ffmpeg -version`
2. Windows用户需要将FFmpeg添加到系统PATH

### 数据库错误
1. 删除 `server/data/anavideo.db` 重新创建
2. 检查文件权限
