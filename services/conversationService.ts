/**
 * 对话持久化服务
 */

import type { Message, ApiProvider } from '../types';

const API_BASE_URL: string = import.meta.env.VITE_API_URL;

// 调试日志
if (!API_BASE_URL) {
  console.error('[ConversationService] VITE_API_URL is not configured!');
  console.error('[ConversationService] Available env:', import.meta.env);
} else {
  console.log('[ConversationService] API_BASE_URL:', API_BASE_URL);
}

export interface Conversation {
  id: string;
  title: string;
  provider: ApiProvider;
  created_at: string;
  updated_at: string;
  message_count?: number;
  messages?: Message[];
}

/**
 * 获取所有对话列表
 */
export async function getAllConversations(): Promise<Conversation[]> {
  if (!API_BASE_URL) throw new Error('VITE_API_URL is not configured');
  
  const response = await fetch(`${API_BASE_URL}/api/conversations`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch conversations');
  }
  
  return response.json();
}

/**
 * 获取单个对话及其消息
 */
export async function getConversation(conversationId: string): Promise<Conversation> {
  if (!API_BASE_URL) throw new Error('VITE_API_URL is not configured');
  
  const response = await fetch(`${API_BASE_URL}/api/conversations/${conversationId}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch conversation');
  }
  
  return response.json();
}

/**
 * 创建或更新对话
 */
export async function saveConversation(
  conversationId: string,
  title: string,
  provider: ApiProvider
): Promise<void> {
  if (!API_BASE_URL) {
    console.error('[ConversationService] API_BASE_URL is undefined!');
    throw new Error('VITE_API_URL is not configured');
  }
  
  console.log(`[ConversationService] Saving conversation to: ${API_BASE_URL}/api/conversations`);
  console.log('[ConversationService] Payload:', { id: conversationId, title, provider });
  
  const response = await fetch(`${API_BASE_URL}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: conversationId, title, provider })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ConversationService] Save failed:', response.status, errorText);
    throw new Error(`Failed to save conversation: ${response.status} ${errorText}`);
  }
  
  console.log('[ConversationService] Conversation saved successfully');
}

/**
 * 保存消息到对话
 */
export async function saveMessage(
  conversationId: string,
  role: 'user' | 'model',
  content: string
): Promise<void> {
  if (!API_BASE_URL) throw new Error('VITE_API_URL is not configured');
  
  const response = await fetch(`${API_BASE_URL}/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, content })
  });
  
  if (!response.ok) {
    throw new Error('Failed to save message');
  }
}

/**
 * 删除对话
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  if (!API_BASE_URL) throw new Error('VITE_API_URL is not configured');
  
  const response = await fetch(`${API_BASE_URL}/api/conversations/${conversationId}`, {
    method: 'DELETE'
  });
  
  if (!response.ok) {
    throw new Error('Failed to delete conversation');
  }
}

/**
 * 清空对话消息
 */
export async function clearConversationMessages(conversationId: string): Promise<void> {
  if (!API_BASE_URL) throw new Error('VITE_API_URL is not configured');
  
  const response = await fetch(`${API_BASE_URL}/api/conversations/${conversationId}/messages`, {
    method: 'DELETE'
  });
  
  if (!response.ok) {
    throw new Error('Failed to clear messages');
  }
}

/**
 * 生成对话标题（基于第一条用户消息）
 */
export function generateConversationTitle(firstUserMessage: string): string {
  // 截取前30个字符作为标题
  const maxLength = 30;
  if (firstUserMessage.length <= maxLength) {
    return firstUserMessage;
  }
  return firstUserMessage.substring(0, maxLength) + '...';
}
