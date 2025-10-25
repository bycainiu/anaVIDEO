import React, { useState, useEffect, useRef } from 'react';
import { VideoListSelector } from './VideoListSelector';

interface ClipboardMonitorProps {
  onUrlDetected: (url: string, options?: { quality?: number }) => void;
  onBatchDownload: (bvids: string[], options?: { quality?: number }) => void;
  isLoggedIn: boolean;
}

interface VideoPreview {
  title: string;
  duration: number;
  owner: { name: string };
  quality_options: Array<{ id: number; description: string }>;
}

export const ClipboardMonitor: React.FC<ClipboardMonitorProps> = ({ onUrlDetected, onBatchDownload, isLoggedIn }) => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [lastClipboard, setLastClipboard] = useState('');
  const [detectedUrl, setDetectedUrl] = useState('');
  const [videoPreview, setVideoPreview] = useState<VideoPreview | null>(null);
  const [selectedQuality, setSelectedQuality] = useState(80);
  const [isLoading, setIsLoading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [videoList, setVideoList] = useState<any>(null);
  const intervalRef = useRef<NodeJS.Timeout>();
  const lastClipboardRef = useRef('');
  const isLoadingRef = useRef(false);

  useEffect(() => {
    lastClipboardRef.current = lastClipboard;
  }, [lastClipboard]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    if (isMonitoring && isLoggedIn) {
      startMonitoring();
    } else {
      stopMonitoring();
    }

    return () => stopMonitoring();
  }, [isMonitoring, isLoggedIn]);

  const startMonitoring = () => {
    intervalRef.current = setInterval(async () => {
      try {
        const text = await navigator.clipboard.readText();
        // 使用ref获取最新值，避免闭包问题
        if (text && text !== lastClipboardRef.current && isVideoUrl(text) && !isLoadingRef.current) {
          console.log('检测到新的视频链接:', text.substring(0, 50));
          lastClipboardRef.current = text; // 立即更新ref
          handleUrlDetected(text);
        }
      } catch (error) {
        // 剪切板访问失败，可能是权限问题
        if (error instanceof Error && !error.message.includes('not focused')) {
          console.warn('无法访问剪切板:', error);
        }
      }
    }, 1500); // 增加到1.5秒，减少检查频率
  };

  const stopMonitoring = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
  };

  const isVideoUrl = (text: string): boolean => {
    // 支持多个视频网站
    const videoPatterns = [
      // 中文平台
      /bilibili\.com/,
      /b23\.tv/,
      /douyin\.com/,
      /weibo\.com/,
      /xiaohongshu\.com/,
      /xhslink\.com/,
      /huya\.com/,
      /douyu\.com/,
      // 国际主流
      /youtube\.com/,
      /youtu\.be/,
      /twitter\.com\/.*\/status/,
      /x\.com\/.*\/status/,
      /tiktok\.com/,
      /instagram\.com\/p\//,
      /instagram\.com\/reel/,
      /facebook\.com\/.*\/videos/,
      /fb\.watch/,
      /vimeo\.com/,
      /twitch\.tv/,
      /reddit\.com\/r\/.*\/comments/,
      /redd\.it/,
      /dailymotion\.com/,
      /dai\.ly/,
      // 学习平台
      /coursera\.org/,
      /udemy\.com/,
      /ted\.com/,
      // 其他
      /soundcloud\.com/,
      /vk\.com/,
      /rutube\.ru/,
      /streamable\.com/,
      /nicovideo\.jp/,
      /nico\.ms/,
      /afreecatv\.com/,
      /crunchyroll\.com/,
    ];

    return videoPatterns.some(pattern => pattern.test(text));
  };

  const handleUrlDetected = async (url: string) => {
    // 防止正在解析时重复触发
    if (isLoadingRef.current) {
      console.log('正在解析中，跳过...');
      return;
    }

    setDetectedUrl(url);
    setIsLoading(true);
    isLoadingRef.current = true; // 同步更新ref
    setVideoPreview(null);
    setError(null);
    
    // 立即更新lastClipboard，防止重复触发
    setLastClipboard(url);
    lastClipboardRef.current = url; // 同步更新ref

    try {
      // 判断是否为B站链接
      const isBili = /bilibili\.com|b23\.tv/i.test(url);
      const apiEndpoint = isBili
        ? 'http://localhost:8888/api/bili/parse'
        : 'http://localhost:8888/api/universal/parse';

      console.log(`使用${isBili ? 'B站' : '通用'}解析接口:`, apiEndpoint);

      // 调用后端API解析视频信息(添加60秒超时)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时
      
      try {
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const preview = await response.json();

          // 保存原始URL到解析结果中（用于非B站视频下载）
          preview.original_url = url;

          // 检查是否是列表类型（用户空间或番剧）
          if (preview.type === 'space' || preview.type === 'bangumi') {
            setVideoList(preview);
          } else {
            setVideoPreview(preview);
            // 自动选择最高可用画质
            if (preview.quality_options && preview.quality_options.length > 0) {
              setSelectedQuality(preview.quality_options[0].id || preview.quality_options[0].quality);
            }
          }
        } else {
          const errorData = await response.json().catch(() => ({ detail: '解析失败' }));
          const errorMsg = errorData.detail || '解析视频失败';
          
          if (response.status === 401) {
            setError('⚠️ 请先登录B站账号！点击上方“登录”按钮进行登录。');
          } else {
            setError(`❌ ${errorMsg}`);
          }
          setDetectedUrl('');
          console.error('解析视频失败:', errorMsg);
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        // 区分超时错误和其他网络错误
        if (fetchError.name === 'AbortError') {
          setError('❌ 解析超时（60秒），请稍后再试或检查链接是否正确');
          console.error('解析超时:', url);
        } else {
          setError('❌ 网络连接失败，请确保后端服务已启动');
          console.error('解析视频失败:', fetchError);
        }
        setDetectedUrl('');
      }
    } catch (error) {
      // 外层catch处理其他错误
      setError('❌ 网络连接失败，请确保后端服务已启动');
      setDetectedUrl('');
      console.error('解析视频失败:', error);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false; // 同步更新ref
    }
  };

  const handleDownload = () => {
    if (detectedUrl && videoPreview) {
      // 使用保存的原始URL（对于非B站视频很重要）
      const urlToDownload = videoPreview.original_url || detectedUrl;
      onUrlDetected(urlToDownload, { quality: selectedQuality });
      setDetectedUrl('');
      setVideoPreview(null);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualUrl && isVideoUrl(manualUrl)) {
      const trimmedUrl = manualUrl.trim();
      handleUrlDetected(trimmedUrl);
      setManualUrl('');
      setShowUrlInput(false);
    } else if (manualUrl) {
      setError('❌ 无效的视频链接，请检查后重试');
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleBatchDownloadSelected = (selectedBvids: string[]) => {
    onBatchDownload(selectedBvids, { quality: selectedQuality });
    setVideoList(null);
    setDetectedUrl('');
  };

  return (
    <>
      {videoList && (
        <VideoListSelector
          videos={videoList.type === 'space' ? videoList.videos : videoList.episodes}
          listType={videoList.type}
          listTitle={videoList.type === 'space' ? `${videoList.user_name}的视频 (共${videoList.total}个)` : `${videoList.title} (共${videoList.total}集)`}
          onDownload={handleBatchDownloadSelected}
          onClose={() => {
            setVideoList(null);
            setDetectedUrl('');
          }}
        />
      )}
      
      <div className="clipboard-monitor">
      <div className="monitor-header">
        <h3>🔍 剪切板监听（支持58个站点）</h3>
        <div className="monitor-controls">
          <button
            className={`monitor-toggle ${isMonitoring ? 'active' : ''}`}
            onClick={() => setIsMonitoring(!isMonitoring)}
            disabled={!isLoggedIn}
          >
            {isMonitoring ? '🟢 监听中' : '⚪ 已停止'}
          </button>
          <button
            className="manual-input-btn"
            onClick={() => setShowUrlInput(!showUrlInput)}
          >
            ✏️ 手动输入
          </button>
        </div>
      </div>

      {showUrlInput && (
        <div className="manual-input">
          <form onSubmit={handleManualSubmit}>
            <input
              type="text"
              placeholder="请输入视频链接（支持B站、YouTube、Twitter等58个站点）..."
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              className="url-input"
            />
            <button type="submit" className="submit-btn">
              解析
            </button>
          </form>
        </div>
      )}

      <div className="monitor-status">
        {!isLoggedIn && (
          <div className="status-message warning">
            ⚠️ 请先登录B站账号（非B站视频无需登录）
          </div>
        )}

        {isLoggedIn && isMonitoring && (
          <div className="status-message info">
            📋 正在监听剪切板中的视频链接（B站、YouTube、Twitter等58个站点）...
          </div>
        )}

        {isLoggedIn && !isMonitoring && !detectedUrl && (
          <div className="status-message">
            💡 开启监听后，复制视频链接即可自动解析（支持58个站点）
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '15px', background: '#fee2e2', borderRadius: '8px', marginBottom: '15px', border: '1px solid #fecaca' }}>
          <div style={{ color: '#991b1b', fontSize: '14px', lineHeight: '1.6' }}>{error}</div>
          <button onClick={() => setError(null)} style={{ marginTop: '10px', padding: '6px 12px', background: 'transparent', border: '1px solid #991b1b', color: '#991b1b', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>关闭</button>
        </div>
      )}

      {isLoading && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <span>正在解析视频信息...</span>
        </div>
      )}

      {videoPreview && detectedUrl && (
        <div style={{ background: 'white', border: '1px solid #e1e8ed', borderRadius: '12px', padding: '20px', marginTop: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #e1e8ed' }}>
            <h4 style={{ margin: 0, color: '#1e293b', fontSize: '16px', lineHeight: '1.5', fontWeight: 600 }}>📺 {videoPreview.title}</h4>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontWeight: 500, color: '#64748b', minWidth: '60px', fontSize: '14px' }}>UP主:</span>
              <span style={{ color: '#1e293b', fontSize: '14px' }}>{videoPreview.owner.name}</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontWeight: 500, color: '#64748b', minWidth: '60px', fontSize: '14px' }}>时长:</span>
              <span style={{ color: '#1e293b', fontSize: '14px' }}>{formatDuration(videoPreview.duration)}</span>
            </div>
          </div>

          {videoPreview.quality_options.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, color: '#475569', fontSize: '14px' }}>画质选择:</label>
              <select
                value={selectedQuality}
                onChange={(e) => setSelectedQuality(Number(e.target.value))}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e0', borderRadius: '8px', background: 'white', fontSize: '14px', color: '#1e293b', cursor: 'pointer' }}
              >
                {videoPreview.quality_options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.description}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleDownload}
              style={{ flex: 1, padding: '12px 20px', background: 'linear-gradient(135deg, #00a1d6, #0091c2)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'transform 0.2s' }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              🚀 开始下载
            </button>
            <button
              onClick={() => {
                setDetectedUrl('');
                setVideoPreview(null);
                setLastClipboard(''); // 清空上次记录，允许重新解析
              }}
              style={{ padding: '12px 20px', background: 'transparent', border: '1px solid #cbd5e0', color: '#64748b', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 500 }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .clipboard-monitor {
          background: white;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
          border: 1px solid #e1e8ed;
        }

        .monitor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .monitor-header h3 {
          margin: 0;
          color: #333;
          font-size: 18px;
          font-weight: 600;
        }

        .monitor-controls {
          display: flex;
          gap: 10px;
        }

        .monitor-toggle {
          padding: 8px 16px;
          border: 2px solid #e1e8ed;
          background: white;
          border-radius: 20px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.3s ease;
        }

        .monitor-toggle:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .monitor-toggle.active {
          background: #e8f5e8;
          border-color: #28a745;
          color: #28a745;
        }

        .manual-input-btn {
          padding: 8px 16px;
          border: 2px solid #00a1d6;
          background: white;
          color: #00a1d6;
          border-radius: 20px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.3s ease;
        }

        .manual-input-btn:hover {
          background: #00a1d6;
          color: white;
        }

        .manual-input {
          margin-bottom: 20px;
          padding: 15px;
          background: #f8fafc;
          border-radius: 10px;
          border: 1px solid #e1e8ed;
        }

        .manual-input form {
          display: flex;
          gap: 10px;
        }

        .url-input {
          flex: 1;
          padding: 10px 15px;
          border: 1px solid #cbd5e0;
          border-radius: 8px;
          font-size: 14px;
        }

        .url-input:focus {
          outline: none;
          border-color: #00a1d6;
          box-shadow: 0 0 0 3px rgba(0, 161, 214, 0.1);
        }

        .submit-btn {
          padding: 10px 20px;
          background: #00a1d6;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
        }

        .submit-btn:hover {
          background: #0091c2;
        }

        .monitor-status {
          margin-bottom: 20px;
        }

        .status-message {
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
        }

        .status-message.info {
          background: #e3f2fd;
          color: #1976d2;
          border: 1px solid #bbdefb;
        }

        .status-message.warning {
          background: #fff3cd;
          color: #856404;
          border: 1px solid #ffeaa7;
        }

        .status-message:not(.info):not(.warning) {
          background: #f8fafc;
          color: #64748b;
          border: 1px solid #e1e8ed;
        }

        .loading-container {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 20px;
          text-align: center;
          color: #64748b;
        }

        .loading-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid #e1e8ed;
          border-top: 2px solid #00a1d6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .video-preview {
          background: #f8fafc;
          border: 1px solid #e1e8ed;
          border-radius: 10px;
          padding: 20px;
          margin-top: 20px;
        }

        .preview-header h4 {
          margin: 0 0 15px 0;
          color: #2d3748;
          font-size: 16px;
          line-height: 1.4;
        }

        .preview-info {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 20px;
        }

        .info-item {
          display: flex;
          gap: 8px;
        }

        .info-item .label {
          font-weight: 500;
          color: #4a5568;
          min-width: 50px;
        }

        .info-item .value {
          color: #2d3748;
        }

        .quality-selector {
          margin-bottom: 20px;
        }

        .quality-label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #4a5568;
        }

        .quality-select {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #cbd5e0;
          border-radius: 8px;
          background: white;
          font-size: 14px;
        }

        .preview-actions {
          display: flex;
          gap: 12px;
        }

        .download-btn {
          flex: 1;
          padding: 12px 20px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .download-btn.primary {
          background: linear-gradient(135deg, #00a1d6, #0091c2);
          color: white;
        }

        .download-btn.primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 161, 214, 0.3);
        }

        .cancel-btn {
          padding: 12px 20px;
          background: transparent;
          border: 1px solid #cbd5e0;
          color: #4a5568;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
        }

        .cancel-btn:hover {
          background: #94a3b8;
        }
      ` }} />
      </div>
    </>
  );
};
