
import React, { createContext, useContext } from 'react';

interface ProcessingContextType {
  isProcessing: boolean;
  status: string;
  statusArgs: any[];
  queueCount: number;
  totalCount: number;
  addToQueue: (files: File[]) => void;
}

export const ProcessingContext = createContext<ProcessingContextType | undefined>(undefined);

export const useProcessing = (): ProcessingContextType => {
  const context = useContext(ProcessingContext);
  if (!context) {
    throw new Error('useProcessing must be used within a ProcessingProvider');
  }
  return context;
};
