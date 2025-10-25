import React, { useState, useRef, useEffect } from 'react';

interface BiliBrowserProps {
  onUrlDetected: (url: string, options?: any) => void;
  onBatchDownload: (bvids: string[], options?: any) => void;
  onParseResult?: (data: any) => void;
  isLoggedIn: boolean;
  allTasks: any[];
  onCancel: (taskId: string) => void;
  onClearCompleted: () => void;
}

const API_BASE = 'http://localhost:8888/api/bili';

export const BiliBrowser: React.FC<BiliBrowserProps> = ({
  onUrlDetected,
  onBatchDownload,
  onParseResult,
  isLoggedIn,
  allTasks,
  onCancel,
  onClearCompleted
}) => {
  const [urlInput, setUrlInput] = useState('https://www.bilibili.com');
  const popupWindowRef = useRef<Window | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [monitoringEnabled, setMonitoringEnabled] = useState(true);
  const [lastUrl, setLastUrl] = useState('');
  const [processedUrls, setProcessedUrls] = useState<Set<string>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('https://www.bilibili.com');

  // 初始化webview事件监听
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    // 监听导航事件
    const handleNavigate = (e: any) => {
      console.log('[Webview] 导航到:', e.url);
      setUrlInput(e.url);
      updateNavigationButtons();
    };

    // 监听页面内导航（单页应用）
    const handleNavigateInPage = (e: any) => {
      console.log('[Webview] 页面内导航:', e.url);
      setUrlInput(e.url);
      updateNavigationButtons();
    };

    // 监听新窗口请求（拦截target="_blank"）
    const handleNewWindow = (e: any) => {
      console.log('[Webview] 拦截新窗口:', e.url);
      e.preventDefault();
      // 在当前webview中打开
      webview.src = e.url;
    };

    // 监听加载状态
    const handleStartLoading = () => {
      setIsLoading(true);
    };

    const handleStopLoading = () => {
      setIsLoading(false);
      updateNavigationButtons();
    };

    webview.addEventListener('did-navigate', handleNavigate);
    webview.addEventListener('did-navigate-in-page', handleNavigateInPage);
    webview.addEventListener('new-window', handleNewWindow);
    webview.addEventListener('did-start-loading', handleStartLoading);
    webview.addEventListener('did-stop-loading', handleStopLoading);

    return () => {
      // Electron的webview不需要手动移除监听器
    };
  }, []);

  // 更新导航按钮状态
  const updateNavigationButtons = () => {
    const webview = webviewRef.current;
    if (webview) {
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    }
  };

  // 导航函数
  const handleNavigate = () => {
    const webview = webviewRef.current;
    if (!webview) return;

    let targetUrl = urlInput;

    // 确保URL格式正确
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://www.bilibili.com/' + targetUrl.replace(/^\/+/, '');
    }

    console.log('[导航] 跳转到:', targetUrl);
    webview.src = targetUrl;
    setIsLoading(true);
  };

  const handleGoBack = () => {
    const webview = webviewRef.current;
    if (webview && webview.canGoBack()) {
      webview.goBack();
    }
  };

  const handleGoForward = () => {
    const webview = webviewRef.current;
    if (webview && webview.canGoForward()) {
      webview.goForward();
    }
  };

  const handleRefresh = () => {
    const webview = webviewRef.current;
    if (webview) {
      webview.reload();
    }
  };



  // 剪贴板监听
  useEffect(() => {
    if (!monitoringEnabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const checkClipboard = async () => {
      try {
        // 检查文档是否有焦点
        if (!document.hasFocus()) {
          return;
        }
        
        const text = await navigator.clipboard.readText();
        // 检查是否是B站链接且未处理过
        if (text && /bilibili\.com/.test(text) && !processedUrls.has(text)) {
          console.log('Detected B站 URL:', text);
          setLastUrl(text);
          
          // 标记为已处理，防止重复检测
          setProcessedUrls(prev => new Set(prev).add(text));
          
          // 解析URL
          const response = await fetch(`${API_BASE}/parse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: text })
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log('解析结果:', data);
            
            // 先调用回调显示解析信息，让父组件决定如何处理
            if (onParseResult) {
              onParseResult(data);
            } else {
              // 如果没有提供回调，保持原有逻辑（仅用于兼容）
              if (data.type === 'video') {
                onUrlDetected(text);
              }
            }
          }
        }
      } catch (err) {
        console.error('剪贴板检测错误:', err);
      }
    };

    intervalRef.current = setInterval(checkClipboard, 2000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [monitoringEnabled, processedUrls, onUrlDetected, onParseResult]);

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - 120px)',
      gap: '16px',
      padding: '16px',
      background: '#f5f7fa'
    }}>
      {/* B站浏览器主窗口 */}
      <div style={{
        flex: showSidebar ? '1' : '1',
        display: 'flex',
        flexDirection: 'column',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        {/* 浏览器工具栏 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          borderBottom: '1px solid #e1e8ed',
          background: '#fafbfc',
          position: 'relative',
          zIndex: 10
        }}>
          <button
            onClick={handleGoBack}
            disabled={!canGoBack}
            style={{
              padding: '6px 12px',
              border: '1px solid #94a3b8',
              borderRadius: '6px',
              background: canGoBack ? '#ffffff' : '#f1f5f9',
              color: canGoBack ? '#334155' : '#94a3b8',
              cursor: canGoBack ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              opacity: canGoBack ? 1 : 0.6
            }}
            title="后退"
          >
            ← 后退
          </button>
          <button
            onClick={handleGoForward}
            disabled={!canGoForward}
            style={{
              padding: '6px 12px',
              border: '1px solid #94a3b8',
              borderRadius: '6px',
              background: canGoForward ? '#ffffff' : '#f1f5f9',
              color: canGoForward ? '#334155' : '#94a3b8',
              cursor: canGoForward ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              opacity: canGoForward ? 1 : 0.6
            }}
            title="前进"
          >
            → 前进
          </button>
          <button
            onClick={handleRefresh}
            style={{
              padding: '6px 12px',
              border: '1px solid #94a3b8',
              borderRadius: '6px',
              background: '#ffffff',
              color: '#334155',
              cursor: 'pointer',
              fontSize: '14px'
            }}
            title="刷新"
          >
            ↻ 刷新
          </button>
          
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleNavigate()}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #94a3b8',
              borderRadius: '6px',
              fontSize: '14px',
              outline: 'none',
              color: '#111827'
            }}
            placeholder="输入B站链接..."
          />
          
          <button
            onClick={handleNavigate}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              background: '#00a1d6',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            访问
          </button>

          <button
            onClick={() => setMonitoringEnabled(!monitoringEnabled)}
            style={{
              padding: '8px 12px',
              border: `2px solid ${monitoringEnabled ? '#10b981' : '#94a3b8'}`,
              borderRadius: '6px',
              background: monitoringEnabled ? '#ecfdf5' : '#ffffff',
              color: monitoringEnabled ? '#065f46' : '#334155',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600'
            }}
            title={monitoringEnabled ? '关闭剪贴板监听' : '开启剪贴板监听'}
          >
            {monitoringEnabled ? '📋 监听 开' : '📋 监听 关'}
          </button>

          <button
            onClick={() => setShowSidebar(!showSidebar)}
            style={{
              padding: '8px 12px',
              border: '2px solid #fb7299',
              borderRadius: '6px',
              background: showSidebar ? '#fff1f5' : '#ffffff',
              color: '#fb7299',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '700',
              minWidth: '80px',
              transition: 'all 0.2s'
            }}
            title={showSidebar ? '收起下载任务栏' : '展开下载任务栏'}
          >
            {showSidebar ? '⮜ 收起' : '⮞ 展开'}
          </button>
        </div>

        {/* Webview浏览器容器 */}
        <div style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* 加载指示器 */}
          {isLoading && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(255, 255, 255, 0.9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
              backdropFilter: 'blur(2px)'
            }}>
              <div style={{
                textAlign: 'center'
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  border: '3px solid #e1e8ed',
                  borderTop: '3px solid #00a1d6',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 16px'
                }} />
                <div style={{
                  fontSize: '14px',
                  color: '#64748b',
                  fontWeight: '500'
                }}>
                  页面加载中...
                </div>
              </div>
              <style>{`
                @keyframes spin {
                  to { transform: rotate(360deg); }
                }
              `}</style>
            </div>
          )}

          {/* Webview浏览器 */}
          <webview
            ref={webviewRef as any}
            src="https://www.bilibili.com"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              position: 'relative',
              zIndex: 1
            }}
          />
        </div>

        {/* 提示信息 */}
        <div style={{
          padding: '12px 16px',
          background: '#dcfce7',
          borderTop: '1px solid #16a34a',
          fontSize: '13px',
          color: '#14532d',
          position: 'relative',
          zIndex: 10
        }}>
          💡 提示：在B站浏览器中找到视频后，复制视频链接到剪贴板即可自动解析下载<br/>
          <span style={{ fontSize: '12px', color: '#14532d', opacity: 0.8 }}>
            ✅ 使用Electron Webview，所有链接将在同一窗口内打开（无需代理服务器）
          </span>
        </div>
      </div>

      {/* 下载任务侧边栏 */}
      {showSidebar && (
        <div style={{
          width: '400px',
          display: 'flex',
          flexDirection: 'column',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '16px',
            borderBottom: '1px solid #e1e8ed',
            background: '#fafbfc'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '8px'
            }}>
              <h3 style={{ 
                margin: 0, 
                fontSize: '16px',
                fontWeight: '600',
                color: '#1a1a1a'
              }}>
                📋 下载任务 {allTasks.length > 0 && `(${allTasks.length})`}
              </h3>
              {allTasks.some(task => ['completed', 'failed', 'cancelled'].includes(task.status)) && (
                <button
                  onClick={onClearCompleted}
                  style={{
                    padding: '6px 12px',
                    border: 'none',
                    borderRadius: '6px',
                    background: '#f0f0f0',
                    color: '#666',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  🗑️ 清理
                </button>
              )}
            </div>
            <p style={{ 
              margin: 0, 
              fontSize: '13px', 
              color: '#64748b' 
            }}>
              复制视频链接自动检测下载
            </p>
          </div>

          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px'
          }}>
            {allTasks.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: '#94a3b8'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📥</div>
                <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '500' }}>
                  暂无下载任务
                </p>
                <p style={{ margin: 0, fontSize: '12px' }}>
                  在左侧浏览器中找到视频<br/>复制链接即可开始下载
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {allTasks.map(task => (
                  <TaskCard key={task.task_id} task={task} onCancel={onCancel} />
                ))}
              </div>
            )}
          </div>

          {/* 统计信息 */}
          {allTasks.length > 0 && (
            <div style={{
              padding: '16px',
              borderTop: '1px solid #e1e8ed',
              background: '#fafbfc'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                textAlign: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: '600', color: '#10b981' }}>
                    {allTasks.filter(t => t.status === 'completed').length}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>已完成</div>
                </div>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: '600', color: '#3b82f6' }}>
                    {allTasks.filter(t => ['queued', 'parsing', 'downloading', 'merging'].includes(t.status)).length}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>进行中</div>
                </div>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: '600', color: '#ef4444' }}>
                    {allTasks.filter(t => t.status === 'failed').length}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>失败</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// 任务卡片组件
const TaskCard: React.FC<{ task: any; onCancel: (id: string) => void }> = ({ task, onCancel }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#10b981';
      case 'failed': return '#ef4444';
      case 'downloading': return '#3b82f6';
      case 'parsing': return '#f59e0b';
      default: return '#64748b';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'queued': return '队列中';
      case 'parsing': return '解析中';
      case 'downloading': return '下载中';
      case 'merging': return '合并中';
      case 'completed': return '已完成';
      case 'failed': return '失败';
      case 'cancelled': return '已取消';
      default: return status;
    }
  };

  return (
    <div style={{
      padding: '12px',
      border: '1px solid #e1e8ed',
      borderRadius: '8px',
      background: 'white'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '8px'
      }}>
        <div style={{ flex: 1, marginRight: '8px' }}>
          <div style={{
            fontSize: '13px',
            fontWeight: '500',
            color: '#1a1a1a',
            marginBottom: '4px',
            wordBreak: 'break-word'
          }}>
            {task.title || task.url}
          </div>
          <div style={{
            fontSize: '12px',
            color: getStatusColor(task.status),
            fontWeight: '500'
          }}>
            {task.from_cache && '⚡ '}
            {getStatusText(task.status)}
          </div>
        </div>
        {!['completed', 'failed', 'cancelled'].includes(task.status) && (
          <button
            onClick={() => onCancel(task.task_id)}
            style={{
              padding: '4px 8px',
              border: '1px solid #ef4444',
              borderRadius: '4px',
              background: 'transparent',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            取消
          </button>
        )}
      </div>
      
      {task.progress && task.status === 'downloading' && (
        <div>
          <div style={{
            height: '4px',
            background: '#e1e8ed',
            borderRadius: '2px',
            overflow: 'hidden',
            marginBottom: '4px'
          }}>
            <div style={{
              height: '100%',
              background: '#3b82f6',
              width: `${task.progress.video?.progress || 0}%`,
              transition: 'width 0.3s'
            }} />
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            {Math.round(task.progress.video?.progress || 0)}% - {task.progress.video?.speed || '0KB/s'}
          </div>
        </div>
      )}
    </div>
  );
};
