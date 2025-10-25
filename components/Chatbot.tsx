
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ApiProvider, Message } from '../types';
import { BotIcon, SendIcon, UserIcon, LoadingSpinner } from './common/Icons';
import { useLanguage } from '../contexts/LanguageContext';
import { useSettings } from '../contexts/SettingsContext';
import { createChatSession } from '../services/apiService';
import ConversationHistory from './ConversationHistory';

interface ChatbotProps {
  onVideoClick?: (videoId: string) => void;
}

const Chatbot: React.FC<ChatbotProps> = ({ onVideoClick }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(() => {
    // 从 localStorage恢复当前对话ID
    return localStorage.getItem('currentConversationId') || null;
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();
  const { settings, chatProvider, setChatProvider } = useSettings();

  const chatSession = useRef(createChatSession());

  // 初始化欢迎消息
  useEffect(() => {
    if (!currentConversationId) {
      setMessages([{ role: 'model', content: t('chatbotWelcome') }]);
    }
  }, [t, currentConversationId]);
  
  // 加载历史对话
  useEffect(() => {
    const loadConversation = async () => {
      if (currentConversationId) {
        try {
          console.log('[Chatbot] Loading conversation:', currentConversationId);
          await chatSession.current.loadConversation(currentConversationId);
          // 从 chatSession 中获取加载的消息并显示
          const conversation = await chatSession.current.loadConversation(currentConversationId);
          if (conversation.messages && conversation.messages.length > 0) {
            setMessages(conversation.messages);
          }
        } catch (error) {
          console.error('[Chatbot] Failed to load conversation:', error);
          setMessages([{ role: 'model', content: '加载对话失败，已创建新对话' }]);
        }
      }
    };
    loadConversation();
  }, [currentConversationId]);
  
  // 持久化当前对话ID
  useEffect(() => {
    if (currentConversationId) {
      localStorage.setItem('currentConversationId', currentConversationId);
    } else {
      localStorage.removeItem('currentConversationId');
    }
  }, [currentConversationId]);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSendMessage = useCallback(async () => {
    if (input.trim() === '' || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // 立即获取并设置对话ID(在发送消息之前)
    if (!currentConversationId) {
      const newConvId = chatSession.current.getConversationId();
      setCurrentConversationId(newConvId);
    }

    try {
        const response = await chatSession.current.sendMessage(input, chatProvider, settings);
        const modelMessage: Message = { role: 'model', content: response };
        setMessages(prev => [...prev, modelMessage]);
    } catch (err: any) {
        const errorMessage: Message = { role: 'model', content: err.message };
        setMessages(prev => [...prev, errorMessage]);
    } finally {
        setIsLoading(false);
    }
  }, [input, isLoading, chatProvider, settings, currentConversationId]);
  
  // 创建新对话
  const handleNewConversation = useCallback(() => {
    chatSession.current = createChatSession();
    setCurrentConversationId(null);
    setMessages([{ role: 'model', content: t('chatbotWelcome') }]);
    setInput('');
  }, [t]);
  
  // 切换对话
  const handleSelectConversation = useCallback((conversationId: string) => {
    setCurrentConversationId(conversationId);
    setMessages([]); // 清空消息，等待 useEffect 加载
    setIsLoading(false); // 重置加载状态
  }, []);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  // 解析消息内容，将视频ID转换为可点击的链接
  const renderMessageContent = (content: string) => {
    // 匹配类似 "[video_id]" 或 "视频 video_id" 的模式
    const videoIdPattern = /\b([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/gi;
    const parts = content.split(videoIdPattern);
    
    return (
      <span>
        {parts.map((part, index) => {
          // 如果是视频ID，渲染为链接
          if (part.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)) {
            return (
              <button
                key={index}
                onClick={() => onVideoClick?.(part)}
                className="inline-flex items-center gap-1 px-2 py-0.5 mx-1 bg-blue-500 hover:bg-blue-600 rounded text-white text-sm font-medium transition-colors cursor-pointer"
                title="点击查看视频"
              >
                🎥 {part.substring(0, 8)}...
              </button>
            );
          }
          return <span key={index}>{part}</span>;
        })}
      </span>
    );
  };

  return (
    <div className="flex h-full bg-gray-800 rounded-xl shadow-lg overflow-hidden">
      {/* 对话历史侧边栏 */}
      <ConversationHistory
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
      />
      
      {/* 聊天主区域 */}
      <div className="flex flex-col flex-1">
       <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <label htmlFor="chat-provider" className="text-sm font-medium text-gray-300">{t('provider')}:</label>
            <select
              id="chat-provider"
              value={chatProvider}
              onChange={(e) => setChatProvider(e.target.value as ApiProvider)}
              className="bg-gray-700 border border-gray-600 rounded-md py-1 px-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI Compatible</option>
            </select>
          </div>
        </div>

      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        {messages.map((msg, index) => (
          <div key={index} className={`flex items-start gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'model' && <div className="w-8 h-8 flex-shrink-0 bg-blue-500 rounded-full flex items-center justify-center"><BotIcon /></div>}
            <div className={`max-w-lg p-4 rounded-xl text-white ${msg.role === 'user' ? 'bg-blue-600 rounded-br-none' : 'bg-gray-700 rounded-bl-none'}`}>
              <div className="whitespace-pre-wrap">{renderMessageContent(msg.content)}</div>
            </div>
             {msg.role === 'user' && <div className="w-8 h-8 flex-shrink-0 bg-gray-600 rounded-full flex items-center justify-center"><UserIcon /></div>}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 flex-shrink-0 bg-blue-500 rounded-full flex items-center justify-center"><BotIcon /></div>
            <div className="max-w-lg p-4 rounded-xl bg-gray-700 rounded-bl-none flex items-center justify-center">
              <LoadingSpinner />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-700 p-4 bg-gray-900 rounded-b-xl">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={t('chatbotPlaceholder')}
            className="w-full bg-gray-700 border border-gray-600 rounded-full py-3 pl-4 pr-12 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-blue-600 text-white disabled:bg-gray-500 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
          >
            <SendIcon />
          </button>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Chatbot;
