import React, { useState, useRef, useEffect } from 'react';
import * as hybridStorage from '../../services/hybridStorageService';
import Lightbox from './Lightbox';
import { logger, LogCategory } from '../../utils/logger';

interface VideoThumbnailProps {
  videoId: string;
  videoName: string;
  videoFilePath?: string; // 实际文件路径(用于播放)
  frames: string[];
  persistentPreview?: boolean; // 鼠标离开后是否继续播放
}

const VideoThumbnail: React.FC<VideoThumbnailProps> = ({ videoId, videoName, videoFilePath, frames, persistentPreview = false }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [isVideoLoaded, setIsVideoLoaded] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isVerticalVideo, setIsVerticalVideo] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const segmentIndexRef = useRef(0);
    const segmentTimerRef = useRef<NodeJS.Timeout | null>(null);
    const playbackActiveRef = useRef(false); // 标记播放状态，避免竞态
    const pointerOverRef = useRef(false); // 真实的指针是否在卡片上
    
    // 使用 useMemo 缓存 displayFrames，避免每次渲染都重新计算
    const displayFrames = React.useMemo(() => {
        const result = [...frames];
        while(result.length > 0 && result.length < 4) {
            result.push(...frames.slice(0, 4 - result.length));
        }
        return result;
    }, [frames]);

    // 鼠标悬浮时加载视频
    useEffect(() => {
        if (isHovered && !videoUrl) {
            // 延迟700ms才开始加载，避免快速滑过时不必要的加载，减少同时加载数量
            hoverTimeoutRef.current = setTimeout(async () => {
                // 再次检查是否仍然悬停（用户可能已经移开）
                if (!isHovered) return;
                
                try {
                    // 优先使用 file_path,否则使用 name
                    const fileToLoad = videoFilePath || videoName;
                    const url = await hybridStorage.getVideoFile(videoId, fileToLoad);
                    if (url && isHovered) { // 确保加载完成时仍在悬停
                        logger.info(`Loading video: ${fileToLoad}`, undefined, LogCategory.UI);
                        setVideoUrl(url);
                    }
                } catch (error) {
                    logger.error('Failed to load video', error, LogCategory.UI);
                }
            }, 700);
        }
        
        return () => {
            if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
                hoverTimeoutRef.current = null;
            }
        };
    }, [isHovered, videoUrl, videoId, videoName, videoFilePath]);

    // 视频加载完成后开始分段预览
    useEffect(() => {
        const video = videoRef.current;
        if (video && videoUrl && isHovered && isVideoLoaded) {
            const duration = video.duration;
            
            // 验证 duration 是有效数字
            if (!duration || !isFinite(duration) || duration <= 0) {
                logger.warn('Invalid video duration', duration, LogCategory.UI);
                return;
            }
            
            segmentIndexRef.current = 0;
            playbackActiveRef.current = true; // 标记开始播放
            
            // 分段预览策略
            const playSegment = () => {
                if (!video) return;
                
                let segments: { start: number; duration: number; speed: number }[] = [];
                
                if (duration <= 15) {
                    // 短视频：完整播放，1.2-1.5倍速
                    segments = [{ start: 0, duration: duration, speed: 1.2 }];
                } else if (duration <= 60) {
                    // 中等视频：抽取5段，每段2秒，1.5倍速
                    const segmentCount = 5;
                    for (let i = 0; i < segmentCount; i++) {
                        segments.push({
                            start: (duration / (segmentCount + 1)) * (i + 1),
                            duration: 2,
                            speed: 1.5
                        });
                    }
                } else if (duration <= 180) {
                    // 长视频：抽取7段，每段1.5秒，1.8倍速
                    const segmentCount = 7;
                    for (let i = 0; i < segmentCount; i++) {
                        segments.push({
                            start: (duration / (segmentCount + 1)) * (i + 1),
                            duration: 1.5,
                            speed: 1.8
                        });
                    }
                } else {
                    // 超长视频：抽取10段，每段1秒，2倍速
                    const segmentCount = 10;
                    for (let i = 0; i < segmentCount; i++) {
                        segments.push({
                            start: (duration / (segmentCount + 1)) * (i + 1),
                            duration: 1,
                            speed: 2.0
                        });
                    }
                }
                
                const playNextSegment = () => {
                    // 检查播放是否仍然活跃
                    if (!playbackActiveRef.current) {
                        return; // 播放已被停止，不继续
                    }
                    
                    if (segmentIndexRef.current >= segments.length) {
                        // 所有段播放完毕，循环
                        segmentIndexRef.current = 0;
                        if (playbackActiveRef.current) {
                            playNextSegment();
                        }
                        return;
                    }
                    
                    const segment = segments[segmentIndexRef.current];
                    
                    // 验证 segment.start 是有效数字
                    if (!isFinite(segment.start) || segment.start < 0) {
                        logger.warn('Invalid segment start', segment.start, LogCategory.UI);
                        segmentIndexRef.current++;
                        playNextSegment();
                        return;
                    }
                    
                    // 确保不超过视频时长
                    video.currentTime = Math.min(segment.start, video.duration - 0.1);
                    video.playbackRate = segment.speed;
                    
                    // 安全播放：只在播放活跃时调用 play()
                    if (playbackActiveRef.current && video.paused) {
                        video.play().catch(err => {
                            // 忽略因为 pause() 导致的中断错误
                            if (err.name !== 'AbortError') {
                                logger.warn('Autoplay prevented', err, LogCategory.UI);
                            }
                        });
                    }
                    
                    // 计算实际播放时长（考虑播放速度）
                    const actualPlayTime = (segment.duration / segment.speed) * 1000;
                    
                    segmentIndexRef.current++;
                    segmentTimerRef.current = setTimeout(playNextSegment, actualPlayTime);
                };
                
                playNextSegment();
                logger.info(`Video ${duration.toFixed(1)}s, ${segments.length} segments preview`, undefined, LogCategory.UI);
            };
            
            playSegment();
            
            // 启动进度更新（模拟连续进度）
            progressIntervalRef.current = setInterval(() => {
                if (video && video.duration > 0 && !video.paused) {
                    setProgress((video.currentTime / video.duration) * 100);
                }
            }, 100);
        }
        
        return () => {
            // 清理时标记播放已停止
            playbackActiveRef.current = false;
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
            }
            if (segmentTimerRef.current) {
                clearTimeout(segmentTimerRef.current);
                segmentTimerRef.current = null;
            }
        };
    }, [videoUrl, isHovered, isVideoLoaded]);

    const handleMouseEnter = () => {
        pointerOverRef.current = true;
        setIsHovered(true);
    };

    // 将状态重置为缩略图模式
    const resetToThumbnail = () => {
        logger.info(`Resetting to thumbnail: ${videoName}`, undefined, LogCategory.UI);
        // 立即停止播放状态标记，防止后续的 play() 调用
        playbackActiveRef.current = false;
        
        // 清除所有定时器（在暂停视频之前）
        if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
        }
        if (segmentTimerRef.current) {
            clearTimeout(segmentTimerRef.current);
            segmentTimerRef.current = null;
        }
        
        // 暂停并重置视频，但不移除 src（保留缓存）
        const video = videoRef.current;
        if (video) {
            video.pause();
            video.currentTime = 0;
            // 不移除 src，只是暂停和重置位置
        }
        
        // 清理状态，但保留 videoUrl 用于缓存
        setIsVideoLoaded(false);
        setProgress(0);
        segmentIndexRef.current = 0;
    };

    const handleMouseLeave = () => {
        pointerOverRef.current = false;
        // 如果开启了持久预览模式，不改变任何状态，保持视频继续播放
        if (persistentPreview) {
            // 保持 isHovered 为 true，让视频继续播放和显示
            return;
        }
        // 默认模式：恢复缩略图
        setIsHovered(false);
        resetToThumbnail();
    };

    // 当从持久预览切回默认模式时，如果指针不在卡片上，应恢复缩略图
    useEffect(() => {
        if (!persistentPreview && !pointerOverRef.current && isHovered) {
            setIsHovered(false);
            resetToThumbnail();
        }
    }, [persistentPreview]);

    // 组件卸载时清理所有资源
    useEffect(() => {
        return () => {
            logger.info(`Unmounting component: ${videoName}`, undefined, LogCategory.UI);
            
            // 立即停止播放状态
            playbackActiveRef.current = false;
            
            // 清理所有定时器
            if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
                hoverTimeoutRef.current = null;
            }
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
            }
            if (segmentTimerRef.current) {
                clearTimeout(segmentTimerRef.current);
                segmentTimerRef.current = null;
            }
            
            // 释放视频资源
            const video = videoRef.current;
            if (video) {
                video.pause();
                const currentUrl = video.src;
                video.removeAttribute('src');
                video.load();
                
                // 释放 blob URL
                if (currentUrl && currentUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(currentUrl);
                }
            }
        };
    }, [videoName]); // 添加 videoName 依赖

    const handleVideoCanPlay = () => {
        const video = videoRef.current;
        if (video) {
            // 检测视频是否为竖版
            setIsVerticalVideo(video.videoHeight > video.videoWidth);
        }
        setIsVideoLoaded(true);
    };

    const handleVideoEnded = () => {
        // 分段播放不需要监听onEnded，由定时器控制
    };

    if (displayFrames.length === 0) {
        return <div className="aspect-video bg-gray-700 flex items-center justify-center text-xs text-gray-500">No Frames</div>;
    }

    return (
        <>
            <div 
                className="relative aspect-video cursor-pointer group bg-black rounded-lg overflow-hidden"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onClick={() => setIsLightboxOpen(true)}
            >
                {/* 缩略图网格 */}
                <div 
                    className={`grid grid-cols-2 grid-rows-2 w-full h-full transition-opacity duration-300 ${
                        isHovered && isVideoLoaded ? 'opacity-0' : 'opacity-100'
                    }`}
                >
                    {displayFrames.slice(0, 4).map((frame, index) => (
                        <div key={index} className="overflow-hidden">
                            <img 
                                src={frame} 
                                alt={`Thumbnail frame ${index + 1}`} 
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                loading="lazy"
                                decoding="async"
                            />
                        </div>
                    ))}
                </div>

                {/* 视频预览层 */}
                {videoUrl && (
                    <video
                        ref={videoRef}
                        src={videoUrl}
                        className={`absolute inset-0 w-full h-full transition-opacity duration-300 ${
                            isHovered && isVideoLoaded ? 'opacity-100' : 'opacity-0'
                        } ${
                            isVerticalVideo ? 'object-contain' : 'object-cover'
                        }`}
                        muted
                        loop={false}
                        playsInline
                        preload="metadata"
                        onCanPlay={handleVideoCanPlay}
                        onEnded={handleVideoEnded}
                    />
                )}

                {/* 播放图标提示 */}
                {!isHovered && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <svg className="w-12 h-12 text-white/80" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                        </svg>
                    </div>
                )}

                {/* 加载中指示器 */}
                {isHovered && videoUrl && !isVideoLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                    </div>
                )}
                
                {/* 进度条 */}
                {isHovered && isVideoLoaded && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                        <div 
                            className="h-full bg-red-600 transition-all duration-100 ease-linear"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                )}
            </div>
            
            {isLightboxOpen && <Lightbox frames={displayFrames} onClose={() => setIsLightboxOpen(false)} />}
        </>
    );
};

export default VideoThumbnail;
