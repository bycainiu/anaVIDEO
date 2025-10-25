import React, { createContext, useState, useContext, ReactNode } from 'react';

type Language = 'en' | 'cn';

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, ...args: any[]) => string;
}

const translations: Record<Language, Record<string, string | ((...args: any[]) => string)>> = {
  en: {
    // App.tsx
    chat: 'Chat',
    imageGen: 'Image Gen',
    videoAnalysis: 'Video Analysis',
    videoManagement: 'Video Management',
    semanticSearch: 'Semantic Search',
    admin: 'Admin',
    user: 'User',
    // Chatbot.tsx
    chatbotWelcome: "Hello! How can I help you today?",
    chatbotPlaceholder: "Type your message...",
    // ImageGenerator.tsx
    imgGenTitle: 'Image Generation',
    imgGenDescription: 'Describe the image you want to create. Be as specific as you can for the best results.',
    prompt: 'Prompt',
    promptPlaceholder: 'e.g., A majestic lion wearing a crown, cinematic lighting',
    aspectRatio: 'Aspect Ratio',
    generateImage: 'Generate Image',
    generating: 'Generating...',
    imgGenResultTitle: 'Your generated image will appear here',
    imgGenResultSubtitle: 'Start by entering a prompt and clicking "Generate".',
    // VideoAnalyzer -> Admin & User Views
    videoBatchAnalysis: 'Video Batch Analysis',
    addVideos: 'Add Videos to Queue',
    processing: 'Processing...',
    searchAnalyses: 'Search analyses...',
    noResults: 'No matching results found.',
    analysisResultsHere: 'Analysis Results Will Appear Here',
    analysisResultsInstruction: 'Upload videos and select a result from the list to view its detailed analysis.',
    overallSummary: 'Overall Summary',
    frameAnalysis: 'Frame Analysis',
    timestamp: 'Timestamp',
    person: 'Person',
    clothing: 'Clothing',
    action: 'Action',
    inferredBehavior: 'Inferred Behavior',
    keywords: 'Keywords',
    expandedKeywords: 'Expanded Keywords (for Semantic Search)',
    // Status Messages
    processingStatus: 'Processing Status',
    statusAwaiting: 'Ready to process videos.',
    statusLoaded: (count: number) => `${count} videos loaded from permanent storage.`,
    statusProcessing: (name: string, current: number, total: number) => `Processing ${name} (${current}/${total})...`,
    statusExtracting: (name: string) => `Extracting potential frames from ${name}...`,
    statusHashing: (count: number) => `Calculating visual similarity for ${count} frames...`,
    statusClustering: (count: number) => `Selecting ${count} keyframes for analysis...`,
    statusAnalyzing: (name: string) => `Analyzing ${name}...`,
    statusSaving: (name: string) => `Saving ${name} to backend...`,
    statusFailed: (name: string, error: string) => `Analysis failed for ${name}: ${error}`,
    statusComplete: 'Processing complete. Ready for new videos.',
    // Admin View
    adminDashboard: 'Admin Dashboard',
    analyzedVideos: 'Analyzed Videos',
    viewDetails: 'View Details',
    edit: 'Edit',
    saveChanges: 'Save Changes',
    cancel: 'Cancel',
    delete: 'Delete',
    confirmDelete: (name: string) => `Are you sure you want to delete the analysis for "${name}"? This will also delete the stored video file and cannot be undone.`,
    keywordGraph: 'Keyword Relationship Graph',
    keywordGraphDescription: 'Keywords that appear together frequently are linked. Click a node to filter the list below.',
    graphFilterActive: 'Graph filter active:',
    clearFilter: 'Clear',
    // User View
    searchAllVideos: 'Search all videos...',
    searchPrompt: 'e.g., "person in yoga pants" or "outdoor running scene"',
    searchResults: 'Search Results',
    noVideosFound: 'No videos analyzed yet. Switch to Admin mode to add and process videos.',
    startSearching: 'Start by searching for content in the video library.',
    jumpTo: 'Jump to',
    videoPlaybackError: 'Could not load video file from the local browser database. It may have been deleted or an error occurred.',

    // Settings & Providers
    provider: 'Provider',
    settings: 'Settings',
    apiSettings: 'API Settings',
    geminiSettings: 'Google Gemini',
    openaiSettings: 'OpenAI Compatible',
    analysisSettings: 'Analysis',
    analysisPreset: 'Global Analysis Preset',
    analysisPresetDescription: 'This prompt will be included in every video analysis request to guide the AI\'s focus and improve accuracy for your specific needs.',
    analysisPresetPlaceholder: 'e.g., Focus on athletic performance and sportswear. Describe the specific type of athletic shoes.',
    apiKey: 'API Key(s)',
    apiKeyPlaceholder: 'Enter one or more keys, comma-separated',
    baseUrl: 'Base URL',
    baseUrlPlaceholder: 'e.g., https://api.openai.com/v1',
    save: 'Save',
    close: 'Close',
    settingsSaved: 'Settings saved successfully!',
    settingsDisclaimer: 'Your API keys are stored securely in your browser\'s local storage and are never sent to any server other than the API provider you configure.',
  },
  cn: {
    // App.tsx
    chat: '聊天',
    imageGen: '图像生成',
    videoAnalysis: '视频分析',
    videoManagement: '视频管理',
    semanticSearch: '语义检索',
    admin: '管理员',
    user: '用户',
    // Chatbot.tsx
    chatbotWelcome: "你好！今天我能为你做些什么？",
    chatbotPlaceholder: "输入你的消息...",
    // ImageGenerator.tsx
    imgGenTitle: '图像生成',
    imgGenDescription: '请描述您想创建的图像。描述越具体，效果越好。',
    prompt: '提示',
    promptPlaceholder: '例如：一只戴着皇冠的雄伟狮子，电影级光效',
    aspectRatio: '宽高比',
    generateImage: '生成图像',
    generating: '生成中...',
    imgGenResultTitle: '您生成的图像将显示在这里',
    imgGenResultSubtitle: '首先输入提示并点击“生成”。',
    // VideoAnalyzer -> Admin & User Views
    videoBatchAnalysis: '视频批量分析',
    addVideos: '添加视频到队列',
    processing: '处理中...',
    searchAnalyses: '搜索分析内容...',
    noResults: '未找到匹配的结果。',
    analysisResultsHere: '分析结果将在此处显示',
    analysisResultsInstruction: '上传视频并从列表中选择一个结果以查看其详细分析。',
    overallSummary: '总体摘要',
    frameAnalysis: '帧分析',
    timestamp: '时间戳',
    person: '人物',
    clothing: '服装',
    action: '动作',
    inferredBehavior: '推断行为',
    keywords: '关键词',
    expandedKeywords: '扩展关键词 (用于语义搜索)',
    // Status Messages
    processingStatus: '处理状态',
    statusAwaiting: '准备处理视频。',
    statusLoaded: (count: number) => `已从永久存储加载 ${count} 个视频。`,
    statusProcessing: (name: string, current: number, total: number) => `正在处理 ${name} (${current}/${total})...`,
    statusExtracting: (name: string) => `正在从 ${name} 提取候选帧...`,
    statusHashing: (count: number) => `正在为 ${count} 帧计算视觉相似度...`,
    statusClustering: (count: number) => `正在选取 ${count} 个关键帧进行分析...`,
    statusAnalyzing: (name: string) => `正在分析 ${name}...`,
    statusSaving: (name: string) => `正在保存 ${name} 到后端...`,
    statusFailed: (name: string, error: string) => `分析 ${name} 失败: ${error}`,
    statusComplete: '处理完成。准备上传新视频。',
    // Admin View
    adminDashboard: '管理员仪表盘',
    analyzedVideos: '已分析的视频',
    viewDetails: '查看详情',
    edit: '编辑',
    saveChanges: '保存更改',
    cancel: '取消',
    delete: '删除',
    confirmDelete: (name: string) => `您确定要删除“${name}”的分析结果吗？这将同时删除已存储的视频文件，且操作无法撤销。`,
    keywordGraph: '关键词关联图谱',
    keywordGraphDescription: '频繁一同出现的关键词会被连接起来。点击节点以筛选下方的视频列表。',
    graphFilterActive: '图谱筛选已激活:',
    clearFilter: '清除',
    // User View
    searchAllVideos: '搜索所有视频...',
    searchPrompt: '例如：“户外跑步场景”',
    searchResults: '搜索结果',
    noVideosFound: '暂无已分析的视频。请切换到管理员模式添加并处理视频。',
    startSearching: '在视频库中搜索内容以开始。',
    jumpTo: '跳转到',
    videoPlaybackError: '无法从本地浏览器数据库加载视频文件。文件可能已被删除或发生错误。',
     // Settings & Providers
    provider: '服务商',
    settings: '设置',
    apiSettings: 'API 设置',
    geminiSettings: 'Google Gemini',
    openaiSettings: 'OpenAI 兼容',
    analysisSettings: '分析',
    analysisPreset: '全局分析预设',
    analysisPresetDescription: '此提示将包含在每个视频分析请求中，以引导 AI 的注意力，并根据您的特定需求提高准确性。',
    analysisPresetPlaceholder: '例如：专注于运动表现和运动服装。描述运动鞋的具体类型。',
    apiKey: 'API 密钥',
    apiKeyPlaceholder: '输入一个或多个密钥，用逗号分隔',
    baseUrl: '基础 URL',
    baseUrlPlaceholder: '例如：https://api.openai.com/v1',
    save: '保存',
    close: '关闭',
    settingsSaved: '设置已成功保存！',
    settingsDisclaimer: '您的 API 密钥安全地存储在您浏览器的本地存储中，绝不会发送到您配置的 API 服务商以外的任何服务器。',
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('cn');

  const t = (key: string, ...args: any[]): string => {
    const translation = translations[language][key];
    if (typeof translation === 'function') {
      return translation(...args);
    }
    return (translation as string) || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};