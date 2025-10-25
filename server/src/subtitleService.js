import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { transcribeWithZhRecogn, checkZhRecognAvailable } from './zhRecognBridge.js';
import sseManager from './sseManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置 ffmpeg 路径
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// zh_recogn 服务配置
const ZH_RECOGN_URL = process.env.ZH_RECOGN_URL || 'http://127.0.0.1:9933';

/**
 * 从视频文件中提取音频（为zh_recogn准备WAV格式）
 * @param {string} videoPath - 视频文件路径
 * @param {string} outputPath - 输出音频文件路径
 * @returns {Promise<string>} 音频文件路径
 */
export function extractAudio(videoPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('pcm_s16le')  // WAV格式,zh_recogn兼容
      .audioChannels(1)
      .audioFrequency(16000)
      .format('wav')
      .on('end', () => {
        console.log(`[Subtitle] Audio extracted: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`[Subtitle] Audio extraction failed:`, err);
        reject(err);
      })
      .save(outputPath);
  });
}

/**
 * 使用 zh_recogn 模型转录音频（中文语音识别）
 * @param {string} audioPath - 音频文件路径
 * @returns {Promise<Object>} 转录结果，包含分段时间戳
 */
export async function transcribeAudio(audioPath) {
  try {
    console.log(`[Subtitle] Transcribing audio with zh_recogn: ${audioPath}`);
    
    // 检查文件是否存在
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    // 调用 zh_recogn 服务
    const result = await transcribeWithZhRecogn(audioPath, ZH_RECOGN_URL);
    
    if (!result.success) {
      throw new Error(result.error || 'Transcription failed');
    }

    console.log(`[Subtitle] Transcription completed with ${result.segmentCount} segments`);
    return result.transcription;
  } catch (error) {
    console.error(`[Subtitle] Transcription failed:`, error);
    throw error;
  }
}

/**
 * 将转录结果转换为 SRT 格式
 * @param {Object} transcription - Whisper API 返回的转录结果
 * @returns {string} SRT 格式字幕
 */
export function convertToSRT(transcription) {
  if (!transcription.segments || transcription.segments.length === 0) {
    return '';
  }

  let srt = '';
  transcription.segments.forEach((segment, index) => {
    const startTime = formatSRTTime(segment.start);
    const endTime = formatSRTTime(segment.end);
    const text = segment.text.trim();

    srt += `${index + 1}\n`;
    srt += `${startTime} --> ${endTime}\n`;
    srt += `${text}\n\n`;
  });

  return srt.trim();
}

/**
 * 将转录结果转换为 VTT 格式
 * @param {Object} transcription - Whisper API 返回的转录结果
 * @returns {string} VTT 格式字幕
 */
export function convertToVTT(transcription) {
  if (!transcription.segments || transcription.segments.length === 0) {
    return 'WEBVTT\n\n';
  }

  let vtt = 'WEBVTT\n\n';
  transcription.segments.forEach((segment) => {
    const startTime = formatVTTTime(segment.start);
    const endTime = formatVTTTime(segment.end);
    const text = segment.text.trim();

    vtt += `${startTime} --> ${endTime}\n`;
    vtt += `${text}\n\n`;
  });

  return vtt.trim();
}

/**
 * 将秒数转换为 SRT 时间格式 (HH:MM:SS,mmm)
 * @param {number} seconds - 秒数
 * @returns {string} SRT 时间格式
 */
function formatSRTTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

/**
 * 将秒数转换为 VTT 时间格式 (HH:MM:SS.mmm)
 * @param {number} seconds - 秒数
 * @returns {string} VTT 时间格式
 */
function formatVTTTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/**
 * 根据时间戳查询相关字幕文本
 * @param {Object} transcription - 转录结果
 * @param {number} timestamp - 时间戳（秒）
 * @param {number} contextWindow - 上下文窗口（秒），默认 5 秒
 * @returns {Array<Object>} 相关字幕段落
 */
export function getSubtitlesAtTimestamp(transcription, timestamp, contextWindow = 5) {
  if (!transcription.segments) {
    return [];
  }

  const startTime = Math.max(0, timestamp - contextWindow);
  const endTime = timestamp + contextWindow;

  return transcription.segments.filter(segment => {
    return (segment.start >= startTime && segment.start <= endTime) ||
           (segment.end >= startTime && segment.end <= endTime) ||
           (segment.start <= startTime && segment.end >= endTime);
  }).map(segment => ({
    start: segment.start,
    end: segment.end,
    text: segment.text.trim()
  }));
}

/**
 * 完整的转录流程：提取音频 -> 转录 -> 生成字幕（仅中文）
 * @param {string} videoPath - 视频文件路径
 * @param {string} videoId - 视频 ID
 * @returns {Promise<Object>} 包含 SRT、VTT 和原始转录数据
 */
export async function processVideoSubtitles(videoPath, videoId) {
  const startTime = Date.now();
  const tempDir = path.join(__dirname, '../storage/temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const audioPath = path.join(tempDir, `${videoId}_audio.wav`);  // 改为wav格式
  
  console.log(`[Subtitle] Starting subtitle generation for video ${videoId}`);
  console.log(`[Subtitle] Audio will be saved to: ${audioPath}`);
  
  // 推送开始状态
  sseManager.notifyProgress(videoId, '开始处理...', 0);

  try {
    // 1. 提取音频
    console.log(`[Subtitle] Extracting audio from video...`);
    sseManager.notifyProgress(videoId, '正在提取音频...', 10);
    await extractAudio(videoPath, audioPath);
    
    // 验证音频文件是否生成
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio extraction failed - file not found: ${audioPath}`);
    }
    
    const audioStats = fs.statSync(audioPath);
    console.log(`[Subtitle] Audio extracted successfully, size: ${(audioStats.size / 1024 / 1024).toFixed(2)} MB`);
    sseManager.notifyProgress(videoId, `音频提取完成 (${(audioStats.size / 1024 / 1024).toFixed(2)} MB)`, 30);

    // 2. 转录音频（仅中文）
    console.log(`[Subtitle] Starting transcription...`);
    sseManager.notifyProgress(videoId, '正在识别中文语音... (预计需要几分钟)', 40);
    
    const transcription = await transcribeAudio(audioPath);
    
    console.log(`[Subtitle] Transcription completed`);
    sseManager.notifyProgress(videoId, `语音识别完成, 共 ${transcription.segments?.length || 0} 个字幕段`, 80);

    // 3. 生成字幕文件
    sseManager.notifyProgress(videoId, '生成字幕文件...', 90);
    const srt = convertToSRT(transcription);
    const vtt = convertToVTT(transcription);

    // 4. 立即清理临时音频文件
    console.log(`[Subtitle] Cleaning up temporary audio file...`);
    sseManager.notifyProgress(videoId, '清理临时文件...', 95);
    try {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
        console.log(`[Subtitle] ✅ Temporary audio file deleted: ${audioPath}`);
      }
    } catch (cleanupError) {
      console.error(`[Subtitle] ⚠️  Failed to delete temporary audio file: ${cleanupError.message}`);
      console.error(`[Subtitle] You may need to manually delete: ${audioPath}`);
      // 不抛出异常，继续返回结果
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Subtitle] ✅ Total processing time: ${elapsed}s`);
    sseManager.notifyProgress(videoId, `字幕生成完成! (耗时 ${elapsed}s)`, 100);

    return {
      transcription,
      srt,
      vtt,
      language: 'zh',  // 固定中文
      duration: transcription.duration || 0,
      segmentCount: transcription.segments?.length || 0,
      processingTime: parseFloat(elapsed)
    };
  } catch (error) {
    console.error(`[Subtitle] Error during subtitle generation: ${error.message}`);
    
    // 尝试清理临时文件
    try {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
        console.log(`[Subtitle] ✅ Cleaned up temporary audio file after error`);
      }
    } catch (cleanupError) {
      console.error(`[Subtitle] ⚠️  Failed to cleanup after error: ${cleanupError.message}`);
      console.error(`[Subtitle] Manual cleanup may be needed: ${audioPath}`);
    }
    
    throw error;
  }
}
