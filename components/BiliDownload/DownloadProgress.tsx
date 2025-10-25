import React from 'react';

interface DownloadTask {
  task_id: string;
  status: 'queued' | 'parsing' | 'downloading' | 'merging' | 'completed' | 'failed' | 'cancelled';
  url: string;
  progress?: {
    file_type?: string;
    progress?: number;
    downloaded?: number;
    total?: number;
    speed?: string;
  };
  result?: {
    from_cache?: boolean;
    message?: string;
    bvid?: string;
    video_id?: string;
  };
  created_at: string;
  error?: string;
}

interface DownloadProgressProps {
  task: DownloadTask;
  onCancel: () => void;
}

export const DownloadProgress: React.FC<DownloadProgressProps> = ({ task, onCancel }) => {
  const getStatusDisplay = () => {
    switch (task.status) {
      case 'queued':
        return { text: '队列中', color: '#6c757d', icon: '⏳' };
      case 'parsing':
        return { text: '解析中', color: '#17a2b8', icon: '🔍' };
      case 'downloading':
        return { text: '下载中', color: '#007bff', icon: '⬇️' };
      case 'merging':
        return { text: '合并中', color: '#fd7e14', icon: '🔧' };
      case 'completed':
        return { text: '已完成', color: '#28a745', icon: '✅' };
      case 'failed':
        return { text: '失败', color: '#dc3545', icon: '❌' };
      case 'cancelled':
        return { text: '已取消', color: '#6c757d', icon: '🚫' };
      default:
        return { text: '未知', color: '#6c757d', icon: '❓' };
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getSiteInfo = (url: string) => {
    // 站点检测（按优先级匹配）
    const urlLower = url.toLowerCase();

    // 中文平台
    if (/bilibili\.com|b23\.tv/i.test(urlLower)) return { icon: '📺', name: 'B站', color: '#00a1d6' };
    if (/douyin\.com/i.test(urlLower)) return { icon: '🎵', name: '抖音', color: '#000000' };
    if (/weibo\.com/i.test(urlLower)) return { icon: '🔴', name: '微博', color: '#e6162d' };
    if (/xiaohongshu\.com|xhslink\.com/i.test(urlLower)) return { icon: '📕', name: '小红书', color: '#ff2442' };
    if (/huya\.com/i.test(urlLower)) return { icon: '🐯', name: '虎牙', color: '#ff7f00' };
    if (/douyu\.com/i.test(urlLower)) return { icon: '🐟', name: '斗鱼', color: '#ff6600' };

    // 国际主流
    if (/youtube\.com|youtu\.be/i.test(urlLower)) return { icon: '▶️', name: 'YouTube', color: '#ff0000' };
    if (/twitter\.com|x\.com/i.test(urlLower)) return { icon: '🐦', name: 'Twitter', color: '#1da1f2' };
    if (/tiktok\.com/i.test(urlLower)) return { icon: '🎵', name: 'TikTok', color: '#000000' };
    if (/instagram\.com/i.test(urlLower)) return { icon: '📷', name: 'Instagram', color: '#e4405f' };
    if (/facebook\.com|fb\.watch/i.test(urlLower)) return { icon: '👥', name: 'Facebook', color: '#1877f2' };
    if (/vimeo\.com/i.test(urlLower)) return { icon: '🎬', name: 'Vimeo', color: '#1ab7ea' };
    if (/twitch\.tv/i.test(urlLower)) return { icon: '🎮', name: 'Twitch', color: '#9146ff' };
    if (/reddit\.com|redd\.it/i.test(urlLower)) return { icon: '🤖', name: 'Reddit', color: '#ff4500' };
    if (/dailymotion\.com|dai\.ly/i.test(urlLower)) return { icon: '🎥', name: 'Dailymotion', color: '#0066dc' };

    // 成人平台
    if (/pornhub\.com/i.test(urlLower)) return { icon: '🔞', name: 'Pornhub', color: '#ff9000' };
    if (/xvideos\.com/i.test(urlLower)) return { icon: '🔞', name: 'XVideos', color: '#d32f2f' };
    if (/xnxx\.com/i.test(urlLower)) return { icon: '🔞', name: 'XNXX', color: '#000000' };
    if (/spankbang\.com/i.test(urlLower)) return { icon: '🔞', name: 'SpankBang', color: '#ff6b6b' };
    if (/eporner\.com/i.test(urlLower)) return { icon: '🔞', name: 'EPorner', color: '#e74c3c' };
    if (/xhamster\.com/i.test(urlLower)) return { icon: '🔞', name: 'xHamster', color: '#ff6600' };

    // 学习平台
    if (/coursera\.org/i.test(urlLower)) return { icon: '🎓', name: 'Coursera', color: '#0056d2' };
    if (/udemy\.com/i.test(urlLower)) return { icon: '🎓', name: 'Udemy', color: '#a435f0' };
    if (/ted\.com/i.test(urlLower)) return { icon: '💡', name: 'TED', color: '#e62b1e' };

    // 新闻媒体
    if (/cnn\.com/i.test(urlLower)) return { icon: '📰', name: 'CNN', color: '#cc0000' };
    if (/bbc\.co\.uk|bbc\.com/i.test(urlLower)) return { icon: '📰', name: 'BBC', color: '#000000' };
    if (/espn\.com/i.test(urlLower)) return { icon: '⚽', name: 'ESPN', color: '#d50a0a' };

    // 音频平台
    if (/soundcloud\.com/i.test(urlLower)) return { icon: '🎧', name: 'SoundCloud', color: '#ff5500' };
    if (/bandcamp\.com/i.test(urlLower)) return { icon: '🎵', name: 'Bandcamp', color: '#629aa9' };
    if (/mixcloud\.com/i.test(urlLower)) return { icon: '🎵', name: 'Mixcloud', color: '#314359' };
    if (/spotify\.com/i.test(urlLower)) return { icon: '🎵', name: 'Spotify', color: '#1db954' };

    // 其他平台
    if (/vk\.com/i.test(urlLower)) return { icon: '🔵', name: 'VK', color: '#4680c2' };
    if (/ok\.ru/i.test(urlLower)) return { icon: '🟠', name: 'OK.ru', color: '#ee8208' };
    if (/rutube\.ru/i.test(urlLower)) return { icon: '🎬', name: 'RuTube', color: '#00a8e8' };
    if (/streamable\.com/i.test(urlLower)) return { icon: '📹', name: 'Streamable', color: '#0e7ac4' };
    if (/nicovideo\.jp|nico\.ms/i.test(urlLower)) return { icon: '📹', name: 'niconico', color: '#231815' };
    if (/afreecatv\.com/i.test(urlLower)) return { icon: '🎥', name: 'AfreecaTV', color: '#0064ff' };
    if (/crunchyroll\.com/i.test(urlLower)) return { icon: '🍥', name: 'Crunchyroll', color: '#f47521' };
    if (/linkedin\.com/i.test(urlLower)) return { icon: '💼', name: 'LinkedIn', color: '#0077b5' };
    if (/pinterest\.com/i.test(urlLower)) return { icon: '📌', name: 'Pinterest', color: '#e60023' };
    if (/tumblr\.com/i.test(urlLower)) return { icon: '📝', name: 'Tumblr', color: '#35465c' };

    return { icon: '🌐', name: '未知', color: '#6c757d' };
  };

  const formatUrl = (url: string): string => {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      if (path.includes('video/')) {
        const bvMatch = path.match(/video\/(BV[\w]+)/);
        return bvMatch ? bvMatch[1] : url.substring(0, 50) + '...';
      }
      return url.substring(0, 50) + '...';
    } catch {
      return url.substring(0, 50) + '...';
    }
  };

  const getProgressPercentage = (): number => {
    return task.progress?.progress || 0;
  };

  const statusDisplay = getStatusDisplay();
  const progressPercentage = getProgressPercentage();
  const canCancel = ['queued', 'parsing', 'downloading', 'merging'].includes(task.status);
  const siteInfo = getSiteInfo(task.url);

  return (
    <div className="download-progress">
      <div className="task-header">
        <div className="task-info">
          <div className="task-url" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 8px',
              borderRadius: '12px',
              background: siteInfo.color + '15',
              border: `1px solid ${siteInfo.color}40`,
              fontSize: '11px',
              fontWeight: '600',
              color: siteInfo.color,
            }}>
              {siteInfo.icon} {siteInfo.name}
            </span>
            <span className="url-text">{formatUrl(task.url)}</span>
          </div>
          <div className="task-meta">
            <span className="task-status" style={{ color: statusDisplay.color }}>
              {statusDisplay.icon} {statusDisplay.text}
            </span>
            <span className="task-time">
              {new Date(task.created_at).toLocaleTimeString()}
            </span>
          </div>
        </div>
        
        {canCancel && (
          <button className="cancel-task-btn" onClick={onCancel} title="取消任务">
            ✕
          </button>
        )}
      </div>

      {task.status === 'downloading' && task.progress && (
        <div className="progress-details">
          <div className="progress-bar-container">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ 
                  width: `${progressPercentage}%`,
                  background: 'linear-gradient(90deg, #00a1d6, #00b5e5)'
                }}
              />
            </div>
            <span className="progress-text">
              {progressPercentage.toFixed(1)}%
            </span>
          </div>
          
          <div className="progress-info">
            <div className="info-row">
              <span className="info-label">类型:</span>
              <span className="info-value">{task.progress.file_type || '未知'}</span>
            </div>
            {task.progress.downloaded && task.progress.total && (
              <div className="info-row">
                <span className="info-label">大小:</span>
                <span className="info-value">
                  {formatBytes(task.progress.downloaded)} / {formatBytes(task.progress.total)}
                </span>
              </div>
            )}
            {task.progress.speed && (
              <div className="info-row">
                <span className="info-label">速度:</span>
                <span className="info-value">{task.progress.speed}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {task.status === 'failed' && task.error && (
        <div className="error-details">
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            <span className="error-text">{task.error}</span>
          </div>
        </div>
      )}

      {task.status === 'completed' && (
        <div className={task.result?.from_cache ? "instant-completion-details" : "completion-details"}>
          <div className="completion-message">
            <span className="completion-icon">{task.result?.from_cache ? '⚡' : '🎉'}</span>
            <span className="completion-text">
              {task.result?.from_cache 
                ? '秒传完成！视频已存在于数据库中' 
                : '下载完成！视频已保存并将进行后续处理'}
            </span>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .download-progress {
          background: white;
          border: 1px solid #e1e8ed;
          border-radius: 10px;
          padding: 16px;
          margin-bottom: 12px;
          transition: all 0.2s ease;
        }

        .download-progress:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }

        .task-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
        }

        .task-info {
          flex: 1;
          min-width: 0;
        }

        .task-url {
          margin-bottom: 6px;
        }

        .url-text {
          font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace;
          font-size: 13px;
          color: #2d3748;
          background: #f7fafc;
          padding: 4px 8px;
          border-radius: 4px;
          border: 1px solid #e2e8f0;
        }

        .task-meta {
          display: flex;
          align-items: center;
          gap: 16px;
          font-size: 13px;
        }

        .task-status {
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .task-time {
          color: #64748b;
          font-size: 12px;
        }

        .cancel-task-btn {
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          color: #6c757d;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          transition: all 0.2s;
        }

        .cancel-task-btn:hover {
          background: #e9ecef;
          border-color: #adb5bd;
          color: #495057;
        }

        .progress-details {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 14px;
          margin-top: 12px;
        }

        .progress-bar-container {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .progress-bar {
          flex: 1;
          height: 8px;
          background: #e2e8f0;
          border-radius: 4px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          transition: width 0.3s ease;
          border-radius: 4px;
        }

        .progress-text {
          font-size: 12px;
          font-weight: 600;
          color: #4a5568;
          min-width: 45px;
        }

        .progress-info {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 8px;
        }

        .info-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
        }

        .info-label {
          font-weight: 500;
          color: #64748b;
          min-width: 40px;
        }

        .info-value {
          color: #2d3748;
          font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace;
        }

        .error-details {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 12px;
          margin-top: 12px;
        }

        .error-message {
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .error-icon {
          color: #dc2626;
          flex-shrink: 0;
        }

        .error-text {
          color: #991b1b;
          font-size: 13px;
          line-height: 1.4;
        }

        .completion-details {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 8px;
          padding: 12px;
          margin-top: 12px;
        }

        .instant-completion-details {
          background: #fef3c7;
          border: 1px solid #fde68a;
          border-radius: 8px;
          padding: 12px;
          margin-top: 12px;
        }

        .completion-message {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .completion-icon {
          color: #16a34a;
        }

        .completion-text {
          color: #15803d;
          font-size: 13px;
          font-weight: 500;
        }

        /* 状态特定样式 */
        .download-progress[data-status="completed"] {
          border-color: #bbf7d0;
          background: linear-gradient(to right, #f0fdf4, #ffffff);
        }

        .download-progress[data-status="failed"] {
          border-color: #fecaca;
          background: linear-gradient(to right, #fef2f2, #ffffff);
        }

        .download-progress[data-status="downloading"] {
          border-color: #bee3f8;
          background: linear-gradient(to right, #ebf8ff, #ffffff);
        }
      ` }} />
    </div>
  );
};
