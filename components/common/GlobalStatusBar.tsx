
import React from 'react';
import { useProcessing } from '../../contexts/ProcessingContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { LoadingSpinner } from './Icons';

const GlobalStatusBar: React.FC = () => {
    const { isProcessing, status, statusArgs, queueCount, totalCount } = useProcessing();
    const { t } = useLanguage();

    if (!isProcessing && queueCount === 0 && totalCount === 0) {
        return null; // Don't show the bar if nothing is happening and never has
    }

    let progress = 0;
    if(totalCount > 0){
        const currentItemProgress = isProcessing ? 0.5 : 1; // Assume 50% way through current item
        const completedCount = totalCount - queueCount - (isProcessing ? 1 : 0);
        progress = ((completedCount + currentItemProgress) / totalCount) * 100;
         if(status === 'statusComplete') progress = 100;
    }


    return (
        <div className="bg-gray-800 border-b border-gray-700 px-4 py-1.5 text-xs text-gray-300 shadow-md">
            <div className="max-w-7xl mx-auto flex items-center gap-4">
                <div className="flex items-center gap-2 flex-shrink-0 w-48">
                    {isProcessing ? <LoadingSpinner size="sm" /> : <div className="w-4 h-4"></div>}
                    <span className='font-bold uppercase tracking-wider'>{t('processingStatus')}:</span>
                </div>
                <div className="flex-1 flex items-center gap-4">
                    <div className="w-full bg-gray-600 rounded-full h-2.5">
                        <div 
                            className="bg-blue-500 h-2.5 rounded-full transition-all duration-500" 
                            style={{width: `${progress}%`}}
                        ></div>
                    </div>
                     <span className="text-gray-400 truncate w-96 text-right" title={t(status, ...statusArgs)}>
                        {t(status, ...statusArgs)}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default GlobalStatusBar;
