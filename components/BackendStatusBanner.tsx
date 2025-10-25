import React, { useEffect, useState } from 'react';

interface BackendStatusBannerProps {
  apiBase?: string; // e.g. http://localhost:8888
}

export const BackendStatusBanner: React.FC<BackendStatusBannerProps> = ({ apiBase = 'http://localhost:8888' }) => {
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const checkHealth = async () => {
    setChecking(true);
    try {
      const resp = await fetch(`${apiBase}/`);
      setHealthy(resp.ok);
    } catch (e) {
      setHealthy(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const id = setInterval(checkHealth, 5000);
    return () => clearInterval(id);
  }, []);

  if (healthy) return null;

  return (
    <div style={{
      background: '#fff7ed',
      border: '1px solid #fdba74',
      color: '#9a3412',
      padding: '12px 16px',
      borderRadius: '8px',
      marginBottom: '16px'
    }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700 }}>后端下载服务未启动</div>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>请先在项目根目录运行 start_bili_service.bat 启动服务（默认端口: 8888）。</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={checkHealth} 
            disabled={checking}
            style={{
              background: '#fb923c',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: checking ? 'not-allowed' : 'pointer',
              opacity: checking ? 0.6 : 1
            }}
          >
            {checking ? '检测中...' : '重新检测'}
          </button>
        </div>
      </div>
    </div>
  );
};