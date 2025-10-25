import { applyTranslationFallback } from './translationService';
import { getStyleCorpusPrompt } from '../utils/styleCorpusLoader';
import { getVideoAnalysisSystemPrompt, getVideoAnalysisUserPrompt } from './videoAnalysisPrompt';

import type { AspectRatio, VideoAnalysisResult, Message } from '../types';

interface OpenAIError {
  error: {
    message: string;
    type: string;
  }
}

const handleApiError = (errorData: OpenAIError | any, response: Response) => {
    if (errorData && errorData.error) {
        return new Error(`OpenAI API Error: ${errorData.error.message} (Type: ${errorData.error.type})`);
    }
    return new Error(`API request failed with status ${response.status}: ${response.statusText}`);
};

export const sendMessage = async (apiKey: string, baseUrl: string, history: Message[], message: string, model?: string): Promise<string> => {
  // Convert 'model' role to 'assistant' for OpenAI compatibility
  const openaiMessages = history.map(msg => ({
    role: msg.role === 'model' ? 'assistant' : msg.role,
    content: msg.content
  }));
  openaiMessages.push({ role: 'user', content: message });

  const body = {
    model: model || 'gpt-4o',
    messages: openaiMessages,
    max_tokens: 16000,  // Increased for longer responses
  };

  console.log('[OpenAI] Sending request to:', `${baseUrl}/chat/completions`);
  console.log('[OpenAI] Request body:', JSON.stringify(body, null, 2));

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${apiKey}` 
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();
    console.log('[OpenAI] Response status:', response.status);
    console.log('[OpenAI] Response data:', JSON.stringify(data, null, 2));
    
    if (!response.ok) throw handleApiError(data, response);

    return data.choices[0]?.message?.content || "Sorry, I couldn't get a response.";
  } catch (error) {
    console.error("Error with OpenAI chat:", error);
    throw error;
  }
};


export const generateImage = async (apiKey: string, baseUrl: string, prompt: string, aspectRatio: AspectRatio, model?: string): Promise<string> => {
    const sizeMap: Record<AspectRatio, string> = {
        "1:1": "1024x1024",
        "16:9": "1792x1024",
        "9:16": "1024x1792",
        "4:3": "1024x768", // Not a direct DALL-E 3 size, will default to 1024x1024
        "3:4": "768x1024", // Not a direct DALL-E 3 size, will default to 1024x1024
    };
    const body = {
        model: model || 'dall-e-3',
        prompt,
        n: 1,
        size: sizeMap[aspectRatio] || "1024x1024",
        response_format: 'b64_json',
    };
    try {
        const response = await fetch(`${baseUrl}/images/generations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok) throw handleApiError(data, response);
        const b64_json = data.data[0]?.b64_json;
        if (b64_json) {
            return `data:image/png;base64,${b64_json}`;
        }
        throw new Error("No image data received from API.");
    } catch (error) {
        console.error("Error generating image with OpenAI:", error);
        throw error;
    }
};


function parseMarkdownAnalysisToJson(markdown: string): VideoAnalysisResult {
    console.log('[Markdown Parser] Starting final robust parsing logic...');
    const analysis: VideoAnalysisResult = {
        overallSummary: { en: "", cn: "" },
        frameAnalyses: [],
    };

    // 1. Extract Overall Summary (more flexible)
    const summaryMatch = markdown.match(/^(?:###\s*1\.\s*)?Overall Summary:?([\s\S]*?)(?=###|   - \*\*Timestamp\*\*|$)/i);
    if (summaryMatch && summaryMatch[1]) {
        const summaryText = summaryMatch[1].trim();
        analysis.overallSummary = { en: summaryText, cn: summaryText }; // For now, duplicate for Chinese
        console.log('[Markdown Parser] Extracted Summary:', summaryText.substring(0, 100));
    }

    // 2. Use matchAll to find all frame sections, this is more robust than split
    const frameRegex = /(?:-|\*\*|###)?\s*Timestamp\s*:[\s\S]*?(?=(?:-|\*\*|###)?\s*Timestamp\s*:|$)/g;
    const frameMatches = [...markdown.matchAll(frameRegex)];
    console.log(`[Markdown Parser] Found ${frameMatches.length} potential frame sections.`);

    if (frameMatches.length === 0) {
        console.error('[Markdown Parser] CRITICAL: Could not find any frame sections. The model output format may have changed drastically.');
    }

    for (const match of frameMatches) {
        const section = match[0];
        const frame: any = {};

        const timeMatch = section.match(/Timestamp\s*:\s*(\d+\.?\d*)/);
        if (timeMatch) {
            frame.timestamp = parseFloat(timeMatch[1]);
        } else {
            console.warn('[Markdown Parser] Skipping section, could not find timestamp.');
            continue;
        }

        const extractField = (fieldName: string): { en: string; cn: string } => {
            const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`-\s*\*\*${escapedFieldName}\*\*:\s*([\s\S]*?)(?=\n\s*-\s*\*\*|$)`);
            const fieldMatch = section.match(regex);
            const text = fieldMatch ? fieldMatch[1].trim() : "";
            return { en: text, cn: text };
        };

        const extractKeywords = (fieldName: string): { en: string[]; cn: string[] } => {
            const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`-\s*\*\*${escapedFieldName}\*\*:\s*(\[[\s\S]*?\])`);
            const kwMatch = section.match(regex);
            if (kwMatch && kwMatch[1]) {
                try {
                    // Robust manual parsing for malformed JSON arrays
                    const content = kwMatch[1].slice(1, -1); // Remove brackets
                    const arr = content.split(',')
                                       .map(s => s.trim().replace(/^"|"$/g, '')) // Trim whitespace and quotes
                                       .filter(s => s); // Remove empty strings from trailing commas etc.
                    
                    if (arr.length > 0) {
                        console.log(`[Keyword Parser] Manually parsed ${arr.length} keywords for ${fieldName}.`);
                        return { en: arr, cn: [] }; // Set cn to empty, to be filled by translator
                    }
                } catch (e) {
                    console.warn(`Manual keyword parser for ${fieldName} failed:`, e);
                }
            }
            return { en: [], cn: [] };
        };

        frame.personDescription = extractField("Person Description");
        frame.clothingDescription = extractField("Clothing Description");
        frame.actionDescription = extractField("Action Description");
        frame.inferredBehavior = extractField("Inferred Behavior");
        frame.keywords = extractKeywords("Keywords");
        frame.expandedKeywords = extractKeywords("Expanded Keywords");

        analysis.frameAnalyses.push(frame);
    }
    
    console.log(`[Markdown Parser] Successfully parsed ${analysis.frameAnalyses.length} frames.`);
    return analysis;
}

// 模型API服务端的payload上限 (字节)
// 如果遇到 413 Payload Too Large 错误，可以降低此值
const MAX_PAYLOAD_SIZE = 28 * 1024 * 1024; // 28MB

export const analyzeVideoFrames = async (
    apiKey: string,
    baseUrl: string,
    frames: Array<{ timestamp: number; base64Data: string; subtitleContext?: string }>,
    preset?: string,
    model?: string
): Promise<VideoAnalysisResult> => {
  const styleGuide = getStyleCorpusPrompt();
  
  // 使用增强的提示词，强制 JSON 输出
  const systemPrompt = getVideoAnalysisSystemPrompt(styleGuide);
  
  // 先构建一个测试消息来检查payload大小
  let processedFrames = frames;
  let attemptCount = 0;
  const maxAttempts = 3;
  
  while (attemptCount < maxAttempts) {
    const userPrompt = getVideoAnalysisUserPrompt(processedFrames, preset);
    
    const testMessages: any[] = [
        { role: "system", content: systemPrompt },
        {
            role: "user",
            content: [
                { type: "text", text: userPrompt },
                ...processedFrames.map(frame => ({
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${frame.base64Data}`
                    }
                }))
            ]
        }
    ];
    
    const testBody = {
        model: model || "gpt-4o",
        messages: testMessages,
        max_tokens: 16000,
        response_format: { type: "json_object" }
    };
    
    const testBodyString = JSON.stringify(testBody);
    const bodySizeMB = (testBodyString.length / 1024 / 1024).toFixed(2);
    
    console.log(`[OpenAI] Attempt ${attemptCount + 1}: Payload size: ${bodySizeMB}MB, Frame count: ${processedFrames.length}`);
    
    // 如果payload大小在限制内，跳出循环
    if (testBodyString.length <= MAX_PAYLOAD_SIZE) {
      console.log('[OpenAI] Payload size acceptable, proceeding with request');
      break;
    }
    
    // 如果超出限制，减少帧数
    attemptCount++;
    if (attemptCount >= maxAttempts) {
      throw new Error(`Payload too large (${bodySizeMB}MB). Maximum allowed: ${(MAX_PAYLOAD_SIZE / 1024 / 1024).toFixed(2)}MB. Please reduce the number of frames.`);
    }
    
    // 减少20%的帧数
    const targetFrameCount = Math.floor(processedFrames.length * 0.8);
    console.warn(`[OpenAI] Payload exceeds ${(MAX_PAYLOAD_SIZE / 1024 / 1024).toFixed(2)}MB limit, reducing frames from ${processedFrames.length} to ${targetFrameCount}`);
    
    // 均匀采样帧
    const step = processedFrames.length / targetFrameCount;
    processedFrames = Array.from({ length: targetFrameCount }, (_, i) => 
      processedFrames[Math.floor(i * step)]
    );
  }
  
  // 现在使用调整后的帧数构建最终消息
  const userPrompt = getVideoAnalysisUserPrompt(processedFrames, preset);
  const messages: any[] = [
      { role: "system", content: systemPrompt },
      {
          role: "user",
          content: [
              { type: "text", text: userPrompt },
              ...processedFrames.map(frame => ({
                  type: "image_url",
                  image_url: {
                      url: `data:image/jpeg;base64,${frame.base64Data}`
                  }
              }))
          ]
      }
  ];

  // Use a more recent vision model by default
  const selectedModel = model || "gpt-4o";
  
  const body = {
      model: selectedModel,
      messages,
      max_tokens: 16000,  // Increased for video analysis with many frames
      response_format: { type: "json_object" }
  };

  const bodyString = JSON.stringify(body);
  const bodySizeKB = (bodyString.length / 1024).toFixed(2);
  const bodySizeMB = (bodyString.length / 1024 / 1024).toFixed(2);
  
  console.log('[OpenAI] Video analysis request to:', `${baseUrl}/chat/completions`);
  console.log('[OpenAI] Using model:', selectedModel);
  console.log('[OpenAI] Frame count (original/processed):', `${frames.length}/${processedFrames.length}`);
  console.log('[OpenAI] Request body size:', `${bodySizeKB} KB (${bodySizeMB} MB)`);
  console.log('[OpenAI] Request configured with JSON response format');

  try {
      // 为视频分析设置较长的超时时间（900秒 = 15分钟）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 900000); // 15 分钟超时
      
      console.log('[OpenAI] Sending request with 15-minute timeout...');
      
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json', 
              'Authorization': `Bearer ${apiKey}` 
            },
            body: bodyString,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId); // 清除超时定时器
        
        const data = await response.json();
        
        console.log('[OpenAI] Video analysis response status:', response.status);
        if (!response.ok) {
          console.error('[OpenAI] Video analysis error:', data);
          throw handleApiError(data, response);
        }
      
      let jsonText = data.choices[0]?.message?.content;
      console.log('[OpenAI] Video analysis result length:', jsonText?.length);
      console.log('[OpenAI] Raw response preview:', jsonText?.substring(0, 500)); // Log more for debugging
      
      if (!jsonText) {
        throw new Error('No content in API response');
      }

      try {
        // First, try to parse it as-is
        const analysisResult = JSON.parse(jsonText) as VideoAnalysisResult;
        console.log('[OpenAI] Direct JSON parse successful!');
        console.log('[OpenAI] Parsed data has', analysisResult.frameAnalyses?.length || 0, 'frames');
        return await applyTranslationFallback(analysisResult, apiKey, baseUrl, model);
      } catch (e: any) {
        console.warn('[OpenAI] Direct JSON parse failed:', e.message);
        console.log('[OpenAI] Full response text for debugging:');
        console.log(jsonText);
        
        // Try to extract JSON from response if it's wrapped in markdown code blocks
        const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          console.log('[OpenAI] Found JSON in markdown code block, attempting to parse...');
          try {
            const extractedJson = jsonMatch[1].trim();
            const analysisResult = JSON.parse(extractedJson) as VideoAnalysisResult;
            console.log('[OpenAI] Successfully parsed JSON from markdown block!');
            return await applyTranslationFallback(analysisResult, apiKey, baseUrl, model);
          } catch (extractError) {
            console.warn('[OpenAI] Failed to parse extracted JSON from markdown block');
          }
        }
        
        // If all else fails, throw with detailed error
        console.error('[OpenAI] Could not parse response as JSON. Response preview:');
        console.error(jsonText.substring(0, 1000));
        throw new Error(`Failed to parse OpenAI response. The model may not have returned valid JSON. Check console for full response.`);
      }
  } catch (error: any) {
      // 处理超时错误
      if (error.name === 'AbortError') {
        console.error('[OpenAI] Request timeout after 15 minutes');
        throw new Error('Video analysis request timed out after 15 minutes. Please try with fewer frames or a faster model.');
      }
      
      console.error("Error analyzing video with OpenAI:", error);
      throw error;
  }
};

// Alias for consistency with geminiService API
export const getStructuredVideoAnalysis = async (
    apiKey: string,
    baseUrl: string,
    preset: string,
    frames: Array<{ timestamp: number; base64Data: string; subtitleContext?: string }>,
    model?: string
): Promise<VideoAnalysisResult> => {
    return analyzeVideoFrames(apiKey, baseUrl, frames, preset, model);
};
