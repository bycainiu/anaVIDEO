import React, { useEffect, useState } from 'react';
import { getAllConversations, deleteConversation, type Conversation } from '../services/conversationService';
import { TrashIcon, PlusIcon } from './common/Icons';

interface ConversationHistoryProps {
  currentConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
}

const ConversationHistory: React.FC<ConversationHistoryProps> = ({
  currentConversationId,
  onSelectConversation,
  onNewConversation,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllConversations();
      setConversations(data);
    } catch (err: any) {
      console.error('[ConversationHistory] Failed to load conversations:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);
  
  // 当当前对话ID变化时，重新加载对话列表(支持新建对话的实时显示)
  useEffect(() => {
    if (currentConversationId) {
      // 检查该对话ID是否已在列表中
      const exists = conversations.some(c => c.id === currentConversationId);
      if (!exists) {
        // 如果不存在，重新加载列表
        loadConversations();
      }
    }
  }, [currentConversationId]);

  const handleDelete = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除这个对话吗？')) return;

    try {
      await deleteConversation(conversationId);
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      
      // 如果删除的是当前对话，创建新对话
      if (conversationId === currentConversationId) {
        onNewConversation();
      }
    } catch (err: any) {
      console.error('[ConversationHistory] Failed to delete conversation:', err);
      alert('删除失败: ' + err.message);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="w-64 h-full bg-gray-900 border-r border-gray-700 flex flex-col">
      {/* 头部 */}
      <div className="p-4 border-b border-gray-700">
        <button
          onClick={onNewConversation}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
        >
          <PlusIcon />
          新建对话
        </button>
      </div>

      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-400">加载中...</div>
        ) : error ? (
          <div className="p-4 text-center text-red-400 text-sm">{error}</div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">暂无对话记录</div>
        ) : (
          <div className="py-2">
            {conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`mx-2 mb-2 p-3 rounded-lg cursor-pointer transition-colors group ${
                  conv.id === currentConversationId
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate mb-1">
                      {conv.title || '未命名对话'}
                    </div>
                    <div className={`text-xs ${
                      conv.id === currentConversationId ? 'text-blue-200' : 'text-gray-500'
                    }`}>
                      {formatDate(conv.updated_at)} · {conv.message_count || 0} 条消息
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(conv.id, e)}
                    className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                      conv.id === currentConversationId
                        ? 'hover:bg-blue-700'
                        : 'hover:bg-gray-600'
                    }`}
                    title="删除对话"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationHistory;
