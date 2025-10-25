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
  const userPrompt = getVideoAnalysisUserPrompt(frames, preset);
  
