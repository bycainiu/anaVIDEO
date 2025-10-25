import React, { useState } from 'react';
import { BiliLogin } from './BiliLogin';
import { ClipboardMonitor } from './ClipboardMonitor';
import { DownloadProgress } from './DownloadProgress';
import { BiliBrowser } from './BiliBrowser';
import { useBiliDownload } from './hooks/useBiliDownload';
import './BiliDownload.css';

export const BiliDownload: React.FC = () => {
  const [viewMode, setViewMode] = useState<'browser' | 'classic'>('browser');
  const [parseResult, setParseResult] = useState<any>(null);
  const [showParseModal, setShowParseModal] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<number>(80);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string>('');
  
  const {
    isLoggedIn,
    isConnected,
    currentTask,
    allTasks,
    login,
    logout,
    parseVideo,
    startDownload,
    startBatchDownload,
    cancelTask,
    clearCompletedTasks
  } = useBiliDownload();

  // 处理URL检测：先解析，再显示确认框
  const handleUrlDetected = async (url: string) => {
    try {
      setIsParsing(true);
      setParseError('');
      console.log('开始解析视频:', url);

      const data = await parseVideo(url);
      console.log('解析结果:', data);

      // 绑定原始URL，避免后续下载时丢失
      const enriched = { ...data, original_url: url };
      setParseResult(enriched);
      setShowParseModal(true);

      // 设置默认画质
      if (data.quality_options && data.quality_options.length > 0) {
        setSelectedQuality(data.quality_options[0].quality);
      }
    } catch (error) {
      console.error('解析视频失败:', error);
      setParseError(error instanceof Error ? error.message : '未知错误');
    } finally {
      setIsParsing(false);
    }
  };

  // 处理解析结果：先显示信息，再确认下载
  const handleParseResult = (data: any) => {
    console.log('解析结果:', data);
    setParseResult(data);
    setShowParseModal(true);
    // 设置默认画质
    if (data.quality_options && data.quality_options.length > 0) {
      setSelectedQuality(data.quality_options[0].quality);
    }
  };

  const confirmDownload = () => {
    if (parseResult && parseResult.bvid) {
      // 判断是否为B站
      const isBili = parseResult.site_info?.name === 'bilibili' || !parseResult.site_info;

      if (isBili) {
        // B站：使用 BVID 构造 URL
        const url = `https://www.bilibili.com/video/${parseResult.bvid}`;
        console.log('开始下载:', parseResult.bvid, '画质:', selectedQuality);
        startDownload(url, { quality: selectedQuality });
      } else {
        // 其他站点：必须使用原始URL
        const urlToDownload = parseResult.original_url || parseResult.url;
        if (!urlToDownload) {
          setParseError('未获取到原始链接，无法下载。请重新复制原链接后再试。');
          return;
        }
        console.log('开始下载:', parseResult.bvid, '画质:', selectedQuality);
        console.log('使用URL:', urlToDownload);
        startDownload(urlToDownload, { quality: selectedQuality });
      }

      setShowParseModal(false);
      setParseResult(null);
    }
  };

  const cancelDownload = () => {
    setShowParseModal(false);
    setParseResult(null);
  };

  // 获取站点徽章样式
  const getSiteBadge = () => {
    if (!parseResult?.site_info) {
      return { icon: '📺', name: 'B站', color: '#00a1d6' };
    }
    return {
      icon: parseResult.site_info.icon,
      name: parseResult.site_info.display_name,
      color: parseResult.site_info.color,
    };
  };

  return (
    <div className="bili-download-container">
      <div className="bili-download-header">
        <div className="header-left">
          <h2>🎬 B站视频下载</h2>
          <div className="connection-status">
            {isConnected ? (
              <span className="status-connected">🟢 已连接</span>
            ) : (
              <span className="status-disconnected">🔴 连接中...</span>
            )}
          </div>
        </div>
        <div className="header-right">
          {isLoggedIn && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginRight: '16px' }}>
              <button
                onClick={() => setViewMode('browser')}
                style={{
                  padding: '6px 14px',
                  background: viewMode === 'browser' ? '#00a1d6' : 'transparent',
                  border: `1px solid ${viewMode === 'browser' ? '#00a1d6' : '#e1e8ed'}`,
                  borderRadius: '6px',
                  color: viewMode === 'browser' ? 'white' : '#64748b',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                🌐 浏览器模式
              </button>
              <button
                onClick={() => setViewMode('classic')}
                style={{
                  padding: '6px 14px',
                  background: viewMode === 'classic' ? '#00a1d6' : 'transparent',
                  border: `1px solid ${viewMode === 'classic' ? '#00a1d6' : '#e1e8ed'}`,
                  borderRadius: '6px',
                  color: viewMode === 'classic' ? 'white' : '#64748b',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                📋 经典模式
              </button>
            </div>
          )}
          {isLoggedIn ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="status-logged-in">✓ 已登录</span>
              <button
                onClick={logout}
                style={{
                  padding: '6px 14px',
                  background: 'transparent',
                  border: '1px solid #e1e8ed',
                  borderRadius: '6px',
                  color: '#64748b',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#ef4444';
                  e.currentTarget.style.color = '#ef4444';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e1e8ed';
                  e.currentTarget.style.color = '#64748b';
                }}
              >
                🚪 退出登录
              </button>
            </div>
          ) : (
            <span className="status-not-logged-in">● 未登录</span>
          )}
        </div>
      </div>

      {!isLoggedIn ? (
        <BiliLogin onLogin={login} />
      ) : viewMode === 'browser' ? (
        <>
          <BiliBrowser
            onUrlDetected={handleUrlDetected}
            onBatchDownload={startBatchDownload}
            onParseResult={handleParseResult}
            isLoggedIn={isLoggedIn}
            allTasks={allTasks}
            onCancel={cancelTask}
            onClearCompleted={clearCompletedTasks}
          />
          
          {/* 解析错误提示 */}
          {parseError && (
            <div 
              style={{
                position: 'fixed',
                top: '20px',
                right: '20px',
                background: '#fee2e2',
                border: '2px solid #ef4444',
                borderRadius: '8px',
                padding: '16px 20px',
                maxWidth: '400px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 10001,
                animation: 'slideIn 0.3s ease-out'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ fontSize: '20px' }}>❌</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', color: '#dc2626', marginBottom: '4px' }}>解析失败</div>
                  <div style={{ fontSize: '14px', color: '#7f1d1d', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{parseError}</div>
                </div>
                <button
                  onClick={() => setParseError('')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#dc2626',
                    cursor: 'pointer',
                    fontSize: '18px',
                    padding: '0',
                    lineHeight: '1'
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          )}
          
          {/* 解析结果确认框 */}
          {showParseModal && parseResult && (
            <div 
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000
              }}
              onClick={cancelDownload}
            >
              <div 
                style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '24px',
                  maxWidth: '550px',
                  width: '90%',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* 标题栏：显示站点徽章 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', color: '#1a1a1a', fontWeight: '600', flex: 1 }}>
                    📹 检测到视频
                  </h3>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    background: getSiteBadge().color + '15',
                    border: `1px solid ${getSiteBadge().color}40`,
                    fontSize: '13px',
                    fontWeight: '600',
                    color: getSiteBadge().color,
                  }}>
                    <span>{getSiteBadge().icon}</span>
                    <span>{getSiteBadge().name}</span>
                  </div>
                </div>
                
                {/* 封面图 */}
                {parseResult.pic && (
                  <div style={{ marginBottom: '16px', borderRadius: '8px', overflow: 'hidden', background: '#f5f7fa' }}>
                    <img 
                      src={`http://localhost:3004/api/bili/image-proxy?url=${encodeURIComponent(parseResult.pic)}`}
                      alt={parseResult.title}
                      style={{ width: '100%', height: 'auto', display: 'block' }}
                      onError={(e) => {
                        // 图片加载失败时隐藏
                        console.error('封面图加载失败:', parseResult.pic);
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
                
                {/* 标题 */}
                {parseResult.title && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: '500' }}>标题</div>
                    <div style={{ fontSize: '15px', color: '#1a1a1a', fontWeight: '600', lineHeight: '1.5' }}>
                      {parseResult.title}
                    </div>
                  </div>
                )}
                
                {/* 作者 */}
                {parseResult.owner && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: '500' }}>作者</div>
                    <div style={{ fontSize: '14px', color: '#334155' }}>
                      {parseResult.owner.name || parseResult.owner}
                    </div>
                  </div>
                )}
                
                {/* 时长 */}
                {parseResult.duration && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: '500' }}>时长</div>
                    <div style={{ fontSize: '14px', color: '#334155' }}>
                      {Math.floor(parseResult.duration / 60)}:{String(parseResult.duration % 60).padStart(2, '0')}
                    </div>
                  </div>
                )}
                
                {/* BVID */}
                {parseResult.bvid && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: '500' }}>BVID</div>
                    <div style={{ fontSize: '13px', color: '#334155', fontFamily: 'monospace', background: '#f5f7fa', padding: '8px 10px', borderRadius: '6px' }}>
                      {parseResult.bvid}
                    </div>
                  </div>
                )}
                
                {/* 画质选择 */}
                {parseResult.quality_options && parseResult.quality_options.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px', fontWeight: '500' }}>选择画质</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {parseResult.quality_options.map((option: any) => (
                        <button
                          key={option.quality}
                          onClick={() => setSelectedQuality(option.quality)}
                          style={{
                            padding: '8px 16px',
                            border: `2px solid ${selectedQuality === option.quality ? '#00a1d6' : '#e1e8ed'}`,
                            borderRadius: '8px',
                            background: selectedQuality === option.quality ? '#e6f7ff' : 'white',
                            color: selectedQuality === option.quality ? '#00a1d6' : '#334155',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '600',
                            transition: 'all 0.2s'
                          }}
                        >
                          {option.description}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* 按钮 */}
                <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                  <button
                    onClick={cancelDownload}
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: '1px solid #e1e8ed',
                      borderRadius: '8px',
                      background: 'white',
                      color: '#64748b',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f5f7fa';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'white';
                    }}
                  >
                    取消
                  </button>
                  <button
                    onClick={confirmDownload}
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: 'none',
                      borderRadius: '8px',
                      background: '#00a1d6',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '600',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#0090c0';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#00a1d6';
                    }}
                  >
                    开始下载
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bili-download-content">
          <ClipboardMonitor
            onUrlDetected={startDownload}
            onBatchDownload={startBatchDownload}
            isLoggedIn={isLoggedIn}
          />
          
          <div className="download-tasks">
            <div className="tasks-header">
              <div className="tasks-title">
                <h3>📋 下载任务</h3>
                <span className="tasks-count">
                  {allTasks.length > 0 && `(${allTasks.length})`}
                </span>
              </div>
              {allTasks.some(task => ['completed', 'failed', 'cancelled'].includes(task.status)) && (
                <button 
                  className="clear-completed-btn"
                  onClick={clearCompletedTasks}
                  title="清除已完成的任务"
                >
                  🗑️ 清理
                </button>
              )}
            </div>
            
            <div className="tasks-list">
              {allTasks.length === 0 ? (
                <div className="no-tasks">
                  <div className="no-tasks-icon">📱</div>
                  <p className="no-tasks-title">暂无下载任务</p>
                  <p className="no-tasks-hint">
                    复制视频链接到剪切板，或使用上方手动输入功能开始下载
                    <br />
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                      支持58个站点：B站、YouTube、Twitter、TikTok等
                    </span>
                  </p>
                </div>
              ) : (
                <div className="tasks-grid">
                  {allTasks.map(task => (
                    <DownloadProgress
                      key={task.task_id}
                      task={task}
                      onCancel={() => cancelTask(task.task_id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* 统计信息 */}
          {allTasks.length > 0 && (
            <div className="download-stats">
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-value">
                    {allTasks.filter(task => task.status === 'completed').length}
                  </span>
                  <span className="stat-label">已完成</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">
                    {allTasks.filter(task => ['queued', 'parsing', 'downloading', 'merging'].includes(task.status)).length}
                  </span>
                  <span className="stat-label">进行中</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">
                    {allTasks.filter(task => task.status === 'failed').length}
                  </span>
                  <span className="stat-label">失败</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};