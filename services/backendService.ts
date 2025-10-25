import type { AnalyzedVideo, VideoAnalysisResult } from '../types';

const API_BASE_URL: string = (import.meta as any).env?.VITE_API_URL;

/**
 * 计算文件MD5哈希值
 */
export async function calculateFileHash(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const chunkSize = 2 * 1024 * 1024; // 2MB块
    let offset = 0;
    const crypto = window.crypto.subtle;
    
    // 使用 Web Crypto API 计算 MD5 （浏览器环境下）
    // 注意：Web Crypto API 不直接支持 MD5，这里使用 SHA-256 代替
    const hashBuffer: number[] = [];
    
    const readChunk = () => {
      const slice = file.slice(offset, offset + chunkSize);
      reader.readAsArrayBuffer(slice);
    };
    
    reader.onload = async (e) => {
      if (!e.target?.result) return;
      
      const chunk = new Uint8Array(e.target.result as ArrayBuffer);
      hashBuffer.push(...chunk);
      
      offset += chunkSize;
      
      if (offset < file.size) {
        readChunk();
      } else {
        // 所有块读取完毕，计算哈希
        try {
          const hashArray = new Uint8Array(hashBuffer);
          const hashHex = await crypto.digest('SHA-256', hashArray);
          const hashStr = Array.from(new Uint8Array(hashHex))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          resolve(hashStr);
        } catch (err) {
          reject(err);
        }
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    
    readChunk();
  });
}

/**
 * 检查文件是否已存在（秒传功能）
 */
export async function checkFileHash(fileHash: string, fileName: string, fileSize: number): Promise<{
  exists: boolean;
  videoId?: string;
  videoName?: string;
  frameCount?: number;
  message: string;
}> {
  const response = await fetch(`${API_BASE_URL}/api/videos/check-hash`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fileHash, fileName, fileSize }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Check failed' }));
    throw new Error(error.error || 'Failed to check file hash');
  }

  return response.json();
}

/**
 * 上传视频并提取帧
 */
export async function uploadVideo(file: File): Promise<{
  videoId: string;
  videoName: string;
  framesData: { timestamp: number; base64Data: string }[];
  frameCount: number;
  fileHash?: string;
  fileSize?: number;
}> {
  const formData = new FormData();
  formData.append('video', file);

  const response = await fetch(`${API_BASE_URL}/api/videos/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Failed to upload video');
  }

  return response.json();
}

/**
 * 保存视频分析结果
 */
export async function saveAnalysis(
  videoId: string,
  videoName: string,
  analysis: VideoAnalysisResult,
  frames: string[],
  fileHash?: string,
  fileSize?: number
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/videos/${videoId}/analysis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      videoName,
      analysis,
      frames,
      fileHash,
      fileSize,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Save failed' }));
    throw new Error(error.error || 'Failed to save analysis');
  }
}

/**
 * 获取所有视频
 */
export async function getAllVideos(): Promise<Record<string, AnalyzedVideo>> {
  if (!API_BASE_URL) throw new Error('VITE_API_URL is not configured');
  const response = await fetch(`${API_BASE_URL}/api/videos`);

  if (!response.ok) {
    throw new Error('Failed to fetch videos');
  }

  const videos: any[] = await response.json();
  
  // 转换为Record格式
  const result: Record<string, AnalyzedVideo> = {};
  for (const video of videos) {
    result[video.id] = {
      id: video.id,
      name: video.name,
      file_path: video.file_path || video.name, // 使用 file_path,降级到 name
      analysis: video.analysis,
      frames: (video.frames || []).map((path: string) => 
        path.startsWith('http') ? path : `${API_BASE_URL}${path}`
      ),
    };
  }

  return result;
}

/**
 * 获取单个视频详细信息
 */
export async function getVideoById(videoId: string): Promise<AnalyzedVideo> {
  if (!API_BASE_URL) throw new Error('VITE_API_URL is not configured');
  const response = await fetch(`${API_BASE_URL}/api/videos/${videoId}`);

  if (!response.ok) {
    throw new Error('Failed to fetch video');
  }

  const video = await response.json();

  // 将服务器路径转换为完整URL
  return {
    id: video.id,
    name: video.name,
    file_path: video.file_path || video.name, // 使用 file_path,降级到 name
    analysis: video.analysis,
    frames: (video.frames || []).map((path: string) => 
      path.startsWith('http') ? path : `${API_BASE_URL}${path}`
    ),
  };
}
/**
 * 搜索视频
 */
export async function searchVideos(query: string): Promise<Record<string, AnalyzedVideo>> {
  if (!API_BASE_URL) throw new Error('VITE_API_URL is not configured');
  const response = await fetch(
    `${API_BASE_URL}/api/videos?search=${encodeURIComponent(query)}`
  );

  if (!response.ok) {
    throw new Error('Failed to search videos');
  }

  const videos: any[] = await response.json();
  
  const result: Record<string, AnalyzedVideo> = {};
  for (const video of videos) {
    result[video.id] = {
      id: video.id,
      name: video.name,
      file_path: video.file_path || video.name, // 使用 file_path,降级到 name
      analysis: video.analysis,
      frames: [],
    };
  }

  return result;
}

/**
 * 删除视频
 */
export async function deleteVideo(videoId: string): Promise<void> {
  if (!API_BASE_URL) throw new Error('VITE_API_URL is not configured');
  const response = await fetch(`${API_BASE_URL}/api/videos/${videoId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete video');
  }
}

/**
 * 获取视频文件URL
 */
export function getVideoFileUrl(videoId: string, fileName: string): string {
  if (!API_BASE_URL) throw new Error('VITE_API_URL is not configured');
  // 对文件名进行 URL 编码，避免中文字符导致 404
  const encodedFileName = encodeURIComponent(fileName);
  return `${API_BASE_URL}/videos/${videoId}/${encodedFileName}`;
}

/**
 * 获取帧图片URL
 */
export function getFrameUrl(videoId: string, frameName: string): string {
  if (!API_BASE_URL) throw new Error('VITE_API_URL is not configured');
  return `${API_BASE_URL}/frames/${videoId}/${frameName}`;
}

/**
 * 获取所有视频的详细数据(用于聊天上下文)
 */
export async function getAllVideosForContext(): Promise<any[]> {
  if (!API_BASE_URL) throw new Error('VITE_API_URL is not configured');
  const response = await fetch(`${API_BASE_URL}/api/videos/context`);

  if (!response.ok) {
    throw new Error('Failed to fetch video context data');
  }

  return response.json();
}

/**
 * 搜索视频(用于聊天上下文)
 */
export async function searchVideosForContext(query: string): Promise<any[]> {
  if (!API_BASE_URL) throw new Error('VITE_API_URL is not configured');
  const response = await fetch(
    `${API_BASE_URL}/api/videos/context?search=${encodeURIComponent(query)}`
  );

  if (!response.ok) {
    throw new Error('Failed to search video context');
  }

  return response.json();
}

export const backendService = {
  calculateFileHash,
  checkFileHash,
  uploadVideo,
  saveAnalysis,
  getAllVideos,
  getVideoById,
  searchVideos,
  deleteVideo,
  getVideoFileUrl,
  getFrameUrl,
  getAllVideosForContext,
  searchVideosForContext,
};
