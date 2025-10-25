import React, { useState, useEffect, useRef } from 'react';

interface BiliLoginProps {
  onLogin: (cookies: Record<string, string>) => void;
}

export const BiliLogin: React.FC<BiliLoginProps> = ({ onLogin }) => {
  const [loginWindow, setLoginWindow] = useState<Window | null>(null);
  const [loginStatus, setLoginStatus] = useState<'idle' | 'waiting' | 'checking' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const checkIntervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (loginWindow && !loginWindow.closed) {
      checkIntervalRef.current = setInterval(async () => {
        try {
          const stored = localStorage.getItem('bili_login_cookies');
          if (stored) {
            const cookies = JSON.parse(stored);
            if (cookies.SESSDATA && cookies.DedeUserID) {
              if (checkIntervalRef.current) {
                clearInterval(checkIntervalRef.current);
              }
              
              setLoginStatus('checking');
              setStatusMessage('检测到登录信息，正在验证...');
              
              try {
                await onLogin(cookies);
                setLoginStatus('success');
                setStatusMessage('登录成功！');
                localStorage.removeItem('bili_login_cookies');
                
                if (loginWindow && !loginWindow.closed) {
                  loginWindow.close();
                }
                setLoginWindow(null);
              } catch (error) {
                setLoginStatus('error');
                setErrorMessage(error instanceof Error ? error.message : '登录失败');
              }
            }
          }
        } catch (error) {
          console.error('检查登录状态失败:', error);
        }
      }, 1500);
    }

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [loginWindow, onLogin]);

  const openLoginWindow = () => {
    const width = 600;
    const height = 750;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const loginPageHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>B站登录 - Cookie自动获取</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 20px;
      padding: 40px;
      max-width: 550px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    h2 {
      color: #2d3748;
      margin-bottom: 25px;
      text-align: center;
      font-size: 24px;
    }
    .info-box {
      background: #e3f2fd;
      border-left: 4px solid #2196f3;
      padding: 15px;
      margin: 20px 0;
      border-radius: 8px;
      font-size: 14px;
      line-height: 1.6;
    }
    .warning-box {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.6;
    }
    .input-group {
      margin: 15px 0;
    }
    .input-group label {
      display: block;
      margin-bottom: 8px;
      color: #4a5568;
      font-weight: 600;
      font-size: 14px;
    }
    .input-group input {
      width: 100%;
      padding: 12px;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      font-size: 14px;
      transition: border-color 0.3s;
    }
    .input-group input:focus {
      outline: none;
      border-color: #00a1d6;
    }
    .input-group small {
      display: block;
      margin-top: 5px;
      color: #718096;
      font-size: 12px;
    }
    .btn-group {
      display: flex;
      gap: 10px;
      margin-top: 25px;
    }
    .btn {
      flex: 1;
      padding: 14px;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary {
      background: linear-gradient(135deg, #00a1d6, #0091c2);
      color: white;
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 161, 214, 0.4);
    }
    .btn-secondary {
      background: #e2e8f0;
      color: #4a5568;
    }
    .btn-secondary:hover {
      background: #cbd5e0;
    }
    #status {
      margin-top: 20px;
      padding: 12px;
      border-radius: 8px;
      text-align: center;
      font-size: 14px;
      display: none;
    }
    #status.success {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
      display: block;
    }
    #status.error {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
      display: block;
    }
    #status.info {
      background: #d1ecf1;
      color: #0c5460;
      border: 1px solid #bee5eb;
      display: block;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>🎬 B站登录 Cookie 获取</h2>
    
    <div class="info-box">
      <strong>📋 操作步骤：</strong><br>
      1. 在新标签页打开 <a href="https://www.bilibili.com" target="_blank" style="color: #00a1d6;">bilibili.com</a> 并登录<br>
      2. 按 <strong>F12</strong> 打开开发者工具<br>
      3. 选择 <strong>Application</strong> (或 存储) 标签<br>
      4. 左侧找到 <strong>Cookies → https://www.bilibili.com</strong><br>
      5. 复制对应的 Cookie 值到下方输入框
    </div>

    <div class="warning-box">
      ⚠️ <strong>必填项：</strong>SESSDATA 和 DedeUserID<br>
      其他项可选填，但填写完整可提高成功率
    </div>

    <div class="input-group">
      <label>SESSDATA <span style="color: #e53e3e;">*</span></label>
      <input type="text" id="sessdata" placeholder="从开发者工具中复制">
      <small>必需：用于身份验证</small>
    </div>

    <div class="input-group">
      <label>DedeUserID <span style="color: #e53e3e;">*</span></label>
      <input type="text" id="dedeuserid" placeholder="从开发者工具中复制">
      <small>必需：用户ID</small>
    </div>

    <div class="input-group">
      <label>DedeUserID__ckMd5</label>
      <input type="text" id="ckmd5" placeholder="可选">
      <small>可选：建议填写以提高稳定性</small>
    </div>

    <div class="input-group">
      <label>bili_jct</label>
      <input type="text" id="bilijct" placeholder="可选">
      <small>可选：用于特定操作</small>
    </div>

    <div class="btn-group">
      <button class="btn btn-secondary" onclick="window.close()">取消</button>
      <button class="btn btn-primary" onclick="submitCookies()">✅ 提交登录</button>
    </div>

    <div id="status"></div>
  </div>

  <script>
    function submitCookies() {
      const statusDiv = document.getElementById('status');
      statusDiv.className = 'info';
      statusDiv.textContent = '正在验证Cookie...';

      const sessdata = document.getElementById('sessdata').value.trim();
      const dedeuserid = document.getElementById('dedeuserid').value.trim();
      const ckmd5 = document.getElementById('ckmd5').value.trim();
      const bilijct = document.getElementById('bilijct').value.trim();

      if (!sessdata || !dedeuserid) {
        statusDiv.className = 'error';
        statusDiv.textContent = '❌ 请至少填写 SESSDATA 和 DedeUserID';
        return;
      }

      const cookies = {
        SESSDATA: sessdata,
        DedeUserID: dedeuserid,
        'DedeUserID__ckMd5': ckmd5,
        bili_jct: bilijct
      };

      try {
        localStorage.setItem('bili_login_cookies', JSON.stringify(cookies));
        statusDiv.className = 'success';
        statusDiv.textContent = '✅ Cookie已保存，正在返回主窗口...';
        
        setTimeout(() => {
          window.close();
        }, 1500);
      } catch (error) {
        statusDiv.className = 'error';
        statusDiv.textContent = '❌ 保存失败: ' + error.message;
      }
    }

    // 支持回车提交
    document.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        submitCookies();
      }
    });

    // 自动聚焦第一个输入框
    document.getElementById('sessdata').focus();
  </script>
</body>
</html>`;

    const blob = new Blob([loginPageHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const newWindow = window.open(url, 'BiliLogin', `width=${width},height=${height},left=${left},top=${top}`);

    if (!newWindow) {
      setLoginStatus('error');
      setErrorMessage('无法打开登录窗口，请检查浏览器弹窗设置');
      return;
    }

    setLoginWindow(newWindow);
    setLoginStatus('waiting');
    setStatusMessage('等待在弹窗中输入Cookie...');
    setErrorMessage('');
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px', padding: '20px' }}>
      <div style={{ background: 'white', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', overflow: 'hidden', width: '100%', maxWidth: '650px', border: '1px solid #e2e8f0' }}>
        <div style={{ background: 'linear-gradient(135deg, #00a1d6, #00b5e5)', color: 'white', padding: '30px', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '24px', fontWeight: 700 }}>🎬 登录B站账号</h3>
          <p style={{ margin: 0, opacity: 0.95, fontSize: '14px' }}>通过Cookie方式登录，安全可靠</p>
        </div>
        <div style={{ padding: '30px' }}>
          {loginStatus === 'idle' && (
            <div>
              <div style={{ marginBottom: '25px' }}>
                <div style={{ background: '#f0f9ff', padding: '20px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #bae6fd' }}>
                  <div style={{ fontSize: '14px', color: '#0c4a6e', lineHeight: '1.8' }}>
                    <strong style={{ display: 'block', marginBottom: '10px', fontSize: '15px' }}>💡 登录说明：</strong>
                    由于浏览器安全限制，无法自动读取bilibili.com的Cookie。<br/>
                    您需要手动从B站网站复制Cookie信息。<br/>
                    <br/>
                    <strong>这是最安全的方式</strong>，您的登录信息不会经过第三方。
                  </div>
                </div>
                {[1, 2, 3].map(num => (
                  <div key={num} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '15px', padding: '16px', background: '#f8fafc', borderRadius: '10px', borderLeft: '4px solid #00a1d6' }}>
                    <span style={{ background: '#00a1d6', color: 'white', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold', marginRight: '15px', flexShrink: 0 }}>{num}</span>
                    <span style={{ fontSize: '15px', color: '#2d3748', lineHeight: '1.6' }}>
                      {num === 1 && '点击下方按钮打开Cookie输入窗口'}
                      {num === 2 && '按窗口中的指引，从B站网站复制Cookie'}
                      {num === 3 && '粘贴到输入框并提交，窗口会自动关闭'}
                    </span>
                  </div>
                ))}
              </div>
              <button onClick={openLoginWindow} style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg, #00a1d6, #0091c2)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 15px rgba(0, 161, 214, 0.3)', transition: 'transform 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                🚀 开始登录
              </button>
            </div>
          )}
          {loginStatus === 'waiting' && loginWindow && (
            <div style={{ textAlign: 'center', padding: '40px 20px', background: '#fef3c7', borderRadius: '12px', border: '1px solid #fde68a' }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>⏳</div>
              <div style={{ color: '#78350f', fontSize: '16px', marginBottom: '10px', fontWeight: 500 }}>{statusMessage}</div>
              <div style={{ color: '#92400e', fontSize: '14px', lineHeight: '1.6' }}>
                请在弹出窗口中按提示操作<br/>
                窗口保持打开状态，提交后会自动关闭
              </div>
            </div>
          )}
          {loginStatus === 'checking' && (
            <div style={{ textAlign: 'center', padding: '40px 20px', background: '#dbeafe', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔄</div>
              <div style={{ color: '#1e40af', fontSize: '16px', fontWeight: 500 }}>{statusMessage}</div>
            </div>
          )}
          {loginStatus === 'success' && (
            <div style={{ textAlign: 'center', padding: '40px 20px', background: '#d1fae5', borderRadius: '12px', border: '1px solid #a7f3d0' }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
              <div style={{ color: '#065f46', fontSize: '18px', fontWeight: 600, marginBottom: '10px' }}>{statusMessage}</div>
              <div style={{ color: '#047857', fontSize: '14px' }}>现在可以开始下载视频了</div>
            </div>
          )}
          {loginStatus === 'error' && (
            <div style={{ padding: '20px', background: '#fee2e2', borderRadius: '12px', border: '1px solid #fecaca' }}>
              <div style={{ color: '#991b1b', fontSize: '14px', marginBottom: '15px', fontWeight: 500 }}>❌ {errorMessage}</div>
              <button onClick={() => { setLoginStatus('idle'); setLoginWindow(null); setErrorMessage(''); }} style={{ width: '100%', padding: '12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>重试登录</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
