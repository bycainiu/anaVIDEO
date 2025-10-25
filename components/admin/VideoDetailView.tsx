
import React, { useState, useEffect } from 'react';
import type { AnalyzedVideo, FrameAnalysis, LocalizedString, LocalizedStringArray } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { saveAnalysis } from '../../services/storageService';
import { LoadingSpinner } from '../common/Icons';

interface VideoDetailViewProps {
    video: AnalyzedVideo;
    onBack: () => void;
    onUpdate: (updatedVideo: AnalyzedVideo) => void;
    onDelete: (videoId: string) => void;
}

const VideoDetailView: React.FC<VideoDetailViewProps> = ({ video, onBack, onUpdate, onDelete }) => {
    const [selectedFrame, setSelectedFrame] = useState<FrameAnalysis | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editableVideo, setEditableVideo] = useState<AnalyzedVideo>(() => JSON.parse(JSON.stringify(video))); // Deep copy
    const { language, t } = useLanguage();

    useEffect(() => {
        if (video.analysis.frameAnalyses.length > 0) {
            setSelectedFrame(video.analysis.frameAnalyses[0]);
        }
        setEditableVideo(JSON.parse(JSON.stringify(video)));
    }, [video]);
    
    const handleFieldChange = <T extends keyof FrameAnalysis>(frameIndex: number, field: T, lang: 'en' | 'cn', value: string | string[]) => {
        setEditableVideo(prev => {
            const newVideo = { ...prev };
            const frame = newVideo.analysis.frameAnalyses[frameIndex];
            if (typeof value === 'string') {
                (frame[field] as LocalizedString)[lang] = value;
            } else {
                 (frame[field] as LocalizedStringArray)[lang] = value;
            }
            return newVideo;
        });
    };

    const handleSummaryChange = (lang: 'en' | 'cn', value: string) => {
         setEditableVideo(prev => {
            const newVideo = { ...prev };
            newVideo.analysis.overallSummary[lang] = value;
            return newVideo;
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await saveAnalysis(editableVideo.id, editableVideo);
            onUpdate(editableVideo);
            setIsEditing(false);
        } catch (error) {
            console.error("Failed to save changes:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setEditableVideo(JSON.parse(JSON.stringify(video)));
        setIsEditing(false);
    }
    
    const renderEditableText = (value: string | undefined, onChange: (newValue: string) => void) => (
        isEditing ? 
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} className="w-full bg-gray-600 text-white p-1 rounded-md text-sm" rows={2}/> :
        <p className="text-gray-300 pl-2">{value || ''}</p>
    );
    
    const renderEditableTags = (values: string[] | undefined, onChange: (newValues: string[]) => void) => {
        const safeValues = Array.isArray(values) ? values : [];
        return isEditing ?
            <textarea value={safeValues.join(', ')} onChange={e => onChange(e.target.value.split(',').map(s => s.trim()))} className="w-full bg-gray-600 text-white p-1 rounded-md text-sm" rows={3}/> :
            <div className="flex flex-wrap gap-2 mt-2 pl-2">
                {safeValues.map((kw, idx) => <span key={`kw-${idx}`} className="bg-gray-600/80 text-gray-200 text-xs font-medium px-2.5 py-1 rounded-full">{kw}</span>)}
            </div>;
    };

    const selectedFrameIndex = editableVideo.analysis.frameAnalyses.findIndex(f => f.timestamp === selectedFrame?.timestamp);

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-gray-800 p-6 rounded-xl shadow-lg">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <button onClick={onBack} className="text-blue-400 hover:text-blue-300 mb-2">&larr; {t('adminDashboard')}</button>
                    <h2 className="text-xl font-bold text-blue-400 truncate" title={video.name}>{video.name}</h2>
                </div>
                <div className="flex gap-2">
                    {isEditing ? (
                        <>
                            <button onClick={handleSave} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:bg-gray-500 w-32 flex items-center justify-center">
                                {isSaving ? <LoadingSpinner size="sm"/> : t('saveChanges')}
                            </button>
                            <button onClick={handleCancel} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">{t('cancel')}</button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => setIsEditing(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">{t('edit')}</button>
                            <button onClick={() => onDelete(video.id)} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded">{t('delete')}</button>
                        </>
                    )}
                </div>
            </div>
            
            <div className="bg-gray-900/50 p-3 rounded-lg mb-4">
                <h3 className="font-bold text-md text-gray-200">{t('overallSummary')}</h3>
                {renderEditableText(editableVideo.analysis.overallSummary[language], (val) => handleSummaryChange(language, val))}
            </div>
            
            <div className="flex gap-2 overflow-x-auto p-2 mb-4 bg-gray-900/50 rounded-lg">
                {video.frames.map((frame, index) => (
                    <img 
                        key={index} 
                        src={frame} 
                        alt={`Frame ${index + 1}`} 
                        onClick={() => setSelectedFrame(editableVideo.analysis.frameAnalyses[index])}
                        className={`h-24 rounded-md cursor-pointer border-2 transition-all ${selectedFrame?.timestamp === editableVideo.analysis.frameAnalyses[index]?.timestamp ? 'border-blue-500 scale-105' : 'border-gray-600 hover:border-blue-400'}`}
                    />
                ))}
            </div>
            
            {selectedFrame && selectedFrameIndex !== -1 && (
                <div className="flex-1 overflow-y-auto pr-2 text-sm space-y-3">
                    <h3 className="font-bold text-lg text-gray-200">{t('frameAnalysis')} ({t('timestamp')}: {selectedFrame.timestamp.toFixed(2)}s)</h3>
                    <div className="bg-gray-700/80 p-3 rounded-lg">
                        <strong className="text-blue-400">{t('person')}:</strong>
                        {renderEditableText(selectedFrame.personDescription?.[language], (val) => handleFieldChange(selectedFrameIndex, 'personDescription', language, val))}
                    </div>
                    <div className="bg-gray-700/80 p-3 rounded-lg">
                        <strong className="text-blue-400">{t('clothing')}:</strong>
                        {renderEditableText(selectedFrame.clothingDescription?.[language], (val) => handleFieldChange(selectedFrameIndex, 'clothingDescription', language, val))}
                    </div>
                    <div className="bg-gray-700/80 p-3 rounded-lg">
                        <strong className="text-blue-400">{t('action')}:</strong>
                        {renderEditableText(selectedFrame.actionDescription?.[language], (val) => handleFieldChange(selectedFrameIndex, 'actionDescription', language, val))}
                    </div>
                    <div className="bg-gray-700/80 p-3 rounded-lg">
                        <strong className="text-blue-400">{t('inferredBehavior')}:</strong>
                         {renderEditableText(selectedFrame.inferredBehavior?.[language], (val) => handleFieldChange(selectedFrameIndex, 'inferredBehavior', language, val))}
                    </div>
                    <div className="bg-gray-700/80 p-3 rounded-lg">
                        <strong className="text-blue-400">{t('keywords')}:</strong>
                        {renderEditableTags(selectedFrame.keywords?.[language], (val) => handleFieldChange(selectedFrameIndex, 'keywords', language, val))}
                    </div>
                    <div className="bg-gray-700/80 p-3 rounded-lg">
                        <strong className="text-blue-400">{t('expandedKeywords')}:</strong>
                        {renderEditableTags(selectedFrame.expandedKeywords?.[language], (val) => handleFieldChange(selectedFrameIndex, 'expandedKeywords', language, val))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideoDetailView;
