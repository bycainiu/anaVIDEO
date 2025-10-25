import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import './VideoModal.css';
import { backendService } from '../../services/backendService';
import { useLanguage } from '../../contexts/LanguageContext';
import type { AnalyzedVideo, FrameAnalysis } from '../../types';
import type Player from 'video.js/dist/types/player';
import { getSubtitleContent, createSubtitleBlobUrl } from '../../services/subtitleService';

interface VideoModalProps {
  videoId: string;
  onClose: () => void;
}

const VideoModal: React.FC<VideoModalProps> = ({ videoId, onClose }) => {
  const [video, setVideo] = useState<AnalyzedVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(true);
  const [position, setPosition] = useState({ x: window.innerWidth / 2 - 400, y: 100 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hoveredFrame, setHoveredFrame] = useState<FrameAnalysis | null>(null);
  const [hoveredTime, setHoveredTime] = useState<number>(0);
  const [subtitlesLoaded, setSubtitlesLoaded] = useState(false);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [isTimelineDragging, setIsTimelineDragging] = useState(false);
  const [showFrameInfo, setShowFrameInfo] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Player | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const { t, language } = useLanguage();

  useEffect(() => {
    loadVideo();
  }, [videoId]);

  // 清理player实例（在组件卸载时）
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try {
          // 先暂停播放
          if (typeof playerRef.current.pause === 'function') {
            playerRef.current.pause();
          }
          // 移除所有事件监听
          if (typeof playerRef.current.off === 'function') {
            playerRef.current.off();
          }
          // 安全释放
          if (typeof playerRef.current.dispose === 'function') {
            playerRef.current.dispose();
          }
        } catch (e) {
          console.warn('[VideoModal] Error disposing player:', e);
        }
        playerRef.current = null;
      }
    };
  }, []);

  const loadVideo = async () => {
    try {
      setLoading(true);
      const videoData = await backendService.getVideoById(videoId);
      setVideo(videoData);
    } catch (error) {
      console.error('Failed to load video:', error);
    } finally {
      setLoading(false);
    }
  };

  // 初始化video.js播放器并在切换视频时仅更换source
  useLayoutEffect(() => {
    let cancelled = false;

    const waitForConnected = (): Promise<void> => {
      return new Promise((resolve) => {
        let tries = 0;
        const check = () => {
          tries++;
          const inDom = !!containerRef.current && containerRef.current.isConnected && document.body.contains(containerRef.current);
          const videoInDom = !!videoRef.current && videoRef.current.isConnected && document.body.contains(videoRef.current);
          if (inDom && videoInDom) return resolve();
          if (tries > 20 || cancelled) return resolve();
          requestAnimationFrame(check);
        };
        check();
      });
    };

    const setup = async () => {
      if (!video) return;
      await waitForConnected();
      if (cancelled || !videoRef.current) return;

      // 第一次创建 player
      if (!playerRef.current) {
        const player = videojs(videoRef.current, {
          controls: true,
          autoplay: false,
          muted: true, // 允许自动播放
          preload: 'metadata',
          fluid: false,
          responsive: false,
          aspectRatio: '16:9',
          controlBar: {
            progressControl: { seekBar: true },
            currentTimeDisplay: true,
            timeDivider: true,
            durationDisplay: true,
            remainingTimeDisplay: false,
            volumePanel: { inline: false },
            fullscreenToggle: true
          }
        });

        // 事件监听与调试
        player.on('error', () => {
          const err = player.error();
          console.error('[VideoModal] Player error:', err);
        });
        player.on('waiting', () => console.log('[VideoModal] waiting...'));
        player.on('stalled', () => console.log('[VideoModal] stalled'));
        player.on('canplay', () => console.log('[VideoModal] canplay'));
        player.on('canplaythrough', () => console.log('[VideoModal] canplaythrough'));
        player.on('seeking', () => console.log('[VideoModal] seeking to', player.currentTime()));
        player.on('seeked', () => console.log('[VideoModal] seeked to', player.currentTime()));

        player.on('timeupdate', () => setCurrentTime(player.currentTime() || 0));
        player.on('loadedmetadata', () => setDuration(player.duration() || 0));

        playerRef.current = player;
      }

      // 加载字幕（如果存在）
      loadSubtitles(playerRef.current, videoId);

      // 切换视频源（更稳健）
      const currentUrl = backendService.getVideoFileUrl(videoId, video.file_path || video.name);
      const ext = currentUrl.split('?')[0].split('.').pop()?.toLowerCase();
      const typeMap: Record<string, string> = {
        mp4: 'video/mp4',
        m4v: 'video/mp4',
        webm: 'video/webm',
        mov: 'video/quicktime',
        mkv: 'video/x-matroska'
      };
      const mime = (ext && typeMap[ext]) ? typeMap[ext] : 'video/mp4';
      const srcObj = { src: currentUrl, type: mime } as any;
      try {
        const player = playerRef.current!;
        player.pause();
        player.src(srcObj);
        player.load();
        player.currentTime(0);

        // 等到可以播放再启动
        const start = () => player.play().catch(() => {});
        if (player.readyState() >= 3) {
          start();
        } else {
          player.one('canplay', start);
        }
      } catch (e) {
        console.warn('[VideoModal] set src failed:', e);
      }
    };

    setup();

    return () => { cancelled = true; };
  }, [videoId, video]);

  // 加载中文字幕
  const loadSubtitles = async (player: Player, videoId: string) => {
    try {
      setSubtitlesLoaded(false);
      setSubtitleError(null);

      // 加载 VTT 格式中文字幕
      const vttContent = await getSubtitleContent(videoId, 'zh', 'vtt');
      
      if (vttContent) {
        // 创建 Blob URL
        const blobUrl = createSubtitleBlobUrl(vttContent);
        
        // 移除旧字幕轨道
        const tracks = player.remoteTextTracks();
        for (let i = tracks.length - 1; i >= 0; i--) {
          player.removeRemoteTextTrack(tracks[i]);
        }

        // 添加中文字幕轨道
        player.addRemoteTextTrack({
          kind: 'subtitles',
          src: blobUrl,
          srclang: 'zh',
          label: '中文',
          mode: 'showing' // 默认显示字幕
        } as any, false);

        setSubtitlesLoaded(true);
        console.log('[VideoModal] Subtitles loaded successfully');
      }
    } catch (error: any) {
      // 字幕不存在或加载失败，不阻塞视频播放
      if (error.message !== 'Failed to fetch subtitle content') {
        console.warn('[VideoModal] Failed to load subtitles:', error);
        setSubtitleError(error.message);
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('drag-handle')) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  // ESC键关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // 根据时间找到对应的帧
  const findFrameAtTime = useCallback((time: number): FrameAnalysis | null => {
    if (!video) return null;
    
    // 找到最接近的帧
    let closestFrame = video.analysis.frameAnalyses[0];
    let minDiff = Math.abs(time - closestFrame.timestamp);
    
    for (const frame of video.analysis.frameAnalyses) {
      const diff = Math.abs(time - frame.timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closestFrame = frame;
      }
    }
    
    return closestFrame;
  }, [video]);

  // 时间轴跳转处理（支持点击和拖拽）
  const seekToTimelinePosition = useCallback((clientX: number) => {
    if (!timelineRef.current || !playerRef.current || !duration) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const time = percentage * duration;
    
    playerRef.current.currentTime(time);
  }, [duration]);

  // 时间轴点击处理
  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    seekToTimelinePosition(e.clientX);
    const p = playerRef.current;
    if (p && p.paused()) {
      p.play().catch(() => {});
    }
  }, [seekToTimelinePosition]);
  
  // 时间轴鼠标按下
  const handleTimelineMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setIsTimelineDragging(true);
    seekToTimelinePosition(e.clientX);
  }, [seekToTimelinePosition]);

  // 时间轴悬停处理
  const handleTimelineHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !duration) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const time = percentage * duration;
    
    setHoveredTime(time);
    const frame = findFrameAtTime(time);
    setHoveredFrame(frame);
  }, [duration, findFrameAtTime]);

  const handleTimelineLeave = useCallback(() => {
    setHoveredFrame(null);
    setHoveredTime(null);
  }, []);
  
  // 全局拖拽监听
  useEffect(() => {
    if (!isTimelineDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      seekToTimelinePosition(e.clientX);
    };
    
    const handleMouseUp = () => {
      setIsTimelineDragging(false);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isTimelineDragging, seekToTimelinePosition]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-gray-800 p-6 rounded-lg">
          <p className="text-white mb-4">Video not found</p>
          <button onClick={onClose} className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700">
            Close
          </button>
        </div>
      </div>
    );
  }

  // 使用 file_path 如果存在,否则降级到 name

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
         onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={modalRef}
        className="bg-gray-900 rounded-xl shadow-2xl overflow-hidden"
        style={{
          position: 'absolute',
          left: position.x,
          top: position.y,
          width: size.width,
          height: '85vh',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header - Drag Handle */}
        <div
          className="drag-handle bg-gray-800 px-4 py-3 flex items-center justify-between cursor-move border-b border-gray-700"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-3">
            <span className="text-white font-medium truncate max-w-md">{video.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFrameInfo(!showFrameInfo)}
              className="p-2 hover:bg-gray-700 rounded transition-colors"
              title={showFrameInfo ? '隐藏时间点信息' : '显示时间点信息'}
            >
              <span className="text-white text-sm">🔍</span>
            </button>
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="p-2 hover:bg-gray-700 rounded transition-colors"
              title={showInfo ? 'Hide info' : 'Show info'}
            >
              <span className="text-white text-sm">ℹ️</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded transition-colors"
              title="Close (ESC)"
            >
              <span className="text-white text-xl leading-none">×</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex">
          {/* Video Player */}
          <div className="flex-1 bg-black flex flex-col">
            <div className="flex-1 flex items-center justify-center overflow-hidden">
              <div data-vjs-player className="w-full h-full" key={videoId} ref={containerRef}>
                <video
                  ref={videoRef}
                  className="video-js vjs-big-play-centered vjs-theme-fantasy"
                  style={{ width: '100%', height: '100%' }}
                  playsInline
                  crossOrigin="anonymous"
                />
              </div>
            </div>

            {/* 时间轴预览 */}
            <div className="relative bg-gray-900">
              {/* 悬浮预览窗口 */}
              {showFrameInfo && hoveredFrame && hoveredTime !== null && (
                <div 
                  className="absolute bottom-full mb-2 pointer-events-none z-10"
                  style={{
                    left: `${(hoveredTime / duration) * 100}%`,
                    transform: 'translateX(-50%)'
                  }}
                >
                  <div className="bg-gray-900 bg-opacity-98 rounded-lg shadow-2xl border border-gray-700 overflow-hidden"
                       style={{ width: '220px' }}>
                    {/* 缩略图预览 */}
                    {(() => {
                      const frameIndex = video?.analysis.frameAnalyses.findIndex(
                        f => f.timestamp === hoveredFrame.timestamp
                      );
                      return frameIndex !== undefined && frameIndex >= 0 && video?.frames[frameIndex] ? (
                        <img
                          src={video.frames[frameIndex]}
                          alt="Frame preview"
                          className="w-full h-28 object-cover"
                        />
                      ) : null;
                    })()}
                    
                    {/* 信息面板 */}
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-blue-400 text-xs font-semibold">
                          {hoveredTime.toFixed(1)}s
                        </div>
                        <div className="text-gray-400 text-xs">
                          {Math.floor(hoveredTime / 60)}:{String(Math.floor(hoveredTime % 60)).padStart(2, '0')}
                        </div>
                      </div>
                      <div className="text-white text-xs mb-1 line-clamp-2">
                        {language === 'cn' 
                          ? hoveredFrame.actionDescription.cn 
                          : hoveredFrame.actionDescription.en}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(language === 'cn' 
                          ? hoveredFrame.keywords.cn 
                          : hoveredFrame.keywords.en
                        ).slice(0, 3).map((keyword, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-blue-600 bg-opacity-80 text-white text-xs rounded">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    {/* 小三角 */}
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-gray-900" />
                  </div>
                </div>
              )}

              {/* 帧缩略图时间轴 */}
              <div 
                ref={timelineRef}
                className="relative h-20 cursor-pointer select-none bg-gray-800 border-t-2 border-gray-700 group"
                onClick={handleTimelineClick}
                onMouseDown={handleTimelineMouseDown}
                onMouseMove={handleTimelineHover}
                onMouseLeave={handleTimelineLeave}
              >
                {/* 帧缩略图网格 */}
                <div className="absolute inset-0 flex">
                  {video?.frames.map((frameImg, index) => {
                    const frame = video.analysis.frameAnalyses[index];
                    const nextFrame = video.analysis.frameAnalyses[index + 1];
                    const startPercent = (frame.timestamp / duration) * 100;
                    const endPercent = nextFrame ? (nextFrame.timestamp / duration) * 100 : 100;
                    const widthPercent = endPercent - startPercent;
                    
                    return (
                      <div
                        key={index}
                        className="relative border-r border-gray-700 hover:brightness-110 transition-all"
                        style={{
                          width: `${widthPercent}%`,
                          minWidth: '2px'
                        }}
                      >
                        <img
                          src={frameImg}
                          alt={`Frame ${index}`}
                          className="w-full h-full object-cover"
                          draggable={false}
                        />
                        
                        {/* 时间戳标签 */}
                        <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black bg-opacity-70 rounded text-xs text-white font-mono">
                          {frame.timestamp.toFixed(1)}s
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 播放进度遮罩 */}
                {duration > 0 && (
                  <div
                    className="absolute top-0 bottom-0 bg-gradient-to-r from-blue-500/40 to-blue-600/30 pointer-events-none border-r-2 border-blue-400 transition-all"
                    style={{
                      left: 0,
                      width: `${(currentTime / duration) * 100}%`,
                    }}
                  />
                )}

                {/* 播放位置指示线 */}
                {duration > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-1 bg-red-500 pointer-events-none shadow-lg transition-all"
                    style={{
                      left: `${(currentTime / duration) * 100}%`,
                      transform: 'translateX(-50%)'
                    }}
                  >
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full shadow-lg" />
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full shadow-lg" />
                  </div>
                )}

                {/* 悬停位置指示线 */}
                {hoveredTime !== null && duration > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none opacity-70"
                    style={{
                      left: `${(hoveredTime / duration) * 100}%`,
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Info Panel */}
          {showInfo && (
            <div className="w-96 bg-gray-800 overflow-y-auto border-l border-gray-700">
              <div className="p-4 space-y-4">
                {/* Summary */}
                <div>
                  <h3 className="text-white font-semibold mb-2">{t('overallSummary')}</h3>
                  <p className="text-gray-300 text-sm">
                    {language === 'cn' ? video.analysis.overallSummary.cn : video.analysis.overallSummary.en}
                  </p>
                </div>

                {/* Frame Count */}
                <div>
                  <h3 className="text-white font-semibold mb-2">{t('frames')}</h3>
                  <p className="text-gray-300 text-sm">{video.frames.length} {t('keyframes')}</p>
                </div>

                {/* Keywords from first few frames */}
                <div>
                  <h3 className="text-white font-semibold mb-2">{t('keywords')}</h3>
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const allKeywords = new Set<string>();
                      video.analysis.frameAnalyses.slice(0, 5).forEach(frame => {
                        const keywords = language === 'cn' ? frame.keywords.cn : frame.keywords.en;
                        keywords.forEach(k => allKeywords.add(k));
                      });
                      return Array.from(allKeywords).slice(0, 15).map((keyword, i) => (
                        <span key={i} className="px-2 py-1 bg-blue-600 text-white text-xs rounded">
                          {keyword}
                        </span>
                      ));
                    })()}
                  </div>
                </div>

                {/* Frame Analyses */}
                <div>
                  <h3 className="text-white font-semibold mb-2">{t('frameAnalysis')}</h3>
                  <div className="space-y-3">
                    {video.analysis.frameAnalyses.map((frame, index) => (
                      <div key={index} className="bg-gray-700 p-3 rounded">
                        <div className="text-blue-400 text-xs mb-1">
                          {frame.timestamp.toFixed(1)}s
                        </div>
                        <div className="text-gray-300 text-sm">
                          {language === 'cn' ? frame.actionDescription.cn : frame.actionDescription.en}
                        </div>
                        {index < video.frames.length && (
                          <img
                            src={video.frames[index]}
                            alt={`Frame at ${frame.timestamp}s`}
                            className="mt-2 w-full rounded"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoModal;
