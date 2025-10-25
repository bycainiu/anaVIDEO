
import React, { useState, useEffect } from 'react';
import type { AnalyzedVideo } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { SearchIcon, BotIcon } from '../common/Icons';
import VideoThumbnail from '../common/VideoThumbnail';
import PlayerView from './PlayerView';

interface UserViewProps {
    analyzedVideos: AnalyzedVideo[];
}

const UserView: React.FC<UserViewProps> = ({ analyzedVideos }) => {
    const [filteredVideos, setFilteredVideos] = useState<AnalyzedVideo[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedVideo, setSelectedVideo] = useState<AnalyzedVideo | null>(null);
    const [persistentPreview, setPersistentPreview] = useState(false); // 持久预览模式
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid'); // 视图模式
    const scrollContainerRef = React.useRef<HTMLDivElement>(null);
    const { language, t } = useLanguage();

    // 恢复滚动位置
    useEffect(() => {
        if (!selectedVideo && scrollContainerRef.current) {
            const savedScrollPos = sessionStorage.getItem('userViewScrollPos');
            if (savedScrollPos) {
                setTimeout(() => {
                    if (scrollContainerRef.current) {
                        scrollContainerRef.current.scrollTop = parseInt(savedScrollPos, 10);
                    }
                }, 100);
            }
        }
    }, [selectedVideo]);

    // 保存滚动位置
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const handleScroll = () => {
            sessionStorage.setItem('userViewScrollPos', container.scrollTop.toString());
        };

        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
    }, []);

    // 使用防抖优化搜索
    useEffect(() => {
        const sortedVideos = [...analyzedVideos].sort((a,b) => {
            // 按创建时间降序排列（最新的在前）
            if (a.createdAt && b.createdAt) {
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }
            // 如果没有创建时间，按名称排序
            return a.name.localeCompare(b.name);
        });
        
        if (!searchTerm.trim()) {
            setFilteredVideos(sortedVideos);
            return;
        }

        // 防抖延迟 300ms
        const debounceTimer = setTimeout(() => {
            const lowerCaseSearch = searchTerm.toLowerCase();
            const searchInString = (s?: string) => s ? s.toLowerCase().includes(lowerCaseSearch) : false;
            const searchInArray = (arr?: string[]) => arr ? arr.some(item => item.toLowerCase().includes(lowerCaseSearch)) : false;

            const results = sortedVideos.filter(v => {
                // Defensive checks for data integrity
                if (!v.analysis?.overallSummary || !v.analysis.frameAnalyses) {
                    return false;
                }
                return searchInString(v.name) ||
                       searchInString(v.analysis.overallSummary[language]) ||
                       v.analysis.frameAnalyses.some(f => 
                           f && (
                               searchInArray(f.keywords?.[language]) ||
                               searchInArray(f.expandedKeywords?.[language]) ||
                               searchInString(f.actionDescription?.[language]) ||
                               searchInString(f.clothingDescription?.[language]) ||
                               searchInString(f.personDescription?.[language])
                           )
                       );
            });
            setFilteredVideos(results);
        }, 300);

        return () => clearTimeout(debounceTimer);
    }, [searchTerm, analyzedVideos, language]);

    const handleSelectVideo = React.useCallback((video: AnalyzedVideo) => {
        // The 'file' property is now part of the AnalyzedVideo object in memory.
        // If it exists, we can play the video.
        if (video.file) {
            setSelectedVideo(video);
        } else {
            // This case happens for videos loaded from sessionStorage where the File object is lost.
            setSelectedVideo(video); // Still show details, but player will show an error.
        }
    }, []);

    if (selectedVideo) {
        return <PlayerView initialVideo={selectedVideo} onBack={() => setSelectedVideo(null)} />;
    }

    return (
        <div className="flex flex-col h-full">
            {/* 顶部工具栏 */}
            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
                {/* 搜索框 */}
                <div className="relative flex-1">
                    <input 
                        type="text"
                        placeholder={t('searchAllVideos')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-gray-800 border-2 border-gray-700 rounded-full py-3 pl-12 pr-4 text-white text-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-500"/>
                </div>
                
                {/* 控制按钮组 */}
                <div className="flex items-center gap-2">
                    {/* 视图切换 */}
                    <div className="flex items-center bg-gray-800 rounded-full p-1">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-full transition-colors ${
                                viewMode === 'grid'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                            }`}
                            title="网格视图"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                            </svg>
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-full transition-colors ${
                                viewMode === 'list'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                            }`}
                            title="列表视图"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                    
                    {/* 预览模式切换 */}
                    <button 
                        onClick={() => setPersistentPreview(!persistentPreview)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-medium text-sm transition-colors whitespace-nowrap ${
                            persistentPreview 
                                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                        title={persistentPreview ? '点击切换为默认模式：离开恢复缩略图' : '点击开启持久预览：离开继续播放'}
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            {persistentPreview ? (
                                <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                            ) : (
                                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                            )}
                        </svg>
                        <span className="hidden lg:inline">{persistentPreview ? '持久预览' : '默认模式'}</span>
                    </button>
                </div>
            </div>

            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pr-2">
                {analyzedVideos.length === 0 ? (
                     <div className="text-center text-gray-500 pt-20">
                        <BotIcon className="w-16 h-16 mx-auto mb-4"/>
                        <h3 className="text-xl font-semibold">{t('noVideosFound')}</h3>
                    </div>
                ) : (
                    <>
                        {filteredVideos.length === 0 && searchTerm.trim() !== '' && (
                             <p className="text-center text-gray-500 pt-10">{t('noResults')}</p>
                        )}
                        
                        {/* 网格视图 */}
                        {viewMode === 'grid' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {filteredVideos.map(video => {
                                    const thumbFrames = [video.frames[0], video.frames[Math.floor(video.frames.length / 3)], video.frames[Math.floor(video.frames.length * 2 / 3)], video.frames[video.frames.length - 1]].filter(Boolean);
                                    return (
                                        <div key={video.id} onClick={() => handleSelectVideo(video)} className="bg-gray-800 rounded-lg shadow-md flex flex-col overflow-hidden cursor-pointer group hover:ring-2 hover:ring-blue-500 transition-all">
                                            <div className="overflow-hidden">
                                               <VideoThumbnail 
                                                   videoId={video.id}
                                                   videoName={video.name}
                                                   videoFilePath={video.file_path}
                                                   frames={thumbFrames}
                                                   persistentPreview={persistentPreview}
                                               />
                                            </div>
                                            <div className="p-4">
                                                <h3 className="font-bold text-white truncate group-hover:text-blue-400 transition-colors" title={video.name}>{video.name}</h3>
                                                <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                                                    {video.analysis?.overallSummary?.[language] || 'No summary available'}
                                                </p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        
                        {/* 列表视图 */}
                        {viewMode === 'list' && (
                            <div className="space-y-3">
                                {filteredVideos.map(video => {
                                    const thumbFrames = [video.frames[0], video.frames[Math.floor(video.frames.length / 3)], video.frames[Math.floor(video.frames.length * 2 / 3)], video.frames[video.frames.length - 1]].filter(Boolean);
                                    return (
                                        <div 
                                            key={video.id} 
                                            onClick={() => handleSelectVideo(video)} 
                                            className="bg-gray-800 rounded-lg shadow-md flex overflow-hidden cursor-pointer group hover:ring-2 hover:ring-blue-500 transition-all"
                                        >
                                            {/* 缩略图 */}
                                            <div className="w-64 flex-shrink-0 overflow-hidden">
                                               <VideoThumbnail 
                                                   videoId={video.id}
                                                   videoName={video.name}
                                                   videoFilePath={video.file_path}
                                                   frames={thumbFrames}
                                                   persistentPreview={persistentPreview}
                                               />
                                            </div>
                                            
                                            {/* 信息区域 */}
                                            <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
                                                <div>
                                                    <h3 className="font-bold text-xl text-white truncate group-hover:text-blue-400 transition-colors mb-2" title={video.name}>
                                                        {video.name}
                                                    </h3>
                                                    <p className="text-sm text-gray-400 line-clamp-3 mb-3">
                                                        {video.analysis?.overallSummary?.[language] || 'No summary available'}
                                                    </p>
                                                </div>
                                                
                                                {/* 关键词标签 */}
                                                <div className="flex flex-wrap gap-2">
                                                    {(() => {
                                                        // 安全提取关键词
                                                        const keywords: string[] = [];
                                                        video.analysis?.frameAnalyses?.slice(0, 2).forEach(frame => {
                                                            if (frame?.keywords?.[language] && Array.isArray(frame.keywords[language])) {
                                                                frame.keywords[language].slice(0, 3).forEach(kw => {
                                                                    if (kw && typeof kw === 'string') {
                                                                        keywords.push(kw);
                                                                    }
                                                                });
                                                            }
                                                        });
                                                        return keywords.slice(0, 6).map((keyword, i) => (
                                                            <span key={i} className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded-full">
                                                                {keyword}
                                                            </span>
                                                        ));
                                                    })()}
                                                </div>
                                            </div>
                                            
                                            {/* 播放按钮 */}
                                            <div className="flex items-center justify-center px-6">
                                                <div className="w-12 h-12 rounded-full bg-blue-600 group-hover:bg-blue-700 flex items-center justify-center transition-colors">
                                                    <svg className="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                                                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default UserView;
