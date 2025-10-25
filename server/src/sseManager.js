/**
 * SSE (Server-Sent Events) 管理器
 * 用于管理所有活跃的客户端连接，并支持向特定客户端推送事件
 */

class SSEManager {
  constructor() {
    // 存储所有活跃的连接: videoId -> Set<Response>
    this.connections = new Map();
  }

  /**
   * 添加新的 SSE 连接
   * @param {string} videoId - 视频 ID
   * @param {Response} res - Express Response 对象
   */
  addConnection(videoId, res) {
    if (!this.connections.has(videoId)) {
      this.connections.set(videoId, new Set());
    }
    
    this.connections.get(videoId).add(res);
    
    console.log(`[SSE] Client connected for video ${videoId}, total clients: ${this.connections.get(videoId).size}`);

    // 当连接关闭时清理
    res.on('close', () => {
      this.removeConnection(videoId, res);
    });
  }

  /**
   * 移除 SSE 连接
   * @param {string} videoId - 视频 ID
   * @param {Response} res - Express Response 对象
   */
  removeConnection(videoId, res) {
    const clients = this.connections.get(videoId);
    if (clients) {
      clients.delete(res);
      console.log(`[SSE] Client disconnected from video ${videoId}, remaining: ${clients.size}`);
      
      // 如果没有客户端了，清理 Map
      if (clients.size === 0) {
        this.connections.delete(videoId);
      }
    }
  }

  /**
   * 向特定视频的所有客户端发送事件
   * @param {string} videoId - 视频 ID
   * @param {string} event - 事件名称
   * @param {Object} data - 事件数据
   */
  sendEvent(videoId, event, data) {
    const clients = this.connections.get(videoId);
    
    if (!clients || clients.size === 0) {
      console.log(`[SSE] No clients connected for video ${videoId}, skipping event: ${event}`);
      return;
    }

    console.log(`[SSE] Sending ${event} event to ${clients.size} client(s) for video ${videoId}`);

    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    
    // 向所有客户端发送
    clients.forEach(client => {
      try {
        client.write(message);
      } catch (error) {
        console.error(`[SSE] Error sending to client:`, error);
        this.removeConnection(videoId, client);
      }
    });
  }

  /**
   * 通知字幕生成完成
   * @param {string} videoId - 视频 ID
   * @param {Object} result - 字幕生成结果
   */
  notifySubtitleComplete(videoId, result) {
    this.sendEvent(videoId, 'subtitle-complete', {
      videoId,
      success: true,
      language: result.language,
      duration: result.duration,
      segmentCount: result.segmentCount,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 通知字幕生成失败
   * @param {string} videoId - 视频 ID
   * @param {string} error - 错误信息
   */
  notifySubtitleError(videoId, error) {
    this.sendEvent(videoId, 'subtitle-error', {
      videoId,
      success: false,
      error: error,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 发送进度更新（可选）
   * @param {string} videoId - 视频 ID
   * @param {string} status - 状态信息
   * @param {number} progress - 进度百分比 (0-100)
   */
  notifyProgress(videoId, status, progress) {
    this.sendEvent(videoId, 'subtitle-progress', {
      videoId,
      status,
      progress,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 获取连接统计
   */
  getStats() {
    const stats = {
      totalVideos: this.connections.size,
      videos: []
    };

    this.connections.forEach((clients, videoId) => {
      stats.videos.push({
        videoId,
        clientCount: clients.size
      });
    });

    return stats;
  }
}

// 单例模式
const sseManager = new SSEManager();

export default sseManager;
