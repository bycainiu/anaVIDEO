import React, { useState, useRef, useEffect } from 'react';
import { SupportedSitesModal } from './SupportedSitesModal';

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
const PROXY_BASE = 'http://localhost:8888/proxy?url=';


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
  const [showSitesModal, setShowSitesModal] = useState(false);

  // 打开B站弹窗
  const openBiliPopup = () => {
    // 如果弹窗已经打开，聚焦它
    if (popupWindowRef.current && !popupWindowRef.current.closed) {
      popupWindowRef.current.focus();
      return;
    }

    let targetUrl = urlInput;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://www.bilibili.com/' + targetUrl.replace(/^\/+/, '');
    }

    // 打开新弹窗
    const proxiedUrl = PROXY_BASE + encodeURIComponent(targetUrl);
    const popup = window.open(
      proxiedUrl,
      'BiliBrowser',
      'width=1200,height=800,menubar=no,toolbar=no,location=yes,status=yes,resizable=yes,scrollbars=yes'
    );

    if (popup) {
      popupWindowRef.current = popup;
      setIsPopupOpen(true);

      // 监听弹窗关闭
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          setIsPopupOpen(false);
          popupWindowRef.current = null;
        }
      }, 1000);
    } else {
      alert('弹窗被浏览器阻止！\n\n请在浏览器设置中允许弹窗，或者按住Ctrl键点击"打开B站浏览器"按钮。');
    }
  };

  // 关闭弹窗
  const closeBiliPopup = () => {
    if (popupWindowRef.current && !popupWindowRef.current.closed) {
      popupWindowRef.current.close();
    }
    setIsPopupOpen(false);
    popupWindowRef.current = null;
  };

  // 导航到指定URL
  const handleNavigate = () => {
    if (isPopupOpen && popupWindowRef.current && !popupWindowRef.current.closed) {
      let targetUrl = urlInput;
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://www.bilibili.com/' + targetUrl.replace(/^\/+/, '');
      }

      try {
        const proxiedUrl = PROXY_BASE + encodeURIComponent(targetUrl);
        popupWindowRef.current.location.href = proxiedUrl;
        popupWindowRef.current.focus();
      } catch (e) {
        console.error('无法导航弹窗:', e);
        alert('无法导航到该URL，可能是跨域限制');
      }
    } else {
      openBiliPopup();
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
        if (!document.hasFocus()) {
          return;
        }

        const text = await navigator.clipboard.readText();

        // 检查是否是视频链接（支持多个站点）
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
          // 新闻媒体
          /cnn\.com/,
          /bbc\.co\.uk/,
          /bbc\.com/,
          /espn\.com/,
          // 其他平台
          /vk\.com/,
          /ok\.ru/,
          /rutube\.ru/,
          /streamable\.com/,
          /soundcloud\.com/,
          /bandcamp\.com/,
          /mixcloud\.com/,
          /spotify\.com/,
          /linkedin\.com/,
          /pinterest\.com/,
          /tumblr\.com/,
          /flickr\.com/,
          /nicovideo\.jp/,
          /nico\.ms/,
          /afreecatv\.com/,
          /crunchyroll\.com/,
          /funimation\.com/,
          /vrv\.co/,
        ];

        const isVideoUrl = videoPatterns.some(pattern => pattern.test(text));

        if (text && isVideoUrl && !processedUrls.has(text)) {
          console.log('[剪贴板] 检测到视频链接:', text);
          setLastUrl(text);
          setProcessedUrls(prev => new Set(prev).add(text));

          // 触发下载
          onUrlDetected(text);
        }
      } catch (err) {
        // 忽略剪贴板权限错误
      }
    };

    intervalRef.current = setInterval(checkClipboard, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [monitoringEnabled, processedUrls, onUrlDetected]);

  // 清理
  useEffect(() => {
    return () => {
      closeBiliPopup();
    };
  }, []);

  return (
    <>
      {/* 支持网站弹窗 */}
      {showSitesModal && <SupportedSitesModal onClose={() => setShowSitesModal(false)} />}
      
      <div style={{ display: 'flex', height: '100%', background: '#f5f5f5' }}>
      {/* 侧边栏 */}
      {showSidebar && (
        <div style={{
          width: '300px',
          background: 'white',
          borderRight: '1px solid #e0e0e0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* 侧边栏头部 */}
          <div style={{
            padding: '16px',
            borderBottom: '1px solid #e0e0e0',
background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 700, color: 'white' }}>
              🎬 B站浏览器
            </h3>

            {/* 监听开关 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 14px',
background: monitoringEnabled ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              color: 'white',
              border: monitoringEnabled ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent',
              transition: 'all 0.3s',
              cursor: 'pointer'
            }}
            onClick={() => setMonitoringEnabled(!monitoringEnabled)}
            >
              <input
                type="checkbox"
                checked={monitoringEnabled}
                onChange={(e) => e.stopPropagation()}
                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
              />
<span>🔍 剪贴板监听</span>
              <div style={{
                marginLeft: 'auto',
                padding: '2px 8px',
                borderRadius: '12px',
                background: monitoringEnabled ? '#4caf50' : '#757575',
                fontSize: '11px',
                fontWeight: 600
              }}>
                {monitoringEnabled ? '开启' : '关闭'}
              </div>
            </div>

            {lastUrl && (
              <div style={{
                marginTop: '12px',
                padding: '12px',
                background: 'rgba(255,255,255,0.95)',
                borderRadius: '8px',
                fontSize: '12px',
                wordBreak: 'break-all',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}>
                <div style={{ color: '#666', marginBottom: '6px', fontWeight: 600, fontSize: '11px' }}>✨ 最后检测:</div>
                <div style={{ color: '#333', fontSize: '11px', lineHeight: '1.4' }}>{lastUrl}</div>
              </div>
            )}
          </div>

          {/* 下载任务列表 */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px', background: '#f8f9fa' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px'
            }}>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#333' }}>
                📥 下载任务 <span style={{color: '#667eea'}}>({allTasks.length})</span>
              </h4>
              {allTasks.some(t => t.status === 'completed' || t.status === 'error') && (
                <button
                  onClick={onClearCompleted}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    background: '#f5f5f5',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  清除已完成
                </button>
              )}
            </div>

            {allTasks.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '48px 16px',
                color: '#999',
                fontSize: '14px',
                background: 'white',
                borderRadius: '12px',
                border: '2px dashed #e0e0e0'
              }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>📦</div>
                <div style={{ fontWeight: 500 }}>暂无下载任务</div>
                <div style={{ fontSize: '12px', marginTop: '4px', color: '#bbb' }}>复制视频链接即可开始</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {allTasks.map(task => (
                  <div
                    key={task.task_id || task.id}
                    style={{
                      padding: '14px',
                      background: 'white',
                      borderRadius: '10px',
                      border: '1px solid #e8e8e8',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      marginBottom: '10px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: '#2c3e50'
                    }}>
                      {task.title || task.url}
                    </div>

                    {task.status === 'downloading' && (() => {
                      // 处理progress可能是数字或对象
                      const progressValue = typeof task.progress === 'object' 
                        ? (task.progress?.progress || 0)
                        : (task.progress || 0);
                      const speed = typeof task.progress === 'object' && task.progress?.speed
                        ? task.progress.speed
                        : null;
                      
                      return (
                        <div style={{ marginBottom: '8px' }}>
                          <div style={{
                            height: '4px',
                            background: '#e0e0e0',
                            borderRadius: '2px',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              height: '100%',
                              background: '#2196f3',
                              width: `${progressValue}%`,
                              transition: 'width 0.3s'
                            }} />
                          </div>
                          <div style={{
                            fontSize: '11px',
                            color: '#666',
                            marginTop: '4px',
                            display: 'flex',
                            justifyContent: 'space-between'
                          }}>
                            <span>{progressValue.toFixed(1)}%</span>
                            {speed && <span style={{ color: '#2196f3' }}>{speed}</span>}
                          </div>
                        </div>
                      );
                    })()}

                    {/* 错误信息显示 */}
                    {task.status === 'error' && task.error && (
                      <div style={{
                        marginBottom: '10px',
                        padding: '10px',
                        background: '#fff3f3',
                        border: '1px solid #ffcdd2',
                        borderRadius: '6px',
                        fontSize: '11px',
                        lineHeight: '1.6',
                        color: '#c62828',
                        whiteSpace: 'pre-line',
                        maxHeight: '120px',
                        overflow: 'auto'
                      }}>
                        {task.error}
                      </div>
                    )}

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '12px'
                    }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontWeight: 500,
                        background: task.status === 'completed' ? '#e8f5e9' :
                                   task.status === 'error' ? '#ffebee' :
                                   task.status === 'downloading' ? '#e3f2fd' : '#fff3e0',
                        color: task.status === 'completed' ? '#2e7d32' :
                               task.status === 'error' ? '#c62828' :
                               task.status === 'downloading' ? '#1565c0' : '#e65100'
                      }}>
                        {task.status === 'completed' ? '✓ 完成' :
                         task.status === 'error' ? '✗ 失败' :
                         task.status === 'downloading' ? '↓ 下载中' : '⏳ 等待中'}
                      </span>

                      {(task.status === 'downloading' || task.status === 'pending') && (
                        <button
                          onClick={() => onCancel(task.id)}
                          style={{
                            padding: '2px 8px',
                            fontSize: '11px',
                            background: '#fff',
                            border: '1px solid #ddd',
                            borderRadius: '3px',
                            cursor: 'pointer'
                          }}
                        >
                          取消
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* 工具栏 */}
        <div style={{
          padding: '12px 16px',
          background: 'white',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          gap: '8px',
          alignItems: 'center'
        }}>
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            style={{
              padding: '8px 12px',
              background: '#f5f5f5',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            {showSidebar ? '◀' : '▶'}
          </button>

          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleNavigate()}
            placeholder="输入B站链接或搜索..."
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          />

          <button
            onClick={handleNavigate}
            style={{
              padding: '8px 16px',
              background: '#2196f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500
            }}
          >
            {isPopupOpen ? '导航' : '打开'}
          </button>

          {isPopupOpen && (
            <button
              onClick={closeBiliPopup}
              style={{
                padding: '8px 16px',
                background: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              关闭弹窗
            </button>
          )}
        </div>

        {/* 内容区 */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fafafa'
        }}>
          {!isPopupOpen ? (
            <div style={{ textAlign: 'center', padding: '48px' }}>
              <div style={{
                fontSize: '48px',
                marginBottom: '24px'
              }}>
                🎬
              </div>
              <h2 style={{
                fontSize: '24px',
                fontWeight: 600,
                marginBottom: '16px',
                color: '#333'
              }}>
                B站浏览器
              </h2>
              <p style={{
                fontSize: '14px',
                color: '#666',
                marginBottom: '24px',
                lineHeight: '1.6'
              }}>
                点击"打开"按钮在新窗口中浏览B站<br />
                复制视频链接到剪贴板即可自动下载
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={openBiliPopup}
                  style={{
                    padding: '12px 32px',
                    background: '#2196f3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: 500,
                    boxShadow: '0 2px 8px rgba(33, 150, 243, 0.3)'
                  }}
                >
                  打开B站浏览器
                </button>
                <button
                  onClick={() => setShowSitesModal(true)}
                  style={{
                    padding: '12px 32px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: 500,
                    boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
                  }}
                >
                  🌍 支持的网站
                </button>
              </div>
              <div style={{
                marginTop: '24px',
                padding: '16px',
                background: '#fff3e0',
                borderRadius: '8px',
                fontSize: '13px',
                color: '#666',
                textAlign: 'left',
                maxWidth: '400px',
                margin: '24px auto 0'
              }}>
                <div style={{ fontWeight: 600, marginBottom: '8px', color: '#333' }}>
                  💡 提示
                </div>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  <li>如果弹窗被阻止，请允许浏览器弹窗</li>
                  <li>弹窗中可以正常登录和浏览B站</li>
                  <li>复制视频链接会自动触发下载</li>
                  <li>支持单个视频和合集下载</li>
                </ul>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '48px' }}>
              <div style={{
                fontSize: '48px',
                marginBottom: '24px'
              }}>
                ✅
              </div>
              <h2 style={{
                fontSize: '24px',
                fontWeight: 600,
                marginBottom: '16px',
                color: '#333'
              }}>
                B站浏览器已打开
              </h2>
              <p style={{
                fontSize: '14px',
                color: '#666',
                marginBottom: '24px'
              }}>
                请在弹出的窗口中浏览B站<br />
                复制视频链接即可自动下载
              </p>
              <div style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'center'
              }}>
                <button
                  onClick={() => popupWindowRef.current?.focus()}
                  style={{
                    padding: '10px 24px',
                    background: '#2196f3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  聚焦弹窗
                </button>
                <button
                  onClick={closeBiliPopup}
                  style={{
                    padding: '10px 24px',
                    background: '#f44336',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  关闭弹窗
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  );
};

