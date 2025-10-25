import type { VideoAnalysisResult } from '../types';

// This function calls the API to translate a batch of text strings.
async function fetchTranslations(apiKey: string, baseUrl: string, model: string | undefined, texts: string[]): Promise<Map<string, string>> {
    if (texts.length === 0) return new Map();

    console.log(`[Translator] Preparing to translate ${texts.length} unique text strings...`);

    const prompt = `
You are a highly efficient and accurate translation engine. Your task is to translate a given JSON array of English words/phrases/sentences into a JSON array of Simplified Chinese words/phrases/sentences.

**CRITICAL INSTRUCTIONS:**
1.  Your entire response MUST be a single, valid JSON object.
2.  The JSON object must contain one key: "translations".
3.  The value of "translations" must be a string array.
4.  The translated strings must be in the exact same order as the input array.
5.  If you cannot translate a text, you MUST return the original English text in its place.
6.  Do NOT include any markdown, explanations, or any text outside of the JSON object.
7.  Preserve the meaning and tone of the original text in the translation.

**INPUT:**
${JSON.stringify(texts)}

**REQUIRED OUTPUT (EXAMPLE):**
{
  "translations": ["狗", "一件红色的T恤", "跑步"]
}`;

    const body = {
        model: model || 'gpt-4o', 
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.0, // Set to 0 for maximum determinism in translation
        response_format: { type: "json_object" }
    };

    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`Translation API request failed with status ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content;
        if (!content) throw new Error("Translation response is empty.");

        const parsed = JSON.parse(content);

        if (!parsed.translations || !Array.isArray(parsed.translations) || parsed.translations.length !== texts.length) {
            throw new Error(`Invalid translation response format. Expected 'translations' array of length ${texts.length}.`);
        }

        const translationMap = new Map<string, string>();
        texts.forEach((text, i) => {
            translationMap.set(text, parsed.translations[i]);
        });

        console.log('[Translator] Successfully received and parsed translations.');
        return translationMap;

    } catch (error) {
        console.error('[Translator] Keyword translation process failed:', error);
        return new Map(); // Return empty map on failure
    }
}

// This function orchestrates the translation fallback logic.
export async function applyTranslationFallback(
    analysis: VideoAnalysisResult,
    apiKey: string, 
    baseUrl: string, 
    model: string | undefined
): Promise<VideoAnalysisResult> {
    console.log('[Translation Fallback] Checking if translation is needed...');
    
    const textsToTranslate = new Set<string>();

    // Collect all English texts that need translation
    
    // Overall Summary
    if (analysis.overallSummary?.en && (!analysis.overallSummary.cn || analysis.overallSummary.cn === analysis.overallSummary.en)) {
        textsToTranslate.add(analysis.overallSummary.en);
    }

    // Frame-level text fields and keywords
    analysis.frameAnalyses?.forEach(frame => {
        // Text fields
        if (frame?.personDescription?.en && (!frame.personDescription.cn || frame.personDescription.cn === frame.personDescription.en)) {
            textsToTranslate.add(frame.personDescription.en);
        }
        if (frame?.clothingDescription?.en && (!frame.clothingDescription.cn || frame.clothingDescription.cn === frame.clothingDescription.en)) {
            textsToTranslate.add(frame.clothingDescription.en);
        }
        if (frame?.actionDescription?.en && (!frame.actionDescription.cn || frame.actionDescription.cn === frame.actionDescription.en)) {
            textsToTranslate.add(frame.actionDescription.en);
        }
        if (frame?.inferredBehavior?.en && (!frame.inferredBehavior.cn || frame.inferredBehavior.cn === frame.inferredBehavior.en)) {
            textsToTranslate.add(frame.inferredBehavior.en);
        }
        
        // Keywords
        if (frame?.keywords?.en && (!frame.keywords.cn || frame.keywords.cn.length === 0)) {
            frame.keywords.en.forEach(kw => kw && textsToTranslate.add(kw));
        }
        if (frame?.expandedKeywords?.en && (!frame.expandedKeywords.cn || frame.expandedKeywords.cn.length === 0)) {
            frame.expandedKeywords.en.forEach(kw => kw && textsToTranslate.add(kw));
        }
    });

    if (textsToTranslate.size === 0) {
        console.log('[Translation Fallback] No texts require translation. Skipping.');
        return analysis;
    }

    console.log(`[Translation Fallback] Found ${textsToTranslate.size} unique texts to translate.`);
    const translationMap = await fetchTranslations(apiKey, baseUrl, model, Array.from(textsToTranslate));

    if (translationMap.size > 0) {
        console.log('[Translation Fallback] Applying translations...');
        
        // Apply to overall summary
        if (analysis.overallSummary?.en && translationMap.has(analysis.overallSummary.en)) {
            analysis.overallSummary.cn = translationMap.get(analysis.overallSummary.en) || analysis.overallSummary.en;
        }
        
        // Apply to frame-level fields
        analysis.frameAnalyses.forEach(frame => {
            // Text fields
            if (frame?.personDescription?.en && translationMap.has(frame.personDescription.en)) {
                frame.personDescription.cn = translationMap.get(frame.personDescription.en) || frame.personDescription.en;
            }
            if (frame?.clothingDescription?.en && translationMap.has(frame.clothingDescription.en)) {
                frame.clothingDescription.cn = translationMap.get(frame.clothingDescription.en) || frame.clothingDescription.en;
            }
            if (frame?.actionDescription?.en && translationMap.has(frame.actionDescription.en)) {
                frame.actionDescription.cn = translationMap.get(frame.actionDescription.en) || frame.actionDescription.en;
            }
            if (frame?.inferredBehavior?.en && translationMap.has(frame.inferredBehavior.en)) {
                frame.inferredBehavior.cn = translationMap.get(frame.inferredBehavior.en) || frame.inferredBehavior.en;
            }
            
            // Keywords
            if (frame?.keywords?.en && (!frame.keywords.cn || frame.keywords.cn.length === 0)) {
                frame.keywords.cn = frame.keywords.en.map(kw => translationMap.get(kw) || kw);
            }
            if (frame?.expandedKeywords?.en && (!frame.expandedKeywords.cn || frame.expandedKeywords.cn.length === 0)) {
                frame.expandedKeywords.cn = frame.expandedKeywords.en.map(kw => translationMap.get(kw) || kw);
            }
        });
    } else {
        console.warn('[Translation Fallback] Translation returned no results. Copying English to Chinese fields as a final fallback.');
        
        // Final fallback: copy English to Chinese if translation failed
        if (analysis.overallSummary?.en) {
            analysis.overallSummary.cn = analysis.overallSummary.en;
        }
        
        analysis.frameAnalyses.forEach(frame => {
            if (frame?.personDescription?.en) frame.personDescription.cn = frame.personDescription.en;
            if (frame?.clothingDescription?.en) frame.clothingDescription.cn = frame.clothingDescription.en;
            if (frame?.actionDescription?.en) frame.actionDescription.cn = frame.actionDescription.en;
            if (frame?.inferredBehavior?.en) frame.inferredBehavior.cn = frame.inferredBehavior.en;
            
            if (frame?.keywords?.en && (!frame.keywords.cn || frame.keywords.cn.length === 0)) {
                frame.keywords.cn = [...frame.keywords.en];
            }
            if (frame?.expandedKeywords?.en && (!frame.expandedKeywords.cn || frame.expandedKeywords.cn.length === 0)) {
                frame.expandedKeywords.cn = [...frame.expandedKeywords.en];
            }
        });
    }
    
    return analysis;
}
