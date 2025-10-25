import { extractFrames, imageToBase64, getVideoDuration } from './videoProcessor.js';
import { processVideoSubtitles, getSubtitlesAtTimestamp } from './subtitleService.js';
import { dbOperations } from './db.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { readFile } from 'fs/promises';

/**
 * B站视频自动分析服务
 * 处理下载完成的B站视频：字幕生成 + AI视频分析
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// 从styleCorpus.md加载风格指南
async function getStyleCorpusPrompt() {
  try {
    const corpusPath = join(process.cwd(), 'styleCorpus.md');
    if (existsSync(corpusPath)) {
      const content = await readFile(corpusPath, 'utf-8');
      return content;
    }
  } catch (error) {
    console.warn('[Analysis] Could not load styleCorpus.md:', error.message);
  }
  return ''; // 返回空字符串作为fallback
}

// 系统提示词（与前端一致）
function getVideoAnalysisSystemPrompt(styleGuide) {
  return `You are a professional video content analyst specializing in detailed frame-by-frame analysis.

${styleGuide ? `Style Guide:\n${styleGuide}\n\n` : ''}

CRITICAL: You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations outside the JSON structure.

Your response must be a valid JSON object with this exact structure:
{
  "overallSummary": {
    "en": "Overall summary in English",
    "cn": "Overall summary in Chinese"
  },
  "frameAnalyses": [
    {
      "timestamp": 0.5,
      "personDescription": {"en": "...", "cn": "..."},
      "clothingDescription": {"en": "...", "cn": "..."},
      "actionDescription": {"en": "...", "cn": "..."},
      "inferredBehavior": {"en": "...", "cn": "..."},
      "keywords": {"en": ["keyword1", "keyword2"], "cn": ["关键词1", "关键词2"]},
      "expandedKeywords": {"en": ["expanded1"], "cn": ["扩展1"]}
    }
  ]
}`;
}

// 用户提示词（与前端一致）
function getVideoAnalysisUserPrompt(frames, preset) {
  const presetInstructions = {
    'standard': 'Provide balanced analysis',
    'detailed': 'Provide extremely detailed descriptions',
    'concise': 'Keep descriptions brief and to the point'
  };
  
  const instruction = presetInstructions[preset] || presetInstructions['standard'];
  
  return `Analyze the following ${frames.length} video frames. ${instruction}.

${frames.map((f, i) => {
  let frameDesc = `Frame ${i + 1} at ${f.timestamp}s`;
  if (f.subtitleContext) {
    frameDesc += `\nSubtitle context: ${f.subtitleContext}`;
  }
  return frameDesc;
}).join('\n\n')}

Respond with ONLY a JSON object matching the specified structure. Include timestamp for each frame analysis.`;
}

// 调用OpenAI API进行视频分析
async function analyzeVideoWithOpenAI(frames, preset = 'standard') {
  const styleGuide = await getStyleCorpusPrompt();
  const systemPrompt = getVideoAnalysisSystemPrompt(styleGuide);
  const userPrompt = getVideoAnalysisUserPrompt(frames, preset);
  
  const messages = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        { type: "text", text: userPrompt },
        ...frames.map(frame => ({
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${frame.base64Data}`
          }
        }))
      ]
    }
  ];
  
  const body = {
    model: OPENAI_MODEL,
    messages,
    max_tokens: 16000,
    response_format: { type: "json_object" }
  };
  
  console.log(`[Analysis] Sending request to OpenAI with ${frames.length} frames`);
  
  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
  }
  
  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error('No content in OpenAI response');
  }
  
  // 解析JSON
  try {
    return JSON.parse(content);
  } catch (e) {
    // 尝试从markdown代码块中提取
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }
    throw new Error('Failed to parse OpenAI response as JSON');
  }
}

// 翻译服务（简化版）
async function translateTexts(texts, targetLang) {
  if (!texts || texts.length === 0) return {};
  
  const prompt = `Translate the following texts to ${targetLang === 'zh' ? 'Chinese' : 'English'}. Return ONLY a JSON array of translations, no explanation.

Texts to translate:
${texts.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Return format: ["translation1", "translation2", ...]`;
  
  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: 'You are a professional translator.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 4000
    })
  });
  
  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  
  try {
    const translations = JSON.parse(content);
    const result = {};
    texts.forEach((text, i) => {
      result[text] = translations[i] || text;
    });
    return result;
  } catch (e) {
    console.warn('[Translation] Failed to parse translations:', e);
    return {};
  }
}

// 应用翻译fallback
async function applyTranslationFallback(analysis) {
  const textsToTranslate = [];
  
  // 收集需要翻译的英文文本
  if (analysis.overallSummary?.en && !analysis.overallSummary?.cn) {
    textsToTranslate.push(analysis.overallSummary.en);
  }
  
  analysis.frameAnalyses?.forEach(frame => {
    ['personDescription', 'clothingDescription', 'actionDescription', 'inferredBehavior'].forEach(field => {
      if (frame[field]?.en && !frame[field]?.cn) {
        textsToTranslate.push(frame[field].en);
      }
    });
  });
  
  if (textsToTranslate.length > 0) {
    console.log(`[Analysis] Translating ${textsToTranslate.length} texts to Chinese...`);
    const translations = await translateTexts(textsToTranslate, 'zh');
    
    // 应用翻译
    if (analysis.overallSummary?.en && !analysis.overallSummary?.cn) {
      analysis.overallSummary.cn = translations[analysis.overallSummary.en] || analysis.overallSummary.en;
    }
    
    analysis.frameAnalyses?.forEach(frame => {
      ['personDescription', 'clothingDescription', 'actionDescription', 'inferredBehavior'].forEach(field => {
        if (frame[field]?.en && !frame[field]?.cn) {
          frame[field].cn = translations[frame[field].en] || frame[field].en;
        }
      });
    });
  }
  
  return analysis;
}

/**
 * 完整的B站视频分析流程
 * @param {string} videoPath - 视频文件路径
 * @param {string} videoId - 视频ID
 * @param {string} videoName - 视频名称
 * @param {string} bvid - B站BVID
 */
export async function analyzeBiliVideo(videoPath, videoId, videoName, bvid) {
  console.log(`\n========== B站视频自动分析开始 ==========`);
  console.log(`Video ID: ${videoId}`);
  console.log(`Video Name: ${videoName}`);
  console.log(`BVID: ${bvid}`);
  console.log(`Path: ${videoPath}`);
  
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }
  
  try {
    // 1. 提取视频帧
    console.log(`\n[Step 1/4] 提取视频帧...`);
    const FRAMES_DIR = join(process.cwd(), 'storage', 'frames', videoId);
    const framePaths = await extractFrames(videoPath, FRAMES_DIR, 0.5);
    console.log(`[Step 1/4] ✓ 提取了 ${framePaths.length} 帧`);
    
    // 2. 获取字幕上下文（如果有）
    console.log(`\n[Step 2/4] 获取字幕上下文...`);
    let subtitles = null;
    try {
      const subtitleRecord = dbOperations.getSubtitle(videoId, 'zh', 'srt');
      if (subtitleRecord && subtitleRecord.transcription_data) {
        subtitles = JSON.parse(subtitleRecord.transcription_data);
        console.log(`[Step 2/4] ✓ 找到字幕，共 ${subtitles.segments?.length || 0} 段`);
      }
    } catch (e) {
      console.log(`[Step 2/4] ⚠ 未找到字幕: ${e.message}`);
    }
    
    // 3. 准备帧数据
    console.log(`\n[Step 3/4] 准备帧数据...`);
    const framesData = [];
    for (let i = 0; i < framePaths.length; i++) {
      const base64Data = await imageToBase64(framePaths[i]);
      if (base64Data) {
        const frameData = {
          timestamp: i * 2, // 假设每2秒一帧
          base64Data
        };
        
        // 添加字幕上下文
        if (subtitles) {
          const contextSubs = getSubtitlesAtTimestamp(subtitles, frameData.timestamp, 3);
          if (contextSubs.length > 0) {
            frameData.subtitleContext = contextSubs.map(s => s.text).join(' ');
          }
        }
        
        framesData.push(frameData);
      }
    }
    console.log(`[Step 3/4] ✓ 准备了 ${framesData.length} 帧数据`);
    
    // 4. AI分析
    console.log(`\n[Step 4/4] 执行AI视频分析...`);
    let analysis = await analyzeVideoWithOpenAI(framesData, 'standard');
    console.log(`[Step 4/4] ✓ AI分析完成`);
    
    // 5. 翻译fallback
    console.log(`\n[Translation] 检查并补充缺失的翻译...`);
    analysis = await applyTranslationFallback(analysis);
    console.log(`[Translation] ✓ 翻译完成`);
    
    // 6. 保存到数据库
    console.log(`\n[Database] 保存分析结果到数据库...`);
    
    // 保存整体摘要
    dbOperations.saveVideoAnalysis(
      videoId,
      analysis.overallSummary?.en || '',
      analysis.overallSummary?.cn || ''
    );
    
    // 保存帧分析
    analysis.frameAnalyses?.forEach((frame, index) => {
      // 只保存文件名，不保存完整路径
      const fullPath = framePaths[index];
      const frameName = fullPath ? fullPath.split(/[\\/]/).pop() : `frame_${String(index + 1).padStart(4, '0')}.jpg`;
      
      dbOperations.saveFrameAnalysis(
        videoId,
        frame.timestamp || index * 2,
        frameName,  // 使用文件名而不是完整路径
        frame.personDescription?.en || '',
        frame.personDescription?.cn || '',
        frame.clothingDescription?.en || '',
        frame.clothingDescription?.cn || '',
        frame.actionDescription?.en || '',
        frame.actionDescription?.cn || '',
        frame.inferredBehavior?.en || '',
        frame.inferredBehavior?.cn || '',
        JSON.stringify(frame.keywords?.en || []),
        JSON.stringify(frame.keywords?.cn || []),
        JSON.stringify(frame.expandedKeywords?.en || []),
        JSON.stringify(frame.expandedKeywords?.cn || [])
      );
    });
    
    console.log(`[Database] ✓ 保存完成`);
    console.log(`\n========== B站视频自动分析完成 ==========\n`);
    
    return {
      success: true,
      videoId,
      frameCount: analysis.frameAnalyses?.length || 0
    };
    
  } catch (error) {
    console.error(`\n========== B站视频分析失败 ==========`);
    console.error(`Error: ${error.message}`);
    console.error(error.stack);
    console.error(`==========================================\n`);
    throw error;
  }
}
