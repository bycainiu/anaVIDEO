import localforage from 'localforage';
import type { AnalyzedVideo } from '../types';

// Create two separate instances of localforage, pointing to different stores (like tables).
const analysisStore = localforage.createInstance({
    name: 'GeminiCreativeSuiteDB',
    storeName: 'video_analyses',
    description: 'Permanent storage for video analysis JSON results.'
});

const fileStore = localforage.createInstance({
    name: 'GeminiCreativeSuiteDB',
    storeName: 'video_files',
    description: 'Permanent storage for the raw video File/Blob objects.'
});

// --- WRITE ---
export const saveAnalysis = async (videoId: string, analysisData: Omit<AnalyzedVideo, 'file'>): Promise<void> => {
    try {
        await analysisStore.setItem(videoId, analysisData);
    } catch (error) {
        console.error(`Failed to save analysis for video ${videoId}:`, error);
    }
};

export const saveVideoFile = async (videoId: string, file: File): Promise<void> => {
    try {
        await fileStore.setItem(videoId, file);
    } catch (error) {
        console.error(`Failed to save file for video ${videoId}:`, error);
    }
};

// --- READ ---
export const loadAllAnalyses = async (): Promise<Record<string, AnalyzedVideo>> => {
    try {
        const analyses: Record<string, AnalyzedVideo> = {};
        await analysisStore.iterate((value, key) => {
            analyses[key] = value as AnalyzedVideo;
        });
        return analyses;
    } catch (error) {
        console.error("Failed to load all analyses from IndexedDB:", error);
        return {};
    }
};

export const loadVideoFile = async (videoId: string): Promise<File | null> => {
    try {
        return await fileStore.getItem<File>(videoId);
    } catch (error) {
        console.error(`Failed to load video file for ${videoId}:`, error);
        return null;
    }
}

// --- DELETE ---
export const deleteVideo = async (videoId: string): Promise<void> => {
    try {
        await analysisStore.removeItem(videoId);
        await fileStore.removeItem(videoId);
    } catch (error) {
        console.error(`Failed to delete video ${videoId}:`, error);
    }
};

// --- BACKUP / RESTORE ---
interface ExportPayload {
    version: string;
    exportedAt: string;
    videos: Omit<AnalyzedVideo, 'file'>[];
}

export const exportAllAnalyses = async (): Promise<Blob> => {
    const all = await loadAllAnalyses();
    const payload: ExportPayload = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        videos: Object.values(all)
    };
    const json = JSON.stringify(payload, null, 2);
    return new Blob([json], { type: 'application/json' });
};

export const importAnalyses = async (file: File): Promise<number> => {
    const text = await file.text();
    const data: ExportPayload = JSON.parse(text);
    if (!data || !Array.isArray(data.videos)) throw new Error('Invalid import file');

    let count = 0;
    for (const v of data.videos) {
        if (!v?.id || !v?.analysis) continue;
        await analysisStore.setItem(v.id, v);
        count++;
    }
    return count;
};

export const clearAllData = async (): Promise<void> => {
    await analysisStore.clear();
    await fileStore.clear();
};
