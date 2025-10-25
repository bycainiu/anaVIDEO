import { SubtitleResult, SubtitleTrack, SubtitleCue } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3004';

/**
 * 上传视频并生成中文字幕
 * @param videoFile 视频文件
 * @param videoId 视频ID（可选，用于已存在的视频）
 */
export async function transcribeVideo(
  videoFile: File,
  videoId?: string
): Promise<SubtitleResult> {
  const formData = new FormData();
  formData.append('video', videoFile);
  if (videoId) {
    formData.append('videoId', videoId);
  }

  const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Transcription failed' }));
    throw new Error(error.error || 'Failed to transcribe video');
  }

  return response.json();
}

/**
 * 获取视频的所有字幕轨道
 * @param videoId 视频ID
 */
export async function getSubtitleTracks(videoId: string): Promise<SubtitleTrack[]> {
  const response = await fetch(`${API_BASE_URL}/api/subtitles/${videoId}`);

  if (!response.ok) {
    throw new Error('Failed to fetch subtitle tracks');
  }

  const data = await response.json();
  return data.subtitles || [];
}

/**
 * 获取特定格式的字幕内容
 * @param videoId 视频ID
 * @param language 语言代码
 * @param format 字幕格式 ('srt' 或 'vtt')
 */
export async function getSubtitleContent(
  videoId: string,
  language: string,
  format: 'srt' | 'vtt'
): Promise<string> {
  const response = await fetch(
    `${API_BASE_URL}/api/subtitles/${videoId}/${language}/${format}`
  );

  if (!response.ok) {
    throw new Error('Failed to fetch subtitle content');
  }

  return response.text();
}

/**
 * 根据时间戳查询相关中文字幕
 * @param videoId 视频ID
 * @param timestamp 时间戳（秒）
 * @param contextWindow 上下文窗口（秒）
 */
export async function querySubtitlesAtTimestamp(
  videoId: string,
  timestamp: number,
  contextWindow: number = 5
): Promise<SubtitleCue[]> {
  const response = await fetch(`${API_BASE_URL}/api/subtitles/${videoId}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timestamp,
      contextWindow,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to query subtitles');
  }

  const data = await response.json();
  return data.subtitles || [];
}

/**
 * 将VTT字幕内容转换为Blob URL（用于video.js）
 * @param vttContent VTT格式字幕内容
 */
export function createSubtitleBlobUrl(vttContent: string): string {
  const blob = new Blob([vttContent], { type: 'text/vtt' });
  return URL.createObjectURL(blob);
}

/**
 * 解析SRT格式字幕为结构化数据
 * @param srtContent SRT格式字幕内容
 */
export function parseSRT(srtContent: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = srtContent.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;

    const timeLine = lines[1];
    const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
    
    if (timeMatch) {
      const start = 
        parseInt(timeMatch[1]) * 3600 +
        parseInt(timeMatch[2]) * 60 +
        parseInt(timeMatch[3]) +
        parseInt(timeMatch[4]) / 1000;

      const end =
        parseInt(timeMatch[5]) * 3600 +
        parseInt(timeMatch[6]) * 60 +
        parseInt(timeMatch[7]) +
        parseInt(timeMatch[8]) / 1000;

      const text = lines.slice(2).join('\n');

      cues.push({ start, end, text });
    }
  }

  return cues;
}

/**
 * 解析VTT格式字幕为结构化数据
 * @param vttContent VTT格式字幕内容
 */
export function parseVTT(vttContent: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const lines = vttContent.split('\n');
  
  let i = 0;
  // 跳过 WEBVTT 头部
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i];
    
    if (line.includes('-->')) {
      const timeMatch = line.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
      
      if (timeMatch) {
        const start =
          parseInt(timeMatch[1]) * 3600 +
          parseInt(timeMatch[2]) * 60 +
          parseInt(timeMatch[3]) +
          parseInt(timeMatch[4]) / 1000;

        const end =
          parseInt(timeMatch[5]) * 3600 +
          parseInt(timeMatch[6]) * 60 +
          parseInt(timeMatch[7]) +
          parseInt(timeMatch[8]) / 1000;

        i++;
        const textLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== '') {
          textLines.push(lines[i]);
          i++;
        }

        cues.push({ start, end, text: textLines.join('\n') });
      }
    }
    i++;
  }

  return cues;
}

/**
 * 格式化时间为可读字符串
 * @param seconds 秒数
 */
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
