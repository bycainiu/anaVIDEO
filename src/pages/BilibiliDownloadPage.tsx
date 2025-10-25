import React from 'react';
import { BackendStatusBanner } from '../components/BackendStatusBanner';
import { BiliDownload } from '../components/BiliDownload/BiliDownload';

export const BilibiliDownloadPage: React.FC = () => {
  return (
    <div>
      <BackendStatusBanner />
      <BiliDownload />
    </div>
  );
};
