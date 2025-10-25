import type { AnalyzedVideo, VideoAnalysisResult } from '../types';
import * as backendService from './backendService';
import * as storageService from './storageService';
import { logger, LogCategory } from '../utils/logger';

/**
 * 混合存储服务
 * 优先使用后端服务器，失败时降级到浏览器本地存储
 */

// 检查后端是否可用
let backendAvailable = true;
let lastCheckTime = 0;
const CHECK_INTERVAL = 30000; // 30秒检查一次

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL as string;

async function isBackendAvailable(): Promise<boolean> {
  const now = Date.now();
  
  // 如果最近检查过，直接返回缓存结果
  if (now - lastCheckTime < CHECK_INTERVAL) {
    return backendAvailable;
  }

  try {
    if (!API_BASE_URL) throw new Error('VITE_API_URL is not configured');
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      method: 'GET'
    });
    backendAvailable = response.ok;
    lastCheckTime = now;
    logger.info(`Backend availability: ${backendAvailable}`, undefined, LogCategory.STORAGE);
  } catch (error) {
    backendAvailable = false;
    lastCheckTime = now;
    logger.warn('Backend unavailable, falling back to local storage', undefined, LogCategory.STORAGE);
  }

  return backendAvailable;
}

/**
 * 上传视频并提取帧（支持秒传）
 */
export async function uploadAndExtractFrames(file: File): Promise<{
  videoId: string;
  videoName: string;
  framesData: { timestamp: number; base64Data: string }[];
  useBackend: boolean;
  isInstantUpload?: boolean;
}> {
  const available = await isBackendAvailable();

  if (available) {
    try {
      // 第1步: 计算文件哈希
      logger.info('📦 [Instant Upload] Step 1: Calculating file hash...', undefined, LogCategory.STORAGE);
      const startHashTime = Date.now();
      const fileHash = await backendService.calculateFileHash(file);
      const hashTime = Date.now() - startHashTime;
      logger.success(`✅ [Instant Upload] Hash calculated in ${hashTime}ms: ${fileHash.substring(0, 16)}...`, undefined, LogCategory.STORAGE);
      
      // 第2步: 检查文件是否已存在
      logger.info('🔍 [Instant Upload] Step 2: Checking if file exists...', undefined, LogCategory.STORAGE);
      const checkResult = await backendService.checkFileHash(fileHash, file.name, file.size);
      
      if (checkResult.exists) {
        // 秒传成功！
        logger.success(`⚡ [Instant Upload] File already exists! Instant upload completed!`, undefined, LogCategory.STORAGE);
        logger.info(`🎬 Video ID: ${checkResult.videoId}`, undefined, LogCategory.STORAGE);
        logger.info(`📹 Video Name: ${checkResult.videoName}`, undefined, LogCategory.STORAGE);
        logger.info(`🖼️ Frame Count: ${checkResult.frameCount}`, undefined, LogCategory.STORAGE);
        logger.success(`⏱️ Total time: ${Date.now() - startHashTime}ms (vs normal upload: minutes)`, undefined, LogCategory.STORAGE);
        
        // 获取已存在视频的帧数据
        const existingVideo = await backendService.getVideoById(checkResult.videoId!);
        
        return {
          videoId: checkResult.videoId!,
          videoName: checkResult.videoName!,
          framesData: [], // 帧数据已存在，不需返回
          useBackend: true,
          isInstantUpload: true
        };
      } else {
        // 文件不存在，需要上传
        logger.info('📤 [Instant Upload] File not found, proceeding with normal upload...', undefined, LogCategory.STORAGE);
        logger.info('Uploading to backend...', undefined, LogCategory.STORAGE);
        const result = await backendService.uploadVideo(file);
        logger.success('Backend upload successful', undefined, LogCategory.STORAGE);
        return { ...result, useBackend: true, isInstantUpload: false };
      }
    } catch (error) {
      logger.warn('Backend upload failed, will process locally', error, LogCategory.STORAGE);
      backendAvailable = false;
    }
  }

  // 降级到本地处理 - 返回空数据，让前端自己处理
  logger.info('Using local processing', undefined, LogCategory.STORAGE);
  const videoId = crypto.randomUUID(); // 使用标准UUID格式
  return {
    videoId,
    videoName: file.name,
    framesData: [], // 前端会自己提取帧
    useBackend: false
  };
}

/**
 * 保存视频分析结果
 * 如果提供了videoFile，会上传到后端；如果只提供了videoId，则直接使用该ID保存
 * @param videoId 视频ID（如果已上传过，使用已有ID）
 * @param videoFile 视频文件（可选，如果为undefined则表示已上传）
 * @returns 实际使用的videoId
 */
export async function saveAnalysis(
  videoId: string,
  videoName: string,
  analysis: VideoAnalysisResult,
  frames: string[],
  videoFile?: File,
  fileHash?: string,
  fileSize?: number
): Promise<string> {
  const available = await isBackendAvailable();

  // 情况1：有视频文件且后端可用 - 需要上传
  if (videoFile && available) {
    try {
      logger.info('Uploading video and saving analysis to backend...', undefined, LogCategory.STORAGE);
      
      // 1. 上传视频文件
      const uploadResult = await backendService.uploadVideo(videoFile);
      logger.info(`Video uploaded, backend videoId: ${uploadResult.videoId}`, undefined, LogCategory.STORAGE);
      
      // 2. 保存分析结果（使用后端返回的videoId）
      await backendService.saveAnalysis(uploadResult.videoId, videoName, analysis, frames, uploadResult.fileHash, uploadResult.fileSize);
      logger.success('Analysis saved to backend successfully', undefined, LogCategory.STORAGE);
      
      // 3. 同时保存到本地作为备份
      const now = new Date().toISOString();
      const analyzedVideo: Omit<AnalyzedVideo, 'file'> = {
        id: uploadResult.videoId,
        name: videoName,
        analysis,
        frames,
        createdAt: now,
        updatedAt: now
      };
      await storageService.saveAnalysis(uploadResult.videoId, analyzedVideo);
      await storageService.saveVideoFile(uploadResult.videoId, videoFile);
      
      return uploadResult.videoId;
    } catch (error) {
      logger.warn('Backend upload/save failed, falling back to local', error, LogCategory.STORAGE);
      backendAvailable = false;
      // 继续执行本地保存逻辑
    }
  }
  
  // 情况2：视频已经上传过（videoFile 为 undefined）且后端可用 - 直接保存分析
  if (!videoFile && available) {
    try {
      logger.info(`Saving analysis to backend using existing videoId: ${videoId}`, undefined, LogCategory.STORAGE);
      await backendService.saveAnalysis(videoId, videoName, analysis, frames, fileHash, fileSize);
      logger.success('Analysis saved to backend successfully', undefined, LogCategory.STORAGE);
      
      // 同时保存到本地
      const now = new Date().toISOString();
      const analyzedVideo: Omit<AnalyzedVideo, 'file'> = {
        id: videoId,
        name: videoName,
        analysis,
        frames,
        createdAt: now,
        updatedAt: now
      };
      await storageService.saveAnalysis(videoId, analyzedVideo);
      
      return videoId; // 使用传入的ID
    } catch (error) {
      logger.warn('Backend save failed, falling back to local', error, LogCategory.STORAGE);
      backendAvailable = false;
      // 继续执行本地保存逻辑
    }
  }

  // 保存到本地存储（无视频文件、后端不可用或后端保存失败）
  logger.info('Saving to local storage only', undefined, LogCategory.STORAGE);
  const now = new Date().toISOString();
  const analyzedVideo: Omit<AnalyzedVideo, 'file'> = {
    id: videoId,
    name: videoName,
    analysis,
    frames,
    createdAt: now,
    updatedAt: now
  };
  
  await storageService.saveAnalysis(videoId, analyzedVideo);
  if (videoFile) {
    await storageService.saveVideoFile(videoId, videoFile);
  }
  
  return videoId; // 返回本地ID
}

/**
 * 获取所有视频
 */
export async function getAllVideos(): Promise<Record<string, AnalyzedVideo>> {
  const available = await isBackendAvailable();

  if (available) {
    try {
      logger.info('Loading videos from backend...', undefined, LogCategory.STORAGE);
      const videos = await backendService.getAllVideos();
      logger.success(`Backend load successful, count: ${Object.keys(videos).length}`, undefined, LogCategory.STORAGE);
      return videos;
    } catch (error) {
      logger.warn('Backend load failed, falling back to local', error, LogCategory.STORAGE);
      backendAvailable = false;
    }
  }

  // 降级到本地存储
  logger.info('Loading from local storage', undefined, LogCategory.STORAGE);
  return await storageService.loadAllAnalyses();
}

/**
 * 获取单个视频详细信息
 */
export async function getVideoById(videoId: string): Promise<AnalyzedVideo | null> {
  const available = await isBackendAvailable();

  if (available) {
    try {
      logger.info(`Loading video from backend: ${videoId}`, undefined, LogCategory.STORAGE);
      const video = await backendService.getVideoById(videoId);
      logger.success(`Backend load successful, frames: ${video.frames?.length || 0}`, undefined, LogCategory.STORAGE);
      return video;
    } catch (error) {
      logger.warn('Backend load failed, trying local', error, LogCategory.STORAGE);
      backendAvailable = false;
    }
  }

  // 降级到本地存储
  logger.info('Loading from local storage', undefined, LogCategory.STORAGE);
  const allVideos = await storageService.loadAllAnalyses();
  const video = allVideos[videoId];
  
  // 如果本地存储没有frames，尝试从后端加载
  if (video && (!video.frames || video.frames.length === 0)) {
    // 不做额外处理，返回本地数据
  }
  
  return video || null;
}

/**
 * 搜索视频
 */
export async function searchVideos(query: string): Promise<Record<string, AnalyzedVideo>> {
  const available = await isBackendAvailable();

  if (available) {
    try {
      logger.info(`Searching videos on backend: ${query}`, undefined, LogCategory.STORAGE);
      const videos = await backendService.searchVideos(query);
      logger.success('Backend search successful', undefined, LogCategory.STORAGE);
      return videos;
    } catch (error) {
      logger.warn('Backend search failed, falling back to local', error, LogCategory.STORAGE);
      backendAvailable = false;
    }
  }

  // 降级到本地搜索
  logger.info('Searching in local storage', undefined, LogCategory.STORAGE);
  const allVideos = await storageService.loadAllAnalyses();
  const results: Record<string, AnalyzedVideo> = {};
  const lowerQuery = query.toLowerCase();

  for (const [id, video] of Object.entries(allVideos)) {
    // 搜索视频名称和分析内容
    const searchText = [
      video.name,
      video.analysis?.overallSummary?.en || '',
      video.analysis?.overallSummary?.cn || '',
      ...(video.analysis?.frameAnalyses?.flatMap(f => [
        ...(f.keywords?.en || []),
        ...(f.keywords?.cn || []),
        ...(f.expandedKeywords?.en || []),
        ...(f.expandedKeywords?.cn || [])
      ]) || [])
    ].join(' ').toLowerCase();

    if (searchText.includes(lowerQuery)) {
      results[id] = video;
    }
  }

  return results;
}

/**
 * 删除视频
 */
export async function deleteVideo(videoId: string): Promise<void> {
  const available = await isBackendAvailable();

  // 尝试从后端删除
  if (available) {
    try {
      logger.info(`Deleting video from backend: ${videoId}`, undefined, LogCategory.STORAGE);
      await backendService.deleteVideo(videoId);
      logger.success('Backend delete successful', undefined, LogCategory.STORAGE);
    } catch (error) {
      logger.warn('Backend delete failed', error, LogCategory.STORAGE);
      backendAvailable = false;
    }
  }

  // 同时也从本地删除（双保险）
  logger.info('Deleting from local storage', undefined, LogCategory.STORAGE);
  await storageService.deleteVideo(videoId);
}

/**
 * 获取视频文件
 * @param videoId 视频ID
 * @param filePathOrName 实际文件路径或文件名(优先使用 video.file_path)
 */
export async function getVideoFile(videoId: string, filePathOrName: string): Promise<string | null> {
  logger.info(`getVideoFile: videoId=${videoId}, file=${filePathOrName}`, undefined, LogCategory.STORAGE);
  const available = await isBackendAvailable();

  if (available) {
    try {
      const url = backendService.getVideoFileUrl(videoId, filePathOrName);
      logger.info(`Constructed backend URL: ${url}`, undefined, LogCategory.STORAGE);
      // 验证URL是否可访问
      const response = await fetch(url, { method: 'HEAD' });
      logger.info(`HEAD request status: ${response.status}`, undefined, LogCategory.STORAGE);
      if (response.ok) {
        logger.success('Video file available on backend', undefined, LogCategory.STORAGE);
        return url;
      } else {
        logger.warn(`HEAD request failed with status ${response.status}`, undefined, LogCategory.STORAGE);
      }
    } catch (error) {
      logger.error('Backend video file not accessible', error, LogCategory.STORAGE);
    }
  }

  // 降级到本地文件
  logger.info('Loading video file from local storage', undefined, LogCategory.STORAGE);
  const file = await storageService.loadVideoFile(videoId);
  if (file) {
    logger.success('Local file found, creating object URL', undefined, LogCategory.STORAGE);
    return URL.createObjectURL(file);
  }

  logger.error('Video file not found in backend or local storage', undefined, LogCategory.STORAGE);
  return null;
}

/**
 * 导出所有分析数据
 */
export async function exportAllAnalyses(): Promise<Blob> {
  // 导出功能仅使用本地存储
  return await storageService.exportAllAnalyses();
}

/**
 * 导入分析数据
 */
export async function importAnalyses(file: File): Promise<number> {
  // 导入功能仅使用本地存储
  return await storageService.importAnalyses(file);
}

/**
 * 清除所有数据
 */
export async function clearAllData(): Promise<void> {
  const available = await isBackendAvailable();

  // 如果后端可用，提示用户后端数据不会被清除
  if (available) {
    logger.warn('Note: Backend data will not be cleared', undefined, LogCategory.STORAGE);
  }

  // 清除本地数据
  await storageService.clearAllData();
}

/**
 * 手动设置后端可用性（用于测试）
 */
export function setBackendAvailability(available: boolean) {
  backendAvailable = available;
  lastCheckTime = Date.now();
}

/**
 * 获取当前后端状态
 */
export function getBackendStatus(): boolean {
  return backendAvailable;
}
