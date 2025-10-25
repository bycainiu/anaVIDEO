# 视频加载错误详细分析

## 错误现象

```
App.tsx:213 
Analysis failed: 
Event {isTrusted: true, type: 'error', target: video.hidden, currentTarget: video.hidden, eventPhase: 2, …}
```

## 错误原因分析

### 1. 根本原因：并发竞争条件（Race Condition）

**问题代码：**
```typescript
// 旧代码 - 有问题的实现
const video = videoRef.current;  // 所有任务共享同一个video元素
const canvas = canvasRef.current; // 所有任务共享同一个canvas元素
video.src = videoUrl; // ⚠️ 当并发时，后一个任务会立即覆盖前一个任务的src
```

**问题场景：**
```
时间线：
t0: 视频A开始处理，设置 video.src = urlA
t1: 视频B开始处理，设置 video.src = urlB （覆盖了urlA！）
t2: 视频A的 onloadedmetadata 可能永远不会触发
t3: 视频A的 onerror 被触发（因为video元素已经加载的是urlB）
```

### 2. 错误触发位置

```typescript
// Line 210
video.onerror = reject;  // 当视频加载失败时触发
```

### 3. 可能的具体原因

#### A. 并发冲突（最主要）
- 代码配置了 `MAX_CONCURRENT_VIDEOS = 2`
- 但所有并发任务共享同一个 `<video>` 和 `<canvas>` 元素
- 导致后启动的任务覆盖前面任务的状态

#### B. 视频格式问题
- 浏览器不支持的编码格式（如 H.265/HEVC）
- 损坏的视频文件
- 不完整的视频元数据

#### C. 内存/资源限制
- 视频文件过大
- 浏览器内存不足
- Blob URL 提前失效

## 解决方案

### ✅ 已实现的修复

#### 1. 为每个任务创建独立的 video 和 canvas 元素

```typescript
// 新代码 - 修复后的实现
const processFile = async (fileToProcess: File) => {
    // 为每个处理任务创建独立的video和canvas元素
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    
    // 现在每个任务都有自己的元素，不会互相干扰
    video.src = videoUrl; // ✅ 安全
}
```

#### 2. 添加超时保护机制

```typescript
// 防止视频加载永久卡住
const timeout = setTimeout(() => {
    reject(new Error(`Video loading timeout after 30s: ${fileToProcess.name}`));
}, 30000);

video.onloadedmetadata = async () => {
    clearTimeout(timeout); // 成功加载后清除超时
    // ... 处理逻辑
};
```

#### 3. 增强错误信息

```typescript
video.onerror = (e) => {
    clearTimeout(timeout);
    console.error('[Video Loading] Error loading video:', fileToProcess.name, e);
    
    // 提供详细的错误码和信息
    const errorMessage = video.error ? 
        `Video error code ${video.error.code}: ${video.error.message}` : 
        'Unknown video loading error';
    
    reject(new Error(`${errorMessage} (File: ${fileToProcess.name})`));
};
```

#### 4. 优化事件监听器注册顺序

```typescript
// 先注册所有事件监听器
video.onloadedmetadata = async () => { ... };
video.onerror = (e) => { ... };

// 最后设置src触发加载
video.src = videoUrl;  // ✅ 正确顺序
```

## 视频错误码参考

根据 HTML5 MediaError API，`video.error.code` 的可能值：

| 错误码 | 常量名 | 含义 |
|-------|--------|------|
| 1 | MEDIA_ERR_ABORTED | 用户中止了视频加载 |
| 2 | MEDIA_ERR_NETWORK | 网络错误导致视频下载失败 |
| 3 | MEDIA_ERR_DECODE | 视频解码失败（格式不支持或文件损坏） |
| 4 | MEDIA_ERR_SRC_NOT_SUPPORTED | 视频格式不被支持 |

## 最佳实践建议

### 1. 并发处理视频时
- ✅ 为每个任务创建独立的 DOM 元素
- ❌ 不要共享全局的 video/canvas 引用

### 2. 错误处理
- ✅ 添加超时保护（30秒）
- ✅ 记录详细的错误信息（文件名、错误码、错误消息）
- ✅ 清理资源（clearTimeout、URL.revokeObjectURL）

### 3. 视频格式兼容性
- 推荐使用 H.264 + MP4 容器（最广泛支持）
- 避免使用 H.265/HEVC（浏览器支持有限）
- 大文件建议先进行压缩

### 4. 性能优化
- 限制并发数量（2-3个视频同时处理）
- 降低视频分辨率（如 1024px 宽度上限）
- 使用较低的 JPEG 质量（0.6）减少 base64 大小

## 测试建议

1. **测试不同格式的视频**
   - H.264/MP4 ✅
   - H.265/MP4 ⚠️
   - WebM ✅
   - AVI ❌（通常不支持）

2. **测试并发场景**
   - 同时上传 2-5 个视频
   - 验证每个视频都能正确处理
   - 检查是否有竞争条件

3. **测试边界情况**
   - 非常小的视频（<1秒）
   - 非常大的视频（>100MB）
   - 损坏的视频文件
   - 不支持的格式

## 监控和调试

### 在控制台查看详细日志

```javascript
// 启用详细的视频处理日志
console.log('[Video Loading] Error loading video:', fileName, event);
console.log('[Video Processing] Starting analysis with provider:', provider);
console.log('[Video Processing] Keyframes count:', count);
```

### Chrome DevTools 检查

1. **Network 标签**：查看 Blob URL 是否正确加载
2. **Console 标签**：查看错误码和详细信息
3. **Memory 标签**：检查是否有内存泄漏
4. **Performance 标签**：分析视频处理性能

## 相关文件

- `App.tsx` - 主要的视频处理逻辑
- `services/apiService.ts` - API 调用服务
- `services/openAIService.ts` - OpenAI 视频分析
- `services/geminiService.ts` - Gemini 视频分析

## 版本历史

- **v1.0** (2025-01-23): 修复并发竞争条件，添加超时保护和详细错误信息
- **v0.9** (之前): 原始实现，存在并发冲突问题
