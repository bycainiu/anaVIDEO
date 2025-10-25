
import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import type { ApiProvider, ApiSettings } from '../types';

type Role = 'admin' | 'user';

interface SettingsContextType {
  settings: ApiSettings;
  saveSettings: (newSettings: ApiSettings) => void;
  chatProvider: ApiProvider;
  setChatProvider: (provider: ApiProvider) => void;
  imageProvider: ApiProvider;
  setImageProvider: (provider: ApiProvider) => void;
  videoProvider: ApiProvider;
  setVideoProvider: (provider: ApiProvider) => void;
  role: Role;
  setRole: (role: Role) => void;
}

const defaultSettings: ApiSettings = {
    analysisPreset: '',
    gemini: { apiKey: process.env.API_KEY || '' },
    openai: { 
        apiKey: process.env.OPENAI_API_KEY || '', 
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1' 
    }
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<ApiSettings>(defaultSettings);
  const [chatProvider, setChatProvider] = useState<ApiProvider>('gemini');
  const [imageProvider, setImageProvider] = useState<ApiProvider>('gemini');
  const [videoProvider, setVideoProvider] = useState<ApiProvider>('gemini');
  const [role, setRole] = useState<Role>('admin');
  
  // Load settings from localStorage on initial render
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('apiSettings');
      if (savedSettings) {
        setSettings(prev => ({ ...prev, ...JSON.parse(savedSettings) }));
      }
      const savedChatProvider = localStorage.getItem('chatProvider');
      if (savedChatProvider) setChatProvider(savedChatProvider as ApiProvider);

      const savedImageProvider = localStorage.getItem('imageProvider');
      if (savedImageProvider) setImageProvider(savedImageProvider as ApiProvider);
      
      const savedVideoProvider = localStorage.getItem('videoProvider');
      if (savedVideoProvider) setVideoProvider(savedVideoProvider as ApiProvider);
      
      const savedRole = localStorage.getItem('appRole');
      if (savedRole) setRole(savedRole as Role);

    } catch (error) {
      console.error("Failed to load settings from localStorage", error);
    }
  }, []);

  const saveSettings = (newSettings: ApiSettings) => {
    setSettings(newSettings);
    localStorage.setItem('apiSettings', JSON.stringify(newSettings));
  };

  const handleSetChatProvider = (provider: ApiProvider) => {
      setChatProvider(provider);
      localStorage.setItem('chatProvider', provider);
  }

  const handleSetImageProvider = (provider: ApiProvider) => {
      setImageProvider(provider);
      localStorage.setItem('imageProvider', provider);
  }
  
  const handleSetVideoProvider = (provider: ApiProvider) => {
      setVideoProvider(provider);
      localStorage.setItem('videoProvider', provider);
  }

  const handleSetRole = (newRole: Role) => {
      setRole(newRole);
      localStorage.setItem('appRole', newRole);
  }

  return (
    <SettingsContext.Provider value={{ 
        settings, 
        saveSettings,
        chatProvider,
        setChatProvider: handleSetChatProvider,
        imageProvider,
        setImageProvider: handleSetImageProvider,
        videoProvider,
        setVideoProvider: handleSetVideoProvider,
        role,
        setRole: handleSetRole,
    }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
