
import React, { useRef, useEffect, useLayoutEffect, useMemo, useState, useCallback } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import '../common/VideoModal.css';
import type { AnalyzedVideo, FrameAnalysis } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import * as hybridStorage from '../../services/hybridStorageService';
import * as subtitleService from '../../services/subtitleService';
import { LoadingSpinner } from '../common/Icons';
import Player from 'video.js/dist/types/player';
import ErrorBoundary from '../common/ErrorBoundary';

interface PlayerViewProps {
  initialVideo: AnalyzedVideo;
  onBack: () => void;
}

const PlayerView: React.FC<PlayerViewProps> = ({ initialVideo, onBack }) => {
    const { language, t } = useLanguage();
    const videoRef = useRef<HTMLVideoElement>(null);
    const playerRef = useRef<Player | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const subtitleBlobUrlRef = useRef<string | null>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [hoveredFrame, setHoveredFrame] = useState<FrameAnalysis | null>(null);
    const [hoveredTime, setHoveredTime] = useState<number | null>(null);
    const [videoData, setVideoData] = useState<AnalyzedVideo>(initialVideo); // 详细数据(包含全部帧)
    const [timelineIsVertical, setTimelineIsVertical] = useState(false);
    const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);

    // 1) 进入播放页后,补拉取完整视频数据(包含所有帧路径)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const full = await hybridStorage.getVideoById(initialVideo.id);
                if (!cancelled && full) {
                    setVideoData(full);
                }
            } catch {
                // 保持使用初始数据(列表页只含缩略图)
            }
        })();
        return () => { cancelled = true; };
    }, [initialVideo.id]);

    // 2) 异步加载可播放的视频文件(URL)
    // 重要：只有在 videoData 包含 file_path 时才加载，避免使用中文标题作为文件名
    useEffect(() => {
        // 如果没有 file_path，说明数据还未完整加载，等待
        if (!videoData.file_path) {
            console.log('[PlayerView] Waiting for complete video data with file_path...');
            return;
        }

        let cancelled = false;
        
        const getVideoFile = async () => {
            setIsLoading(true);
            setError(null);
            try {
                console.log('[PlayerView] Loading video file:', videoData.file_path);
                const url = await hybridStorage.getVideoFile(videoData.id, videoData.file_path);
                
                if (cancelled) return;
                
                if (url) {
                    setVideoUrl(url);
                } else {
                    throw new Error('Video file not found.');
                }
            } catch (err: any) {
                if (!cancelled) {
                    console.error('Error loading video from storage:', err);
                    setError(t('videoPlaybackError'));
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        getVideoFile();
        
        return () => { 
            cancelled = true;
        };
    }, [videoData.id, videoData.file_path, t]);

    // 3) 预取时间轴所需缩略图,并探测方向,避免抖动
    useEffect(() => {
        const frames = videoData.frames || [];
        const preloadCount = Math.min(30, frames.length);
        for (let i = 0; i < preloadCount; i++) {
            const img = new Image();
            img.src = frames[i];
        }
        if (frames.length > 0) {
            const probe = new Image();
            probe.onload = () => setTimelineIsVertical(probe.naturalHeight > probe.naturalWidth);
            probe.src = frames[0];
        }
    }, [videoData.frames]);

    // Group keywords by timestamp for easier rendering
    const keywordsByTime = useMemo(() => {
        if (!videoData?.analysis?.frameAnalyses || !Array.isArray(videoData.analysis.frameAnalyses)) {
            return [];
        }

        const groups: Record<number, string[]> = {};
        videoData.analysis.frameAnalyses.forEach(frame => {
            if (!frame) return;

            const keywords = frame.keywords?.[language] || [];
            const expandedKeywords = frame.expandedKeywords?.[language] || [];
            const allKeywords = [...keywords, ...expandedKeywords].filter(kw => kw && typeof kw === 'string');

            if (allKeywords.length > 0) {
                const uniqueKeywords = [...new Set(allKeywords)];
                groups[frame.timestamp] = uniqueKeywords;
            }
        });

        return Object.entries(groups).map(([time, kws]) => ({
            timestamp: parseFloat(time),
            keywords: kws
        })).sort((a,b) => a.timestamp - b.timestamp);
    }, [videoData, language]);

    const handleKeywordClick = (timestamp: number) => {
        if (playerRef.current) {
            try {
                playerRef.current.currentTime(timestamp);
                playerRef.current.play().catch(() => {});
            } catch (e) {
                console.warn('[PlayerView] Error seeking to timestamp:', e);
            }
        }
    };

    // 4) 异步加载字幕
    useEffect(() => {
        let cancelled = false;
        
        const loadSubtitles = async () => {
            try {
                console.log('[PlayerView] Loading subtitles for video:', videoData.id);
                const vttContent = await subtitleService.getSubtitleContent(videoData.id, 'zh', 'vtt');
                
                if (!cancelled && vttContent) {
                    // 清理旧的字幕 URL
                    if (subtitleBlobUrlRef.current) {
                        URL.revokeObjectURL(subtitleBlobUrlRef.current);
                    }
                    
                    const blobUrl = subtitleService.createSubtitleBlobUrl(vttContent);
                    subtitleBlobUrlRef.current = blobUrl;
                    setSubtitleUrl(blobUrl);
                    console.log('[PlayerView] Subtitles loaded successfully');
                }
            } catch (err) {
                console.log('[PlayerView] No subtitles available or error loading:', err);
                setSubtitleUrl(null);
            }
        };
        
        loadSubtitles();
        
        return () => {
            cancelled = true;
            if (subtitleBlobUrlRef.current) {
                URL.revokeObjectURL(subtitleBlobUrlRef.current);
                subtitleBlobUrlRef.current = null;
            }
        };
    }, [videoData.id]);

    // 初始化video.js播放器
    useLayoutEffect(() => {
        let cancelled = false;
        let cleanupPlayer: (() => void) | null = null;

        const waitForConnected = (): Promise<void> => {
            return new Promise((resolve) => {
                let tries = 0;
                const check = () => {
                    tries++;
                    const inDom = !!containerRef.current && containerRef.current.isConnected;
                    const videoInDom = !!videoRef.current && videoRef.current.isConnected;
                    if (inDom && videoInDom) {
                        console.log('[PlayerView] Elements connected to DOM');
                        return resolve();
                    }
                    if (tries > 20 || cancelled) {
                        console.warn('[PlayerView] Timeout waiting for DOM connection');
                        return resolve();
                    }
                    requestAnimationFrame(check);
                };
                check();
            });
        };

        const disposePlayerSafely = (player: Player) => {
            try {
                console.log('[PlayerView] Disposing player safely');
                
                // 检查播放器是否已经被销毁
                if (!player || player.isDisposed()) {
                    console.log('[PlayerView] Player already disposed');
                    return;
                }
                
                // 先移除所有事件监听，防止异步回调
                if (typeof player.off === 'function') {
                    player.off();
                }
                
                // 停止播放并清空源，避免后续异步操作
                try {
                    if (player.paused && typeof player.paused === 'function' && !player.paused()) {
                        player.pause();
                    }
                } catch (e) {
                    // 忽略暂停错误
                }
                
                // 然后 dispose，会内部清理所有资源
                if (typeof player.dispose === 'function') {
                    // 使用 try-catch 包裹，忽略 dispose 过程中的任何错误
                    try {
                        player.dispose();
                    } catch (e) {
                        // 忽略 dispose 错误，因为它可能是由于 DOM 已移除
                        console.log('[PlayerView] Dispose completed with warning (expected):', e);
                    }
                }
            } catch (e) {
                console.warn('[PlayerView] Error disposing player:', e);
            }
        };

        const setup = async () => {
            if (!videoUrl) {
                console.log('[PlayerView] No videoUrl yet, skipping setup');
                return;
            }
            console.log('[PlayerView] Starting setup with videoUrl:', videoUrl.substring(0, 50));
            
            await waitForConnected();
            if (cancelled || !videoRef.current) return;

            // 先清理旧实例
            if (playerRef.current) {
                disposePlayerSafely(playerRef.current);
                playerRef.current = null;
                // 短暂等待清理完成
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            if (cancelled || !videoRef.current) return;

            try {
                console.log('[PlayerView] Creating new video.js player');
                const player = videojs(videoRef.current, {
                    controls: true,
                    autoplay: false,
                    preload: 'auto',
                    fluid: false,
                    responsive: false,
                    aspectRatio: '16:9',
                    // 禁用 userActive 监听，防止异步定时器错误
                    inactivityTimeout: 0,
                    controlBar: {
                        progressControl: { seekBar: true },
                        currentTimeDisplay: true,
                        timeDivider: true,
                        durationDisplay: true,
                        remainingTimeDisplay: false,
                        volumePanel: { inline: false },
                        fullscreenToggle: true
                    },
                    // 关键：确保 HTML5 tech 完全加载
                    html5: {
                        vhs: {
                            overrideNative: true
                        },
                        nativeTextTracks: false
                    }
                });

                // 事件监听
                player.on('loadstart', () => console.log('[PlayerView] loadstart'));
                player.on('loadedmetadata', () => {
                    console.log('[PlayerView] loadedmetadata, duration:', player.duration());
                    setDuration(player.duration() || 0);
                });
                player.on('canplay', () => console.log('[PlayerView] canplay'));
                player.on('canplaythrough', () => console.log('[PlayerView] canplaythrough'));
                player.on('timeupdate', () => setCurrentTime(player.currentTime() || 0));
                player.on('error', () => {
                    const err = player.error();
                    console.error('[PlayerView] Player error:', err);
                });

                playerRef.current = player;

                // 设置清理函数
                cleanupPlayer = () => disposePlayerSafely(player);

                // 设置视频源
                const ext = videoUrl.split('?')[0].split('.').pop()?.toLowerCase();
                const typeMap: Record<string, string> = {
                    mp4: 'video/mp4',
                    m4v: 'video/mp4',
                    webm: 'video/webm',
                    mov: 'video/quicktime',
                    mkv: 'video/x-matroska'
                };
                const mime = (ext && typeMap[ext]) ? typeMap[ext] : 'video/mp4';
                console.log('[PlayerView] Setting source, type:', mime);
                
                player.src({ src: videoUrl, type: mime });
                player.load();
                
                // 等待可以播放再启动
                player.one('canplay', () => {
                    if (!cancelled) {
                        console.log('[PlayerView] Ready to play, starting playback');
                        player.play().catch(e => console.warn('[PlayerView] Autoplay failed:', e));
                    }
                });
            } catch (e) {
                console.error('[PlayerView] Setup failed:', e);
            }
        };

        setup();

        return () => { 
            cancelled = true;
            // 立即清空 playerRef，防止其他代码访问
            const playerToDispose = playerRef.current;
            playerRef.current = null;
            
            if (playerToDispose) {
                // 延迟清理，确保当前执行栈清空
                requestAnimationFrame(() => {
                    disposePlayerSafely(playerToDispose);
                });
            }
        };
    }, [videoUrl]); // 移除 subtitleUrl 依赖，避免字幕加载时重新创建播放器

    // 动态添加字幕(当字幕加载完成且播放器已初始化时)
    useEffect(() => {
        if (!subtitleUrl || !playerRef.current) {
            return;
        }

        const player = playerRef.current;
        let cleanupHandler: (() => void) | null = null;
        
        // 等待播放器完全初始化后再添加字幕
        const addSubtitleWhenReady = () => {
            try {
                console.log('[PlayerView] Adding subtitle track:', subtitleUrl.substring(0, 50));
                
                // 移除已有的字幕轨道(避免重复)
                const tracks = player.remoteTextTracks();
                for (let i = tracks.length - 1; i >= 0; i--) {
                    const track = tracks[i];
                    if (track.kind === 'subtitles') {
                        player.removeRemoteTextTrack(track);
                    }
                }
                
                // 添加新字幕轨道
                const trackElement = player.addRemoteTextTrack({
                    kind: 'subtitles',
                    src: subtitleUrl,
                    srclang: 'zh',
                    label: '简体中文',
                    default: true
                }, false);
                
                // 强制显示字幕
                if (trackElement && trackElement.track) {
                    trackElement.track.mode = 'showing';
                    console.log('[PlayerView] ✅ Subtitle track added and enabled');
                } else {
                    console.warn('[PlayerView] ⚠️ Track element created but track not accessible');
                }
            } catch (e) {
                console.error('[PlayerView] Error adding subtitle track:', e);
            }
        };
        
        // 总是等待 loadedmetadata 事件,确保播放器完全准备好
        // 即使 readyState >= 1,也可能只是部分加载,不足以支持字幕
        if (player.readyState() >= 1) {
            console.log('[PlayerView] Player readyState >= 1, but still waiting for next loadedmetadata or canplay');
            // 使用 canplay 事件作为更可靠的信号
            const handler = () => {
                console.log('[PlayerView] Received canplay event, adding subtitles');
                addSubtitleWhenReady();
            };
            player.one('canplay', handler);
            cleanupHandler = () => player.off('canplay', handler);
        } else {
            console.log('[PlayerView] Player not ready, waiting for loadedmetadata');
            const handler = () => {
                console.log('[PlayerView] Received loadedmetadata event, adding subtitles');
                addSubtitleWhenReady();
            };
            player.one('loadedmetadata', handler);
            cleanupHandler = () => player.off('loadedmetadata', handler);
        }
        
        return () => {
            if (cleanupHandler) cleanupHandler();
        };
    }, [subtitleUrl]);

    // 清理player实例
    useEffect(() => {
        return () => {
            console.log('[PlayerView] Component unmounting, cleaning up');
            
            if (playerRef.current) {
                const player = playerRef.current;
                playerRef.current = null; // 立即清空 ref，防止其他代码访问
                
                // 在下一个微任务中执行清理，确保当前所有同步代码完成
                Promise.resolve().then(() => {
                    try {
                        // 先移除事件监听
                        if (typeof player.off === 'function') {
                            player.off();
                        }
                        
                        // 然后 dispose
                        if (typeof player.dispose === 'function') {
                            try {
                                player.dispose();
                            } catch (e) {
                                // 忽略 dispose 错误，因为组件已卸载
                                console.log('[PlayerView] Dispose completed on unmount');
                            }
                        }
                    } catch (e) {
                        console.warn('[PlayerView] Error disposing player on unmount:', e);
                    }
                });
            }
            
            // 清理字幕 blob URL
            if (subtitleBlobUrlRef.current) {
                URL.revokeObjectURL(subtitleBlobUrlRef.current);
                subtitleBlobUrlRef.current = null;
            }
        };
    }, []);


    // 根据时间找到对应的帧
    const findFrameAtTime = useCallback((time: number): FrameAnalysis | null => {
        if (!videoData || !videoData.analysis?.frameAnalyses?.length) return null;

        let closestFrame = videoData.analysis.frameAnalyses[0];
        let minDiff = Math.abs(time - closestFrame.timestamp);

        for (const frame of videoData.analysis.frameAnalyses) {
            const diff = Math.abs(time - frame.timestamp);
            if (diff < minDiff) {
                minDiff = diff;
                closestFrame = frame;
            }
        }

        return closestFrame;
    }, [videoData]);

    // 时间轴点击处理
    const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineRef.current || !playerRef.current || !duration) return;

        const rect = timelineRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        const time = percentage * duration;

        playerRef.current.currentTime(time);
        if (playerRef.current.paused()) {
            playerRef.current.play().catch(() => {});
        }
    }, [duration]);

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

    const framesForTimeline = videoData.frames && videoData.frames.length > 0 ? videoData.frames : initialVideo.frames;

    // 优化：时间轴最多显示50帧，减少DOM节点
    const sampledFramesForTimeline = useMemo(() => {
        if (!framesForTimeline || framesForTimeline.length === 0) return [];
        
        const maxFrames = 50;
        if (framesForTimeline.length <= maxFrames) {
            return framesForTimeline.map((img, idx) => ({ img, originalIndex: idx }));
        }
        
        // 按比例抽样
        const step = framesForTimeline.length / maxFrames;
        const sampled: { img: string; originalIndex: number }[] = [];
        for (let i = 0; i < maxFrames; i++) {
            const index = Math.floor(i * step);
            sampled.push({ img: framesForTimeline[index], originalIndex: index });
        }
        return sampled;
    }, [framesForTimeline]);

    return (
        <ErrorBoundary>
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-shrink-0 mb-4">
                <button onClick={onBack} className="text-blue-400 hover:text-blue-300 mb-2">&larr; {t('searchResults')}</button>
                <h2 className="text-2xl font-bold text-white truncate" title={videoData.name}>{videoData.name}</h2>
            </div>
            <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0 overflow-hidden">
                <div className="w-full md:w-2/3 flex-shrink-0 bg-black rounded-lg overflow-hidden flex flex-col" style={{ minHeight: 0 }}>
                    <div className="flex-1 flex items-center justify-center overflow-hidden" style={{ minHeight: 0 }}>
                        {isLoading && <LoadingSpinner size="lg" />}
                        {error && !isLoading && (
                             <div className="text-center text-red-400 p-4">
                                <p className='font-bold text-lg'>Video Playback Error</p>
                                <p className="text-sm mt-1">{error}</p>
                            </div>
                        )}
                        {videoUrl && !isLoading && (
                            <div data-vjs-player className="w-full h-full" ref={containerRef}>
                                <video 
                                    ref={videoRef} 
                                    className="video-js vjs-big-play-centered vjs-theme-fantasy vjs-has-custom-timeline"
                                    style={{ width: '100%', height: '100%' }}
                                    playsInline
                                    crossOrigin="anonymous"
                                />
                            </div>
                        )}
                    </div>

                    {/* 专业时间轴预览 */}
                    {videoUrl && !isLoading && duration > 0 && (
                        <div className="relative bg-gray-900">
                            {/* 悬浮预览窗口 */}
                            {hoveredFrame && hoveredTime !== null && (
                                <div 
                                    className="absolute bottom-full mb-2 pointer-events-none z-10"
                                    style={{
                                        left: `${(hoveredTime / duration) * 100}%`,
                                        transform: 'translateX(-50%)'
                                    }}
                                >
                                    <div className="bg-gray-900 bg-opacity-98 rounded-lg shadow-2xl border border-gray-700 overflow-hidden"
                                         style={{ width: '280px' }}>
                                        {/* 缩略图预览 */}
                                        {(() => {
                                            const frameIndex = videoData?.analysis?.frameAnalyses?.findIndex(
                                                f => f?.timestamp === hoveredFrame.timestamp
                                            );
                                            return frameIndex !== undefined && frameIndex >= 0 && framesForTimeline?.[frameIndex] ? (
                                                <img
                                                    src={framesForTimeline[frameIndex]}
                                                    alt="Frame preview"
                                                    className="w-full h-40 object-cover"
                                                />
                                            ) : null;
                                        })()}
                                        
                                        {/* 信息面板 */}
                                        <div className="p-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="text-blue-400 text-sm font-semibold">
                                                    {hoveredTime.toFixed(1)}s
                                                </div>
                                                <div className="text-gray-400 text-xs">
                                                    {Math.floor(hoveredTime / 60)}:{String(Math.floor(hoveredTime % 60)).padStart(2, '0')}
                                                </div>
                                            </div>
                                            <div className="text-white text-sm mb-2 line-clamp-2">
                                                {language === 'cn' 
                                                    ? hoveredFrame.actionDescription?.cn || ''
                                                    : hoveredFrame.actionDescription?.en || ''}
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                {(() => {
                                                    const kws = language === 'cn' ? hoveredFrame.keywords?.cn : hoveredFrame.keywords?.en;
                                                    const kwArray = Array.isArray(kws) ? kws : [];
                                                    return kwArray.slice(0, 4).map((keyword, i) => (
                                                        <span key={i} className="px-2 py-0.5 bg-blue-600 bg-opacity-80 text-white text-xs rounded">
                                                            {keyword}
                                                        </span>
                                                    ));
                                                })()}
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
                                className="relative h-32 cursor-pointer select-none bg-gray-800 border-t-2 border-gray-700 group"
                                onClick={handleTimelineClick}
                                onMouseMove={handleTimelineHover}
                                onMouseLeave={handleTimelineLeave}
                            >
                                {/* 帧缩略图网格 */}
                                <div className="absolute inset-0 flex">
                                    {sampledFramesForTimeline.map(({ img: frameImg, originalIndex }, displayIndex) => {
                                        const frame = videoData?.analysis?.frameAnalyses?.[originalIndex];
                                        if (!frame) return null;
                                        const nextSampled = sampledFramesForTimeline[displayIndex + 1];
                                        const nextFrame = nextSampled 
                                            ? videoData?.analysis?.frameAnalyses?.[nextSampled.originalIndex]
                                            : null;
                                        const startPercent = (frame.timestamp / duration) * 100;
                                        const endPercent = nextFrame ? (nextFrame.timestamp / duration) * 100 : 100;
                                        const widthPercent = endPercent - startPercent;
                                        
                                        return (
                                            <div
                                                key={`${displayIndex}-${originalIndex}`}
                                                className="relative border-r border-gray-700 hover:brightness-110 transition-all"
                                                style={{
                                                    width: `${widthPercent}%`,
                                                    minWidth: '2px'
                                                }}
                                            >
                                                <img
                                                    src={frameImg}
                                                    alt={`Frame ${originalIndex}`}
                                                    className="w-full h-full object-cover"
                                                    draggable={false}
                                                    loading="lazy"
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
                    )}
                </div>
                <div className="flex-1 flex flex-col min-h-0">
                    <h3 className="text-lg font-semibold text-blue-400 mb-2">{t('keywords')}</h3>
                    <div className="overflow-y-auto bg-gray-800 p-4 rounded-lg space-y-4">
                        {keywordsByTime.map(({ timestamp, keywords }) => (
                            <div key={timestamp}>
                                <h4 className="text-sm font-bold text-gray-400 cursor-pointer hover:text-white" onClick={() => handleKeywordClick(timestamp)}>
                                    {t('jumpTo')} {timestamp.toFixed(2)}s
                                </h4>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {keywords.map((kw, idx) => (
                                        <button 
                                            key={`${timestamp}-kw-${idx}`} 
                                            onClick={() => handleKeywordClick(timestamp)}
                                            className="bg-gray-700 text-gray-200 text-xs font-medium px-2.5 py-1 rounded-full hover:bg-blue-600 hover:text-white transition-colors"
                                        >
                                            {kw}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
        </ErrorBoundary>
    );
};

export default PlayerView;
