
import React, { useState } from 'react';
import Lightbox from './Lightbox';

interface ThumbnailProps {
  frames: string[];
}

const Thumbnail: React.FC<ThumbnailProps> = ({ frames }) => {
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    
    const displayFrames = [...frames];
    while(displayFrames.length > 0 && displayFrames.length < 4) {
        displayFrames.push(...frames.slice(0, 4 - displayFrames.length));
    }

    if (displayFrames.length === 0) {
        return <div className="aspect-video bg-gray-700 flex items-center justify-center text-xs text-gray-500">No Frames</div>;
    }

  return (
    <>
      <div 
        className="grid grid-cols-2 grid-rows-2 aspect-video cursor-pointer group bg-black"
        onClick={() => setIsLightboxOpen(true)}
      >
        {displayFrames.slice(0, 4).map((frame, index) => (
          <div key={index} className="overflow-hidden aspect-square">
            <img 
              src={frame} 
              alt={`Thumbnail frame ${index + 1}`} 
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
            />
          </div>
        ))}
      </div>
      {isLightboxOpen && <Lightbox frames={displayFrames} onClose={() => setIsLightboxOpen(false)} />}
    </>
  );
};

export default Thumbnail;
