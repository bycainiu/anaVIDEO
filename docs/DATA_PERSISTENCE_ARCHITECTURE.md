# 数据持久化架构设计 / Data Persistence Architecture

## 📋 目录 / Table of Contents
1. [当前架构分析](#current-architecture)
2. [问题与挑战](#problems-and-challenges)
3. [推荐架构方案](#recommended-architecture)
4. [实施路线图](#implementation-roadmap)
5. [性能优化策略](#performance-optimization)
6. [未来扩展性](#future-scalability)

---

## 🔍 当前架构分析 / Current Architecture Analysis

### 当前数据存储方式

#### 1. **IndexedDB (Browser)**
- **存储内容**:
  - 视频文件 (Blob)
  - 视频分析结果 (JSON)
  - 帧图像数据 (Base64)

- **优点**:
  - ✅ 浏览器原生支持
  - ✅ 异步操作，不阻塞 UI
  - ✅ 可存储大量数据 (理论上无限制)

- **缺点**:
  - ❌ 数据易丢失（清除浏览器缓存）
  - ❌ 无法跨设备同步
  - ❌ 没有版本控制
  - ❌ 查询性能有限
  - ❌ 无法进行复杂的语义搜索

#### 2. **数据结构**
```typescript
interface AnalyzedVideo {
  id: string;
  name: string;
  file?: File;
  frames: string[];  // Base64 encoded images
  analysis: {
    overallSummary: { en: string; cn: string };
    frameAnalyses: Array<{
      timestamp: number;
      personDescription: { en: string; cn: string };
      clothingDescription: { en: string; cn: string };
      actionDescription: { en: string; cn: string };
      inferredBehavior: { en: string; cn: string };
      keywords: { en: string[]; cn: string[] };
      expandedKeywords: { en: string[]; cn: string[] };
    }>;
  };
}
```

---

## ⚠️ 问题与挑战 / Problems and Challenges

### 1. **数据可靠性问题**
- 用户清除浏览器缓存 → 所有数据丢失
- 浏览器崩溃 → 可能导致数据损坏
- 无备份机制

### 2. **性能问题**
- Base64 编码的图像占用大量空间
- IndexedDB 查询速度慢（尤其是大量数据时）
- 无法进行全文搜索或语义搜索

### 3. **扩展性问题**
- 无法支持多用户协作
- 无法跨设备访问
- 无法集成高性能搜索引擎

### 4. **数据一致性问题**
- 视频文件与分析结果可能不同步
- 没有事务支持
- 数据迁移困难

---

## 🏗️ 推荐架构方案 / Recommended Architecture

### 方案 A: 混合架构（短期 - 1-3 个月）

**适用场景**: 快速改进现有系统，保持前端独立性

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React + Vite)                 │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  IndexedDB   │  │ localStorage │  │  File API    │      │
│  │  (临时缓存)   │  │  (用户设置)   │  │  (视频文件)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         ↓                  ↓                  ↓              │
│  ┌──────────────────────────────────────────────────┐       │
│  │         Data Export/Import Layer                 │       │
│  │  (JSON Export, Backup to Cloud Storage)         │       │
│  └──────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
         ↓ (Optional)
┌─────────────────────────────────────────────────────────────┐
│                    Cloud Storage (可选)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Google Drive │  │   Dropbox    │  │     AWS S3   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

#### 核心改进
1. **自动备份机制**
   - 定期导出数据到本地文件系统
   - 支持导出为 JSON 格式
   - 可选：备份到云存储 (Google Drive API)

2. **数据版本控制**
   - 每次修改记录版本号
   - 支持回滚到历史版本

3. **数据验证层**
   - 写入前验证数据完整性
   - 自动修复损坏的数据

---

### 方案 B: 全栈架构（中期 - 3-6 个月）

**适用场景**: 需要多用户、跨设备、高性能搜索

```
┌─────────────────────────────────────────────────────────────┐
│                   Frontend (React + Vite)                    │
│  ┌──────────────────────────────────────────────────┐       │
│  │         Local Cache (IndexedDB + Service Worker) │       │
│  └──────────────────────────────────────────────────┘       │
└────────────────────────────┬────────────────────────────────┘
                             │ REST API / GraphQL
┌────────────────────────────┴────────────────────────────────┐
│                     Backend API Server                       │
│                  (Node.js + Express / FastAPI)               │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Business   │  │  Auth Layer  │  │  API Routes  │      │
│  │    Logic     │  │   (JWT)      │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────┐
│                    Data Layer                                │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  PostgreSQL  │  │    Redis     │  │  Meilisearch │      │
│  │ (主数据库)    │  │  (缓存层)     │  │  (全文搜索)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │   AWS S3 /   │  │  Qdrant /    │                        │
│  │  MinIO       │  │  Weaviate    │                        │
│  │ (视频存储)    │  │ (向量搜索)    │                        │
│  └──────────────┘  └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

#### 技术栈推荐

##### 1. **关系型数据库: PostgreSQL**
**用途**: 存储结构化数据（用户信息、视频元数据、分析结果）

```sql
-- 视频表
CREATE TABLE videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    duration FLOAT,
    size BIGINT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 帧分析表
CREATE TABLE frame_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    timestamp FLOAT NOT NULL,
    person_description JSONB,
    clothing_description JSONB,
    action_description JSONB,
    inferred_behavior JSONB,
    keywords JSONB,
    expanded_keywords JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX idx_video_user ON videos(user_id);
CREATE INDEX idx_frame_video ON frame_analyses(video_id);
CREATE INDEX idx_frame_timestamp ON frame_analyses(timestamp);
CREATE INDEX idx_keywords ON frame_analyses USING GIN (keywords);
```

##### 2. **对象存储: MinIO / AWS S3**
**用途**: 存储视频文件和缩略图

- 分离存储层，减轻数据库压力
- 支持 CDN 加速
- 可扩展性强

##### 3. **全文搜索引擎: Meilisearch**
**用途**: 高性能的关键词和语义搜索

```javascript
// 索引结构
{
  "id": "video_frame_uuid",
  "video_id": "video_uuid",
  "timestamp": 120.5,
  "keywords": ["woman", "yoga", "tattoo"],
  "expanded_keywords": ["female", "exercise", "body art"],
  "descriptions": {
    "person": "Female with tattoos",
    "action": "Performing yoga pose",
    "clothing": "Athletic wear"
  },
  "embeddings": [0.1, 0.2, ...]  // 向量嵌入（用于语义搜索）
}
```

**优势**:
- 🚀 亚秒级搜索速度
- 🎯 模糊匹配和拼写纠错
- 🌐 多语言支持
- 📊 相关性排序

##### 4. **向量数据库: Qdrant / Weaviate**
**用途**: 语义相似度搜索

```javascript
// 将描述转换为向量嵌入
const embedding = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: "Woman doing yoga with tattoos"
});

// 存储到向量数据库
await qdrant.upsert({
  collection: "video_frames",
  points: [{
    id: frameId,
    vector: embedding.data[0].embedding,
    payload: {
      video_id: videoId,
      timestamp: 120.5,
      description: "..."
    }
  }]
});

// 语义搜索
const results = await qdrant.search({
  collection: "video_frames",
  vector: queryEmbedding,
  limit: 10
});
```

##### 5. **缓存层: Redis**
**用途**: 缓存热点数据，减少数据库查询

```javascript
// 缓存视频分析结果
await redis.setex(
  `video:${videoId}:analysis`,
  3600,  // 1 hour TTL
  JSON.stringify(analysisData)
);

// 缓存搜索结果
await redis.setex(
  `search:${searchQuery}`,
  1800,  // 30 minutes
  JSON.stringify(searchResults)
);
```

---

### 方案 C: 企业级架构（长期 - 6-12 个月）

**适用场景**: 大规模数据、多租户、高并发

```
                         ┌─────────────────┐
                         │  Load Balancer  │
                         │    (Nginx)      │
                         └────────┬────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
┌────────▼────────┐   ┌───────────▼──────────┐   ┌────────▼────────┐
│  API Gateway 1  │   │   API Gateway 2      │   │  API Gateway N  │
│  (GraphQL)      │   │   (GraphQL)          │   │  (GraphQL)      │
└────────┬────────┘   └───────────┬──────────┘   └────────┬────────┘
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
┌────────▼────────┐   ┌───────────▼──────────┐   ┌────────▼────────┐
│ Microservice 1  │   │  Microservice 2      │   │ Microservice 3  │
│ (Video Upload)  │   │  (AI Analysis)       │   │ (Search/Query)  │
└────────┬────────┘   └───────────┬──────────┘   └────────┬────────┘
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  │
    ┌─────────────────────────────┼─────────────────────────────┐
    │                             │                             │
┌───▼────┐  ┌────────┐  ┌────────▼────┐  ┌─────────┐  ┌───────▼────┐
│ Postgres│  │ Redis  │  │ Elasticsearch│  │ S3/MinIO│  │   Qdrant   │
│ Cluster │  │Cluster │  │   Cluster    │  │ Cluster │  │   Cluster  │
└─────────┘  └────────┘  └──────────────┘  └─────────┘  └────────────┘
```

---

## 🗺️ 实施路线图 / Implementation Roadmap

### Phase 1: 紧急修复与改进（1-2 周）

#### 1.1 数据导出/导入功能
```typescript
// services/dataExportService.ts
export async function exportAllData(): Promise<Blob> {
  const videos = await getAllVideos();
  const exportData = {
    version: "1.0.0",
    exportDate: new Date().toISOString(),
    videos: videos.map(v => ({
      ...v,
      file: undefined  // 不导出文件，仅导出元数据
    }))
  };
  
  const json = JSON.stringify(exportData, null, 2);
  return new Blob([json], { type: 'application/json' });
}

export async function importData(file: File): Promise<void> {
  const text = await file.text();
  const data = JSON.parse(text);
  
  // 验证数据格式
  if (!validateImportData(data)) {
    throw new Error('Invalid data format');
  }
  
  // 导入数据
  for (const video of data.videos) {
    await saveVideoAnalysis(video.id, video);
  }
}
```

#### 1.2 自动备份机制
```typescript
// services/autoBackupService.ts
export function setupAutoBackup() {
  // 每天自动备份一次
  setInterval(async () => {
    const backup = await exportAllData();
    const url = URL.createObjectURL(backup);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString()}.json`;
    a.click();
  }, 24 * 60 * 60 * 1000);  // 24 hours
}
```

#### 1.3 数据验证层
```typescript
// services/dataValidationService.ts
export function validateVideoAnalysis(video: AnalyzedVideo): boolean {
  if (!video.id || !video.name) return false;
  if (!video.analysis?.frameAnalyses) return false;
  if (!Array.isArray(video.analysis.frameAnalyses)) return false;
  
  for (const frame of video.analysis.frameAnalyses) {
    if (typeof frame.timestamp !== 'number') return false;
    if (!frame.keywords?.en || !Array.isArray(frame.keywords.en)) return false;
  }
  
  return true;
}
```

---

### Phase 2: 后端 API 开发（4-6 周）

#### 2.1 技术栈选择
- **后端框架**: Node.js + Express / FastAPI (Python)
- **ORM**: Prisma (Node.js) / SQLAlchemy (Python)
- **认证**: JWT + OAuth 2.0
- **API 风格**: REST + GraphQL

#### 2.2 核心 API 端点
```typescript
// REST API 设计
POST   /api/videos/upload          // 上传视频
GET    /api/videos                 // 获取视频列表
GET    /api/videos/:id             // 获取单个视频
PUT    /api/videos/:id             // 更新视频
DELETE /api/videos/:id             // 删除视频
POST   /api/videos/:id/analyze     // 触发分析
GET    /api/videos/:id/frames      // 获取帧列表
GET    /api/search                 // 搜索视频
POST   /api/search/semantic        // 语义搜索
```

---

### Phase 3: 搜索引擎集成（2-4 周）

#### 3.1 Meilisearch 集成
```typescript
// services/searchService.ts
import { MeiliSearch } from 'meilisearch';

const client = new MeiliSearch({
  host: 'http://localhost:7700',
  apiKey: 'masterKey'
});

export async function indexVideoFrame(frame: FrameAnalysis) {
  const index = client.index('video_frames');
  
  await index.addDocuments([{
    id: frame.id,
    video_id: frame.videoId,
    timestamp: frame.timestamp,
    keywords: [...frame.keywords.en, ...frame.keywords.cn],
    descriptions: [
      frame.personDescription.en,
      frame.actionDescription.en,
      frame.clothingDescription.en
    ].join(' ')
  }]);
}

export async function searchFrames(query: string) {
  const index = client.index('video_frames');
  return await index.search(query, {
    limit: 20,
    attributesToHighlight: ['descriptions'],
    attributesToCrop: ['descriptions']
  });
}
```

---

## 🚀 性能优化策略 / Performance Optimization

### 1. **数据库优化**
- 使用连接池
- 创建合适的索引
- 定期 VACUUM 和 ANALYZE
- 分区大表

### 2. **缓存策略**
- Redis 缓存热点数据
- CDN 缓存静态资源
- Service Worker 缓存前端资源

### 3. **视频处理优化**
- 使用 FFmpeg 压缩视频
- 生成多种分辨率的缩略图
- 异步处理视频分析任务

### 4. **搜索优化**
- 使用 Meilisearch 的 typo tolerance
- 预计算常见查询结果
- 使用向量数据库进行语义搜索

---

## 🔮 未来扩展性 / Future Scalability

### 1. **多租户支持**
- 数据隔离
- 资源配额管理
- 独立的数据库实例

### 2. **实时协作**
- WebSocket 支持
- 实时通知
- 共享工作空间

### 3. **AI 增强**
- 自动标签生成
- 智能推荐
- 内容审核

### 4. **分析与报告**
- 视频观看分析
- 搜索热词统计
- 用户行为分析

---

## 📚 推荐的开源组件

### 数据库
- **PostgreSQL**: https://www.postgresql.org/
- **Redis**: https://redis.io/

### 搜索引擎
- **Meilisearch**: https://www.meilisearch.com/
- **Typesense**: https://typesense.org/

### 向量数据库
- **Qdrant**: https://qdrant.tech/
- **Weaviate**: https://weaviate.io/

### 对象存储
- **MinIO**: https://min.io/
- **AWS S3**: https://aws.amazon.com/s3/

### 消息队列
- **RabbitMQ**: https://www.rabbitmq.com/
- **Apache Kafka**: https://kafka.apache.org/

---

## 💡 总结与建议

### 短期（1-3 个月）
1. ✅ 实现数据导出/导入功能
2. ✅ 添加自动备份机制
3. ✅ 加强数据验证

### 中期（3-6 个月）
1. 🔨 开发后端 API
2. 🔨 集成 PostgreSQL
3. 🔨 集成 Meilisearch

### 长期（6-12 个月）
1. 🚀 微服务架构
2. 🚀 向量搜索
3. 🚀 多租户支持

---

**作者**: AI Assistant  
**日期**: 2025-01-22  
**版本**: 1.0.0
