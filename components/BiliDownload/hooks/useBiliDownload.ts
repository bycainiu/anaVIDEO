import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE_BILI = 'http://localhost:8888/api/bili';
const API_BASE_UNIVERSAL = 'http://localhost:8888/api/universal';

interface DownloadTask {
  task_id: string;
  status: 'queued' | 'parsing' | 'downloading' | 'merging' | 'completed' | 'failed' | 'cancelled';
  url: string;
  progress?: {
    file_type?: string;
    progress?: number;
    downloaded?: number;
    total?: number;
    speed?: string;
  };
  created_at: string;
  error?: string;
}

export const useBiliDownload = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentTask, setCurrentTask] = useState<DownloadTask | null>(null);
  const [allTasks, setAllTasks] = useState<DownloadTask[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const pollingIntervalRef = useRef<NodeJS.Timeout>();

  // 处理WebSocket消息
  const handleWebSocketMessage = useCallback((message: any) => {
    const { type, task_id, data, status, result, error } = message;

    switch (type) {
      case 'progress':
        setAllTasks(prev => prev.map(task => 
          task.task_id === task_id 
            ? { ...task, progress: data }
            : task
        ));
        break;

      case 'status':
        setAllTasks(prev => prev.map(task => 
          task.task_id === task_id 
            ? { ...task, status }
            : task
        ));
        break;

      case 'completed':
        setAllTasks(prev => prev.map(task => 
          task.task_id === task_id 
            ? { ...task, status: 'completed', result }
            : task
        ));
        break;

      case 'failed':
        setAllTasks(prev => prev.map(task => 
          task.task_id === task_id 
            ? { ...task, status: 'failed', error }
            : task
        ));
        break;
    }
  }, []);

  // 初始化WebSocket连接
  const initWebSocket = useCallback(() => {
    // 如果已经有连接且状态正常，不重复创建
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }
    
    // 如果正在连接中，也不重复创建
    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket is connecting...');
      return;
    }

    try {
      console.log('Initializing WebSocket connection...');
      const ws = new WebSocket('ws://localhost:8888/ws/progress');
      
      ws.onopen = () => {
        console.log('✅ WebSocket connected successfully');
        setIsConnected(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = undefined;
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('❌ WebSocket disconnected', event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;
        
        // 清除旧的重连定时器
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        
        // 自动重连（3秒后）
        console.log('⏱️  Will reconnect in 3 seconds...');
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('🔄 Attempting to reconnect...');
          initWebSocket();
        }, 3000);
      };

      ws.onerror = (error) => {
        console.error('⚠️  WebSocket error:', error);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('❌ Failed to create WebSocket:', error);
      // 重试连接
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('🔄 Retrying WebSocket connection...');
        initWebSocket();
      }, 5000);
    }
  }, [handleWebSocketMessage]);


  // 登录
  const login = useCallback(async (cookies: Record<string, string>) => {
    try {
      const response = await fetch(`${API_BASE_BILI}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies })
      });

      if (response.ok) {
        const result = await response.json();
        setIsLoggedIn(true);
        
        // 保存Cookie到localStorage以便恢复
        localStorage.setItem('bili_cookies', JSON.stringify(cookies));
        
        // 登录成功后初始化WebSocket
        initWebSocket();
        
        return result;
      } else {
        const error = await response.json();
        throw new Error(error.detail || '登录失败');
      }
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }, [initWebSocket]);

  // 解析视频（支持多站点）
  const parseVideo = useCallback(async (url: string) => {
    try {
      // 按站点路由：B站走原接口，其它站点走通用接口
      const isBili = /bilibili\.com|b23\.tv/i.test(url);
      const endpoint = isBili ? `${API_BASE_BILI}/parse` : `${API_BASE_UNIVERSAL}/parse`;

      // 添加超时控制(90秒)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (response.ok) {
          return await response.json();
        } else {
          const error = await response.json();
          throw new Error(error.detail || '解析视频失败');
        }
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('解析超时，请检查网络或稍后重试');
        }
        throw error;
      }
    } catch (error) {
      console.error('Parse video failed:', error);
      throw error;
    }
  }, []);

  // 开始下载
  const startDownload = useCallback(async (url: string, options?: { quality?: number }) => {
    try {
      // 按站点路由：B站走原接口，其它站点走通用接口
      const isBili = /bilibili\.com|b23\.tv/i.test(url);
      const endpoint = isBili ? `${API_BASE_BILI}/download` : `${API_BASE_UNIVERSAL}/download`;
      const body = isBili
        ? { url, quality: options?.quality || 80, output_dir: './downloads' }
        : { url, output_dir: './downloads' };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const result = await response.json();
        
        // 添加新任务到列表
        const newTask: DownloadTask = {
          task_id: result.task_id,
          status: 'queued',
          url,
          created_at: new Date().toISOString()
        };
        
        setAllTasks(prev => [newTask, ...prev]);
        setCurrentTask(newTask);
        
        return result;
      } else {
        const error = await response.json();
        throw new Error(error.detail || '创建下载任务失败');
      }
    } catch (error) {
      console.error('Start download failed:', error);
      throw error;
    }
  }, []);

  // 批量下载
  const startBatchDownload = useCallback(async (bvids: string[], options?: { quality?: number }) => {
    try {
      const response = await fetch(`${API_BASE_BILI}/batch-download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bvids,
          quality: options?.quality || 80,
          output_dir: './downloads'
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        // 添加任务到列表
        const newTasks = result.task_ids.map((task_id: string, index: number) => ({
          task_id,
          status: 'queued' as const,
          url: `https://www.bilibili.com/video/${bvids[index]}`,
          created_at: new Date().toISOString()
        }));
        
        setAllTasks(prev => [...newTasks, ...prev]);
        
        return result;
      } else {
        const error = await response.json();
        throw new Error(error.detail || '批量下载失败');
      }
    } catch (error) {
      console.error('Batch download failed:', error);
      throw error;
    }
  }, []);

  // 取消任务
  const cancelTask = useCallback(async (taskId: string) => {
    try {
      const response = await fetch(`${API_BASE_BILI}/tasks/${taskId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setAllTasks(prev => prev.map(task => 
          task.task_id === taskId 
            ? { ...task, status: 'cancelled' }
            : task
        ));
      }
    } catch (error) {
      console.error('Cancel task failed:', error);
    }
  }, []);

  // 清除已完成的任务
  const clearCompletedTasks = useCallback(() => {
    setAllTasks(prev => prev.filter(task => 
      !['completed', 'failed', 'cancelled'].includes(task.status)
    ));
  }, []);

  // 获取任务状态
  const refreshTasks = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_BILI}/tasks`);
      if (response.ok) {
        const result = await response.json();
        setAllTasks(result.tasks || []);
      }
    } catch (error) {
      console.error('Refresh tasks failed:', error);
    }
  }, []);

  // 组件挂载时初始化
  useEffect(() => {
    const restoreLogin = async () => {
      // 检查是否已登录并恢复cookie
      const savedLoginState = localStorage.getItem('bili_logged_in');
      const savedCookies = localStorage.getItem('bili_cookies');
      
      console.log('=== 🔍 检查登录状态 ===');
      console.log('savedLoginState:', savedLoginState);
      console.log('savedCookies:', savedCookies ? 'exists' : 'null');
      
      if (savedLoginState === 'true' && savedCookies) {
        // 重新发送Cookie到后端以恢复登录状态
        try {
          console.log('🔄 尝试恢复登录状态...');
          const cookies = JSON.parse(savedCookies);
          const response = await fetch(`${API_BASE_BILI}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cookies })
          });
          
          if (response.ok) {
            const result = await response.json();
            console.log('✅ 登录恢复成功:', result);
            setIsLoggedIn(true);
            
            // 先初始化 WebSocket
            console.log('🔌 初始化 WebSocket 连接...');
            initWebSocket();
            
            // 然后刷新任务列表（从服务器恢复任务状态）
            console.log('📋 正在从服务器恢复任务列表...');
            await refreshTasks();
            console.log('✅ 任务列表恢复完成');
          } else {
            // Cookie已失效，清除保存的状态
            const errorText = await response.text();
            console.error('❌ 保存的Cookie已失效:', errorText);
            localStorage.removeItem('bili_logged_in');
            localStorage.removeItem('bili_cookies');
            setIsLoggedIn(false);
          }
        } catch (error) {
          console.error('❌ 恢复登录状态失败:', error);
          localStorage.removeItem('bili_logged_in');
          localStorage.removeItem('bili_cookies');
          setIsLoggedIn(false);
        }
      } else {
        console.log('ℹ️  未发现保存的登录状态');
      }
    };
    
    restoreLogin();

    return () => {
      console.log('🧹 组件卸载，清理 WebSocket 连接');
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = undefined;
      }
    };
  }, [initWebSocket, refreshTasks]);

  // 保存登录状态
  useEffect(() => {
    localStorage.setItem('bili_logged_in', isLoggedIn.toString());
  }, [isLoggedIn]);

  // 退出登录
  const logout = useCallback(() => {
    setIsLoggedIn(false);
    localStorage.removeItem('bili_logged_in');
    localStorage.removeItem('bili_cookies');
    
    // 关闭WebSocket连接
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    // 清空任务
    setAllTasks([]);
    setCurrentTask(null);
  }, []);

  return {
    isLoggedIn,
    isConnected,
    currentTask,
    allTasks,
    login,
    logout,
    parseVideo,
    startDownload,
    startBatchDownload,
    cancelTask,
    clearCompletedTasks,
    refreshTasks
  };
};