
/**
 * 视频上下文服务
 * 负责获取视频元数据并格式化为可注入到聊天对话的上下文
 */

import { backendService } from './backendService';

export interface VideoContextItem {
  id: string;
  name: string;
  summary: string;
  keywords: string[];
  expandedKeywords: string[];
  frameCount: number;
  // 关键帧信息(精简版)
  keyFrames?: Array<{
    timestamp: number;
    description: string;
  }>;
}

interface VideoContextOptions {
  maxVideos?: number;        // 最多包含多少个视频
  maxTokensPerVideo?: number; // 每个视频最多使用多少token(粗略估算)
  language?: 'en' | 'cn';    // 使用哪种语言
  includeFrameDetails?: boolean; // 是否包含帧详细信息
}

/**
 * 粗略估算文本的 token 数量
 * 英文约4字符=1token,中文约1.5字符=1token
 */
function estimateTokens(text: string, language: 'en' | 'cn' = 'en'): number {
  const charsPerToken = language === 'cn' ? 1.5 : 4;
  return Math.ceil(text.length / charsPerToken);
}

/**
 * 格式化单个视频为上下文字符串
 */
function formatVideoContext(video: any, options: VideoContextOptions): VideoContextItem {
  const lang = options.language || 'cn';
  
  // 提取基本信息
  const summary = video[`overall_summary_${lang}`] || '';
  
  // 提取所有关键词(去重)
  const frames = video.frames || [];
  const allKeywords = new Set<string>();
  const allExpandedKeywords = new Set<string>();
  
  frames.forEach((frame: any) => {
    try {
      // 安全解析JSON，确保值是有效的JSON字符串
      const keywordsStr = frame[`keywords_${lang}`];
      const expandedKeywordsStr = frame[`expanded_keywords_${lang}`];
      
      // 检查并解析keywords
      if (keywordsStr && keywordsStr.trim() !== '' && keywordsStr !== 'null') {
        try {
          const keywords = JSON.parse(keywordsStr);
          if (Array.isArray(keywords)) {
            keywords.forEach((k: string) => k && allKeywords.add(k));
          }
        } catch (e) {
          // 静默失败，不中断整体流程
        }
      }
      
      // 检查并解析expandedKeywords
      if (expandedKeywordsStr && expandedKeywordsStr.trim() !== '' && expandedKeywordsStr !== 'null') {
        try {
          const expandedKeywords = JSON.parse(expandedKeywordsStr);
          if (Array.isArray(expandedKeywords)) {
            expandedKeywords.forEach((k: string) => k && allExpandedKeywords.add(k));
          }
        } catch (e) {
          // 静默失败，不中断整体流程
        }
      }
    } catch (e) {
      // 外层异常捕获，防止意外情况
    }
  });
  
  // 提取关键帧信息(选择性包含)
  const keyFrames = options.includeFrameDetails
    ? frames.slice(0, 3).map((frame: any) => ({
        timestamp: frame.timestamp,
        description: frame[`action_description_${lang}`] || ''
      }))
    : undefined;
  
  return {
    id: video.id,
    name: video.name,
    summary,
    keywords: Array.from(allKeywords).slice(0, 8), // 减少到 8 个关键词
    expandedKeywords: Array.from(allExpandedKeywords).slice(0, 12), // 减少到 12 个扩展关键词
    frameCount: frames.length,
    keyFrames
  };
}

/**
 * 将视频上下文项转换为字符串
 */
function videoContextToString(item: VideoContextItem, options: VideoContextOptions): string {
  const lang = options.language || 'cn';
  const parts: string[] = [];
  
  if (lang === 'cn') {
    parts.push(`视频ID: ${item.id}`);
    parts.push(`名称: ${item.name}`);
    parts.push(`概述: ${item.summary}`);
    parts.push(`关键词: ${item.keywords.join('、')}`);
    
    if (item.keyFrames && item.keyFrames.length > 0) {
      parts.push(`关键画面:`);
      item.keyFrames.forEach(frame => {
        parts.push(`  ${frame.timestamp.toFixed(1)}s: ${frame.description}`);
      });
    }
  } else {
    parts.push(`Video ID: ${item.id}`);
    parts.push(`Name: ${item.name}`);
    parts.push(`Summary: ${item.summary}`);
    parts.push(`Keywords: ${item.keywords.join(', ')}`);
    
    if (item.keyFrames && item.keyFrames.length > 0) {
      parts.push(`Key Frames:`);
      item.keyFrames.forEach(frame => {
        parts.push(`  ${frame.timestamp.toFixed(1)}s: ${frame.description}`);
      });
    }
  }
  
  return parts.join('\n');
}

/**
 * 获取所有视频的格式化上下文
 */
export async function getVideoContext(options: VideoContextOptions = {}): Promise<string> {
  const {
    maxVideos = 10,
    maxTokensPerVideo = 200,
    language = 'cn',
    includeFrameDetails = false
  } = options;
  
  try {
    // 从后端获取所有视频数据
    const videos = await backendService.getAllVideosForContext();
    
    console.log(`[VideoContext] 总共从数据库获取 ${videos.length} 个视频`);
    console.log(`[VideoContext] 配置: maxVideos=${maxVideos}, maxTokensPerVideo=${maxTokensPerVideo}`);
    
    if (!videos || videos.length === 0) {
      return language === 'cn' 
        ? '当前没有可用的视频数据。' 
        : 'No video data available.';
    }
    
    // 格式化每个视频
    const formattedVideos: VideoContextItem[] = [];
    let totalTokens = 0;
    
    for (const video of videos.slice(0, maxVideos)) {
      const contextItem = formatVideoContext(video, { language, includeFrameDetails });
      const contextString = videoContextToString(contextItem, { language, includeFrameDetails });
      const tokens = estimateTokens(contextString, language);
      
      // 检查是否超出单个视频的token限制
      if (tokens > maxTokensPerVideo) {
        // 如果包含了帧详情,尝试移除它们
        if (includeFrameDetails) {
          contextItem.keyFrames = undefined;
          const newContextString = videoContextToString(contextItem, { language, includeFrameDetails: false });
          const newTokens = estimateTokens(newContextString, language);
          
          if (newTokens <= maxTokensPerVideo) {
            formattedVideos.push(contextItem);
            totalTokens += newTokens;
            continue;
          }
        }
        
        // 进一步精简:减少关键词
        contextItem.keywords = contextItem.keywords.slice(0, 4);
        contextItem.expandedKeywords = []; // 完全移除扩展关键词
        
        // 如果概述也过长,截断它
        if (contextItem.summary.length > 100) {
          contextItem.summary = contextItem.summary.substring(0, 97) + '...';
        }
      }
      
      formattedVideos.push(contextItem);
      totalTokens += tokens;
    }
    
    // 构建最终的上下文字符串
    console.log(`[VideoContext] 最终格式化 ${formattedVideos.length} 个视频, 估计总 tokens: ${totalTokens}`);
    
    const header = language === 'cn'
      ? `# 视频库信息\n数据库中共有 ${videos.length} 个视频,当前显示 ${formattedVideos.length} 个:\n`
      : `# Video Library\n${videos.length} total videos in database, showing ${formattedVideos.length}:\n`;
    
    const videoStrings = formattedVideos.map((item, index) => {
      const videoStr = videoContextToString(item, { language, includeFrameDetails });
      return `\n## ${language === 'cn' ? '视频' : 'Video'} ${index + 1}\n${videoStr}`;
    });
    
    const footer = language === 'cn'
      ? `\n\n当用户询问视频内容时,请引用对应的视频ID,例如:"根据视频 ${formattedVideos[0]?.id} ..."。用户可以通过视频ID直接观看视频。`
      : `\n\nWhen answering about video content, reference the video ID, e.g., "According to video ${formattedVideos[0]?.id}...". Users can watch videos directly using the video ID.`;
    
    return header + videoStrings.join('\n---\n') + footer;
  } catch (error) {
    console.error('[VideoContext] Failed to get video context:', error);
    return language === 'cn'
      ? '无法加载视频数据。'
      : 'Failed to load video data.';
  }
}

/**
 * 搜索相关视频
 */
export async function searchVideoContext(query: string, options: VideoContextOptions = {}): Promise<string> {
  const {
    maxVideos = 5,
    maxTokensPerVideo = 200,
    language = 'cn',
    includeFrameDetails = true
  } = options;
  
  try {
    // 使用后端搜索功能
    const videos = await backendService.searchVideosForContext(query);
    
    if (!videos || videos.length === 0) {
      return language === 'cn'
        ? `没有找到与 "${query}" 相关的视频。`
        : `No videos found related to "${query}".`;
    }
    
    // 格式化搜索结果
    const formattedVideos = videos
      .slice(0, maxVideos)
      .map(video => formatVideoContext(video, { language, includeFrameDetails }));
    
    const header = language === 'cn'
      ? `# 搜索结果: "${query}"\n找到 ${formattedVideos.length} 个相关视频:\n`
      : `# Search Results: "${query}"\nFound ${formattedVideos.length} related videos:\n`;
    
    const videoStrings = formattedVideos.map((item, index) => {
      const videoStr = videoContextToString(item, { language, includeFrameDetails });
      return `\n## ${language === 'cn' ? '视频' : 'Video'} ${index + 1}\n${videoStr}`;
    });
    
    return header + videoStrings.join('\n---\n');
  } catch (error) {
    console.error('[VideoContext] Failed to search video context:', error);
    return language === 'cn'
      ? '搜索视频时出错。'
      : 'Failed to search videos.';
  }
}
