import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useProcessing } from '../../contexts/ProcessingContext';
import * as hybridStorage from '../../services/hybridStorageService';
import type { AnalyzedVideo, ApiProvider } from '../../types';
import { SearchIcon, LoadingSpinner, GraphIcon, DeleteIcon } from '../common/Icons';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSettings } from '../../contexts/SettingsContext';
import VideoDetailView from './VideoDetailView';
import VideoThumbnail from '../common/VideoThumbnail';
import KeywordGraph from './KeywordGraph';

interface AdminViewProps {
    analyzedVideos: Record<string, AnalyzedVideo>;
    setAnalyzedVideos: React.Dispatch<React.SetStateAction<Record<string, AnalyzedVideo>>>;
    isDataLoaded: boolean;
}

const AdminView: React.FC<AdminViewProps> = ({ analyzedVideos, setAnalyzedVideos, isDataLoaded }) => {
    const [activeView, setActiveView] = useState<'dashboard' | 'detail'>('dashboard');
    const [selectedVideo, setSelectedVideo] = useState<AnalyzedVideo | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [graphFilterKeyword, setGraphFilterKeyword] = useState<string | null>(null);
    const [isGraphVisible, setIsGraphVisible] = useState(false); // 默认隐藏图谱
    const [persistentPreview, setPersistentPreview] = useState(false); // 持久预览模式

    const { language, t } = useLanguage();
    const { videoProvider, setVideoProvider, settings } = useSettings();
    const { isProcessing, addToQueue } = useProcessing();
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // 恢复滚动位置
    useEffect(() => {
        if (activeView === 'dashboard' && scrollContainerRef.current) {
            const savedScrollPos = sessionStorage.getItem('adminViewScrollPos');
            if (savedScrollPos) {
                setTimeout(() => {
                    if (scrollContainerRef.current) {
                        scrollContainerRef.current.scrollTop = parseInt(savedScrollPos, 10);
                    }
                }, 100);
            }
        }
    }, [activeView]);

    // 保存滚动位置
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container || activeView !== 'dashboard') return;

        const handleScroll = () => {
            sessionStorage.setItem('adminViewScrollPos', container.scrollTop.toString());
        };

        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
    }, [activeView]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            const newFiles = Array.from(files).filter(f => f.type.startsWith('video/'));
            addToQueue(newFiles);
        }
        event.target.value = '';
    };

    const handleSelectVideo = async (video: AnalyzedVideo) => {
        // 总是从后端加载完整数据（包含详细描述）
        const hasDescriptions = video.analysis?.frameAnalyses?.[0]?.personDescription?.en;
        
        if (!hasDescriptions) {
            try {
                console.log('[AdminView] Loading full video details for:', video.id);
                const fullVideo = await hybridStorage.getVideoById(video.id);
                if (fullVideo) {
                    console.log('[AdminView] Full video loaded, first frame description:', fullVideo.analysis?.frameAnalyses?.[0]?.personDescription?.en?.substring(0, 50));
                    setSelectedVideo(fullVideo);
                    // 更新缓存
                    setAnalyzedVideos(prev => ({...prev, [fullVideo.id]: fullVideo}));
                } else {
                    console.warn('[AdminView] Failed to load full video, using partial data');
                    setSelectedVideo(video);
                }
            } catch (error) {
                console.error('[AdminView] Error loading video details:', error);
                setSelectedVideo(video);
            }
        } else {
            console.log('[AdminView] Video already has full data');
            setSelectedVideo(video);
        }
        setActiveView('detail');
    };
    
    const handleUpdateAnalysis = async (updatedVideo: AnalyzedVideo) => {
        setAnalyzedVideos(prev => ({...prev, [updatedVideo.id]: updatedVideo }));
    };

    const handleDeleteVideo = async (videoId: string, event?: React.MouseEvent) => {
        event?.stopPropagation();
        if(window.confirm(t('confirmDelete', analyzedVideos[videoId].name))) {
            await hybridStorage.deleteVideo(videoId);
            setAnalyzedVideos(prev => {
                const newVideos = {...prev};
                delete newVideos[videoId];
                return newVideos;
            });
            if(selectedVideo?.id === videoId) {
                setSelectedVideo(null);
                setActiveView('dashboard');
            }
        }
    };
    
    const filteredVideos = Object.values(analyzedVideos).filter(v => {
        const lowerLang = language;

        // Validation: Ensure the video object and its analysis are minimally valid.
        if (!v || !v.analysis) {
            console.warn('[AdminView] Skipping video with missing analysis object:', v?.id);
            return false;
        }

        // Graph Filter
        if (graphFilterKeyword) {
            const hasKeyword = v.analysis.frameAnalyses?.some(f => 
                f?.keywords?.[lowerLang]?.includes(graphFilterKeyword) || 
                f?.expandedKeywords?.[lowerLang]?.includes(graphFilterKeyword)
            );
            if (!hasKeyword) return false;
        }

        // Search Term Filter
        if (!searchTerm) return true;
        const lowerSearch = searchTerm.toLowerCase();
        const search = (s?: string) => s ? s.toLowerCase().includes(lowerSearch) : false;
        const searchArr = (arr?: string[]) => arr ? arr.some(item => item.toLowerCase().includes(lowerSearch)) : false;
        
        return search(v.name) || 
               search(v.analysis.overallSummary?.[lowerLang]) || 
               (v.analysis.frameAnalyses || []).some(f => 
                   f && (
                       searchArr(f.keywords?.[lowerLang]) || 
                       searchArr(f.expandedKeywords?.[lowerLang]) || 
                       search(f.actionDescription?.[lowerLang])
                   )
               );
    }).sort((a,b) => {
        // 按创建时间降序排列（最新的在前）
        if (a.createdAt && b.createdAt) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        // 如果没有创建时间，按名称排序
        return a.name.localeCompare(b.name);
    });

    const getTopKeywords = useCallback((video: AnalyzedVideo, count: number): string[] => {
        const keywordCounts = new Map<string, number>();
        
        // Defensive check for frameAnalyses
        if (!video.analysis?.frameAnalyses || !Array.isArray(video.analysis.frameAnalyses)) {
            console.warn('[AdminView] frameAnalyses is missing or invalid for video:', video.id);
            return [];
        }
        
        video.analysis.frameAnalyses.forEach(frame => {
            if (frame.keywords?.[language] && Array.isArray(frame.keywords[language])) {
                frame.keywords[language].forEach(kw => {
                    keywordCounts.set(kw, (keywordCounts.get(kw) || 0) + 2);
                });
            }
            if (frame.expandedKeywords?.[language] && Array.isArray(frame.expandedKeywords[language])) {
                frame.expandedKeywords[language].forEach(kw => {
                    keywordCounts.set(kw, (keywordCounts.get(kw) || 0) + 1);
                });
            }
        });
        return Array.from(keywordCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, count)
            .map(entry => entry[0]);
    }, [language]);

    if (activeView === 'detail' && selectedVideo) {
        return <VideoDetailView video={selectedVideo} onBack={() => setActiveView('dashboard')} onUpdate={handleUpdateAnalysis} onDelete={handleDeleteVideo} />;
    }

    return (
        <div className="flex flex-col h-full gap-4">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="video/*" className="hidden" multiple />

            <header className="bg-gray-800 p-4 rounded-xl shadow-lg flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1">
                    <h2 className="text-xl font-bold text-blue-400">{t('adminDashboard')}</h2>
                    <p className="text-sm text-gray-400">{t('analyzedVideos')}: {Object.keys(analyzedVideos).length}</p>
                </div>
                 <div className="flex items-center gap-4">
                    <label htmlFor="video-provider" className="text-sm font-medium text-gray-300">{t('provider')}:</label>
                    <select id="video-provider" value={videoProvider} onChange={(e) => setVideoProvider(e.target.value as ApiProvider)} className="bg-gray-700 border border-gray-600 rounded-md py-1 px-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="gemini">Google Gemini</option>
                        <option value="openai">OpenAI Compatible</option>
                    </select>
                </div>
                <button 
                    onClick={async () => {
                        try {
                            const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3004';
                            const body = {
                                apiKey: settings.openai.apiKey,
                                baseUrl: settings.openai.baseUrl,
                                model: settings.openai.model || 'grok-4'
                            };
                            const response = await fetch(`${API_BASE_URL}/api/videos/generate-titles`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(body)
                            });
                            const data = await response.json();
                            if (data.success) {
                                alert('标题生成已启动！请查看服务器控制台日志。处理完成后刷新页面。');
                                console.log('[AdminView] Title generation started:', data);
                            } else {
                                alert(`标题生成失败: ${data.message || data.error}`);
                            }
                        } catch (error) {
                            console.error('[AdminView] Failed to trigger title generation:', error);
                            alert('无法连接到后端服务器，请确保服务器已启动');
                        }
                    }}
                    className="w-full md:w-auto bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors text-sm"
                    title="为带有默认文件名（如 xxx.mp4）的视频生成标题"
                >
                    🎯 生成标题
                </button>
                <button onClick={() => fileInputRef.current?.click()} disabled={isProcessing} className="w-full md:w-auto bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-500 disabled:cursor-wait">
                    {isProcessing ? t('processing') : t('addVideos')}
                </button>
            </header>
            
            <div className="bg-gray-800 rounded-xl shadow-lg">
                <button 
                    onClick={() => setIsGraphVisible(!isGraphVisible)} 
                    className="flex items-center justify-between w-full p-4 hover:bg-gray-700/50 transition-colors rounded-xl"
                >
                    <div className="flex items-center gap-2">
                        <GraphIcon />
                        <h3 className="font-bold text-lg text-blue-400">{t('keywordGraph')}</h3>
                        <span className="text-xs text-gray-500">(点击{isGraphVisible ? '隐藏' : '显示'})</span>
                    </div>
                    <svg 
                        className={`w-5 h-5 text-gray-400 transition-transform ${isGraphVisible ? 'rotate-180' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                {isGraphVisible && (
                    <div className="p-4 border-t border-gray-700">
                        <p className="text-xs text-gray-400 mb-2 text-center">{t('keywordGraphDescription')}</p>
                        <div className="w-full h-64 bg-gray-900 rounded-lg">
                             <KeywordGraph 
                                analyzedVideos={Object.values(analyzedVideos)} 
                                onNodeClick={(kw) => setGraphFilterKeyword(kw)}
                                activeNode={graphFilterKeyword}
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-1 flex flex-col min-h-0 bg-gray-800 p-4 rounded-xl shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                    <div className="relative flex-1">
                        <input type="text" placeholder={t('searchAnalyses')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-gray-900/50 border border-gray-700 rounded-full py-2 pl-10 pr-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"/>
                    </div>
                    <button 
                        onClick={() => setPersistentPreview(!persistentPreview)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-colors whitespace-nowrap ${
                            persistentPreview 
                                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                        title={persistentPreview ? '点击切换为默认模式：离开恢复缩略图' : '点击开启持久预览：离开继续播放'}
                    >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            {persistentPreview ? (
                                <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                            ) : (
                                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                            )}
                        </svg>
                        <span>{persistentPreview ? '持久预览' : '默认模式'}</span>
                    </button>
                </div>

                {graphFilterKeyword && (
                    <div className="mb-4 flex items-center gap-2">
                        <span className="text-sm text-gray-400">{t('graphFilterActive')}</span>
                        <span className="bg-blue-600 text-white text-sm font-medium px-3 py-1 rounded-full">{graphFilterKeyword}</span>
                        <button onClick={() => setGraphFilterKeyword(null)} className="text-red-400 hover:text-red-300 text-sm font-bold">{t('clearFilter')}</button>
                    </div>
                )}

                <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pr-2 space-y-3">
                    {filteredVideos.map(video => {
                        const thumbFrames = [video.frames[0], video.frames[Math.floor(video.frames.length / 3)], video.frames[Math.floor(video.frames.length * 2 / 3)], video.frames[video.frames.length - 1]].filter(Boolean);
                        const topKeywords = getTopKeywords(video, 10);
                        return (
                            <div key={video.id} onClick={() => handleSelectVideo(video)} className="bg-gray-900/50 rounded-lg shadow-md flex items-start p-3 gap-4 cursor-pointer hover:bg-gray-700/50 transition-colors">
                                <div className="w-32 flex-shrink-0">
                                   <VideoThumbnail 
                                       videoId={video.id}
                                       videoName={video.name}
                                       videoFilePath={video.file_path}
                                       frames={thumbFrames}
                                       persistentPreview={persistentPreview}
                                   />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-white truncate" title={video.name}>{video.name}</h3>
                                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                                        {video.analysis.overallSummary?.[language] || 'No summary available'}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {topKeywords.map((kw, idx) => (
                                            <span key={`${video.id}-kw-${idx}`} className="bg-gray-700 text-gray-300 text-xs font-medium px-2 py-0.5 rounded-full">{kw}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                     <button onClick={() => handleSelectVideo(video)} className="w-full bg-blue-600 text-white text-xs font-bold py-1 px-3 rounded-md hover:bg-blue-700 transition-colors">
                                        {t('viewDetails')}
                                    </button>
                                     <button onClick={(e) => handleDeleteVideo(video.id, e)} className="w-full bg-red-600/80 text-white text-xs font-bold py-1 px-3 rounded-md hover:bg-red-700 transition-colors flex items-center justify-center gap-1">
                                        <DeleteIcon className="w-4 h-4" /> {t('delete')}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                    {!isDataLoaded && <div className="text-center text-gray-500 pt-10"><LoadingSpinner size="lg"/></div>}
                    {isDataLoaded && filteredVideos.length === 0 && <p className="text-center text-gray-500 pt-10">{t('noResults')}</p>}
                </div>
            </div>
        </div>
    );
};

export default AdminView;