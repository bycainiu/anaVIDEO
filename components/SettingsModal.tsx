import React, { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useLanguage } from '../contexts/LanguageContext';
import type { ApiSettings } from '../types';

interface SettingsModalProps {
  onClose: () => void;
}

type ActiveTab = 'gemini' | 'openai' | 'analysis' | 'data';

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const { settings, saveSettings } = useSettings();
  const { t } = useLanguage();
  const [localSettings, setLocalSettings] = useState<ApiSettings>(settings);
  const [activeTab, setActiveTab] = useState<ActiveTab>('gemini');
  const [showSuccess, setShowSuccess] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSave = () => {
    saveSettings(localSettings);
    setShowSuccess(true);
    setTimeout(() => {
        setShowSuccess(false);
        onClose();
    }, 1500);
  };
  
  const handleInputChange = <P extends 'gemini' | 'openai'>(provider: P, field: keyof ApiSettings[P], value: string) => {
      setLocalSettings(prev => ({
          ...prev,
          [provider]: {
              ...prev[provider],
              [field]: value,
          }
      }));
  }

  const handlePresetChange = (value: string) => {
    setLocalSettings(prev => ({
        ...prev,
        analysisPreset: value
    }));
  };

  const tabClasses = (tabName: ActiveTab) => 
    `px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
        activeTab === tabName ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
    }`;


  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg">
        <div className="p-6 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-blue-400">{t('apiSettings')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </div>
        
        <div className="p-6">
            <div className="border-b border-gray-700 mb-6">
                <nav className="-mb-px flex space-x-2" aria-label="Tabs">
                    <button className={tabClasses('gemini')} onClick={() => setActiveTab('gemini')}>
                        {t('geminiSettings')}
                    </button>
                    <button className={tabClasses('openai')} onClick={() => setActiveTab('openai')}>
                        {t('openaiSettings')}
                    </button>
                    <button className={tabClasses('analysis')} onClick={() => setActiveTab('analysis')}>
                        {t('analysisSettings')}
                    </button>
                    <button className={tabClasses('data')} onClick={() => setActiveTab('data')}>
                        Backup
                    </button>
                </nav>
            </div>

            {activeTab === 'gemini' && (
                <div className="space-y-4">
                    <label className="block">
                        <span className="text-gray-300 font-semibold">{t('apiKey')}</span>
                        <input
                            type="text"
                            value={localSettings.gemini.apiKey}
                            onChange={(e) => handleInputChange('gemini', 'apiKey', e.target.value)}
                            placeholder={t('apiKeyPlaceholder')}
                            className="mt-1 block w-full bg-gray-800 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                    </label>
                </div>
            )}

            {activeTab === 'openai' && (
                <div className="space-y-4">
                    <label className="block">
                        <span className="text-gray-300 font-semibold">{t('apiKey')}</span>
                         <input
                            type="text"
                            value={localSettings.openai.apiKey}
                            onChange={(e) => handleInputChange('openai', 'apiKey', e.target.value)}
                            placeholder={t('apiKeyPlaceholder')}
                            className="mt-1 block w-full bg-gray-800 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                    </label>
                    <label className="block">
                        <span className="text-gray-300 font-semibold">{t('baseUrl')}</span>
                        <input
                            type="text"
                            value={localSettings.openai.baseUrl}
                            onChange={(e) => handleInputChange('openai', 'baseUrl', e.target.value)}
                            placeholder={t('baseUrlPlaceholder')}
                            className="mt-1 block w-full bg-gray-800 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                    </label>
                    <label className="block">
                        <span className="text-gray-300 font-semibold">Model Name (Optional)</span>
                        <input
                            type="text"
                            value={localSettings.openai.model || ''}
                            onChange={(e) => handleInputChange('openai', 'model', e.target.value)}
                            placeholder="gpt-4o (leave empty for default)"
                            className="mt-1 block w-full bg-gray-800 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                        <p className="text-xs text-gray-400 mt-1">Specify custom model name if your API uses different model names</p>
                    </label>
                </div>
            )}

            {activeTab === 'analysis' && (
                 <div className="space-y-4">
                    <label className="block">
                        <span className="text-gray-300 font-semibold">{t('analysisPreset')}</span>
                         <p className="text-xs text-gray-400 mt-1 mb-2">{t('analysisPresetDescription')}</p>
                         <textarea
                            value={localSettings.analysisPreset || ''}
                            onChange={(e) => handlePresetChange(e.target.value)}
                            placeholder={t('analysisPresetPlaceholder')}
                            className="mt-1 block w-full bg-gray-800 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 h-32 resize-y"
                        />
                    </label>
                </div>
            )}

            {activeTab === 'data' && (
                <div className="space-y-4">
                    <h3 className="text-gray-200 font-semibold">Backup & Restore</h3>
                    <div className="flex items-center gap-3">
                        <button
                          className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm"
                          onClick={async () => {
                            const { exportAllAnalyses } = await import('../services/storageService');
                            const blob = await exportAllAnalyses();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `anaVIDEO_backup_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                        >Export Analyses (JSON)</button>
                        <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={async (e) => {
                            if (!e.target.files || e.target.files.length === 0) return;
                            setImportBusy(true);
                            try {
                              const { importAnalyses } = await import('../services/storageService');
                              const count = await importAnalyses(e.target.files[0]);
                              alert(`Imported ${count} analyses. Please refresh the page to see changes.`);
                            } catch (err:any) {
                              alert(`Import failed: ${err.message || err}`);
                            } finally {
                              setImportBusy(false);
                              e.currentTarget.value = '';
                            }
                        }}/>
                        <button
                          className="px-3 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm disabled:opacity-50"
                          disabled={importBusy}
                          onClick={() => fileInputRef.current?.click()}
                        >{importBusy ? 'Importing...' : 'Import Analyses (JSON)'}
                        </button>
                        <button
                          className="px-3 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm"
                          onClick={async () => {
                            if (!confirm('This will permanently clear ALL local analyses and video files. Continue?')) return;
                            const { clearAllData } = await import('../services/storageService');
                            await clearAllData();
                            alert('All local data cleared.');
                          }}
                        >Clear All Local Data</button>
                    </div>
                    <p className="text-xs text-gray-400">Note: Export file does not include raw video files due to size. Videos remain in your browser storage.</p>
                </div>
            )}

             <p className="text-xs text-gray-500 mt-6">{t('settingsDisclaimer')}</p>
        </div>

        <div className="bg-gray-800/50 px-6 py-4 flex justify-end gap-4 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors">
            {t('close')}
          </button>
          <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors">
            {showSuccess ? t('settingsSaved') : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;