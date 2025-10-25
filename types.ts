
export type ApiProvider = 'gemini' | 'openai';

export interface ApiSettings {
  analysisPreset: string;
  gemini: {
    apiKey: string; // Comma-separated
  };
  openai: {
    apiKey: string; // Comma-separated
    baseUrl: string;
    model?: string; // Optional: custom model name
  };
}

export interface Message {
  role: 'user' | 'model';
  content: string;
}

export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export interface LocalizedString {
  en: string;
  cn: string;
}

export interface LocalizedStringArray {
  en: string[];
  cn: string[];
}

export interface FrameAnalysis {
  timestamp: number;
  subtitleText?: string; // 关键帧对应的字幕文本
  personDescription: LocalizedString;
  clothingDescription: LocalizedString;
  actionDescription: LocalizedString;
  inferredBehavior: LocalizedString;
  keywords: LocalizedStringArray;
  expandedKeywords: LocalizedStringArray;
}

export interface VideoAnalysisResult {
  videoTitle?: string; // 可选:自动生成的视频标题
  overallSummary: LocalizedString;
  frameAnalyses: FrameAnalysis[];
}

export interface SubtitleCue {
  start: number;  // 开始时间（秒）
  end: number;    // 结束时间（秒）
  text: string;   // 字幕文本
}

export interface SubtitleTrack {
  id: number;
  videoId: string;
  language: string;
  format: 'srt' | 'vtt';
  duration: number;
  segmentCount: number;
  createdAt: string;
}

export interface SubtitleTranscription {
  text: string;
  duration: number;
  language: string;
  segments: {
    id: number;
    start: number;
    end: number;
    text: string;
  }[];
}

export interface SubtitleResult {
  success: boolean;
  videoId: string;
  language: string;
  duration: number;
  segmentCount: number;
  srt: string;
  vtt: string;
  transcription: SubtitleTranscription;
}

export interface AnalyzedVideo {
  id: string;
  name: string;
  file_path?: string; // 实际视频文件路径(用于播放)
  analysis: VideoAnalysisResult;
  frames: string[]; // dataURLs of keyframes
  file?: File; // The original video file, for in-memory use
  subtitles?: SubtitleTrack[]; // 字幕轨道
  hasSubtitles?: boolean; // 是否已生成字幕
  createdAt?: string; // 创建时间 ISO 格式
  updatedAt?: string; // 更新时间 ISO 格式
}
