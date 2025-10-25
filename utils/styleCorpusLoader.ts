import colloquialStyleData from '../config/colloquialStyle.json';

/**
 * 将语料库动态格式化为适合注入prompt的字符串
 */
export function getStyleCorpusPrompt(): string {
  const corpus = colloquialStyleData as Record<string, any>;
  const lines: string[] = ['【中文口语化风格参考】'];
  
  for (const [category, content] of Object.entries(corpus)) {
    if (typeof content === 'object' && !Array.isArray(content)) {
      // 如果是对象,遍历其子项
      lines.push(`\n${category}:`);
      for (const [key, values] of Object.entries(content)) {
        if (Array.isArray(values)) {
          lines.push(`  ${key}: ${values.join('、')}`);
        }
      }
    } else if (Array.isArray(content)) {
      // 如果直接是数组
      lines.push(`${category}: ${content.join('、')}`);
    }
  }
  
  return lines.join('\n');
}
