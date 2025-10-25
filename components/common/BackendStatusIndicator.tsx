import React, { useState, useEffect } from 'react';
import * as hybridStorage from '../../services/hybridStorageService';

export const BackendStatusIndicator: React.FC = () => {
  const [isBackendAvailable, setIsBackendAvailable] = useState(false);

  useEffect(() => {
    // 初始检查
    setIsBackendAvailable(hybridStorage.getBackendStatus());

    // 每30秒更新一次状态
    const interval = setInterval(() => {
      setIsBackendAvailable(hybridStorage.getBackendStatus());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 text-xs">
      <div 
        className={`w-2 h-2 rounded-full ${
          isBackendAvailable ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
        }`}
        title={isBackendAvailable ? 'Backend connected' : 'Using local storage'}
      />
      <span className="text-gray-400">
        {isBackendAvailable ? '🌐 Server' : '💾 Local'}
      </span>
    </div>
  );
};

export default BackendStatusIndicator;
