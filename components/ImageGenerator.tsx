
import React, { useState } from 'react';
import type { ApiProvider, AspectRatio } from '../types';
import { DownloadIcon, ImageIcon, LoadingSpinner } from './common/Icons';
import { useLanguage } from '../contexts/LanguageContext';
import { useSettings } from '../contexts/SettingsContext';
import { generateImage } from '../services/apiService';

const aspectRatios: AspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "3:4"];

const ImageGenerator: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLanguage();
  const { settings, imageProvider, setImageProvider } = useSettings();

  const handleGenerate = async () => {
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setImageUrl(null);

    try {
      const generatedUrl = await generateImage(imageProvider, settings, prompt, aspectRatio);
      setImageUrl(generatedUrl);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6">
      <div className="lg:w-1/3 bg-gray-800 p-6 rounded-xl shadow-lg flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold mb-4 text-blue-400">{t('imgGenTitle')}</h2>
          <p className="text-gray-400">{t('imgGenDescription')}</p>
        </div>
        
        <div className="flex flex-col gap-2">
            <label htmlFor="image-provider" className="font-semibold text-gray-300">{t('provider')}</label>
            <select
              id="image-provider"
              value={imageProvider}
              onChange={(e) => setImageProvider(e.target.value as ApiProvider)}
              className="bg-gray-700 border border-gray-600 rounded-md py-2 px-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI Compatible</option>
            </select>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="prompt" className="font-semibold text-gray-300">{t('prompt')}</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('promptPlaceholder')}
            className="h-32 bg-gray-700 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="flex flex-col gap-2">
           <label className="font-semibold text-gray-300">{t('aspectRatio')}</label>
           <div className="grid grid-cols-3 gap-2">
              {aspectRatios.map(ar => (
                <button 
                  key={ar}
                  onClick={() => setAspectRatio(ar)}
                  className={`py-2 rounded-md text-sm font-medium transition-colors ${aspectRatio === ar ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                >
                  {ar}
                </button>
              ))}
           </div>
        </div>
        
        <button
          onClick={handleGenerate}
          disabled={isLoading || !prompt.trim()}
          className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg disabled:bg-gray-500 disabled:cursor-not-allowed hover:bg-blue-700 transition-all duration-200 transform hover:scale-105 flex items-center justify-center gap-2"
        >
          {isLoading ? <><LoadingSpinner /> {t('generating')}</> : t('generateImage')}
        </button>

        {error && <div className="bg-red-900/50 border border-red-500 text-red-300 p-3 rounded-lg text-center">{error}</div>}
      </div>

      <div className="flex-1 bg-gray-900/50 p-6 rounded-xl shadow-inner flex flex-col items-center justify-center">
        {isLoading && <LoadingSpinner size="lg" />}
        {!isLoading && !imageUrl && (
            <div className="text-center text-gray-500">
                <ImageIcon className="w-24 h-24 mx-auto mb-4" />
                <h3 className="text-xl font-semibold">{t('imgGenResultTitle')}</h3>
                <p>{t('imgGenResultSubtitle')}</p>
            </div>
        )}
        {imageUrl && (
            <div className="relative group w-full h-full">
                <img src={imageUrl} alt={prompt} className="w-full h-full object-contain rounded-lg" />
                <a 
                  href={imageUrl} 
                  download={`art-${Date.now()}.png`}
                  className="absolute bottom-4 right-4 bg-black bg-opacity-50 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  aria-label="Download Image"
                >
                  <DownloadIcon />
                </a>
            </div>
        )}
      </div>
    </div>
  );
};

export default ImageGenerator;
