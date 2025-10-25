
import React from 'react';

interface LightboxProps {
  frames: string[];
  onClose: () => void;
}

const Lightbox: React.FC<LightboxProps> = ({ frames, onClose }) => {
  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="grid grid-cols-2 grid-rows-2 gap-1 w-full max-w-2xl aspect-video"
        onClick={e => e.stopPropagation()} // Prevent closing when clicking on the image grid
      >
        {frames.slice(0, 4).map((frame, index) => (
          <div key={index} className="overflow-hidden bg-gray-900">
            <img 
              src={frame} 
              alt={`Enlarged frame ${index + 1}`} 
              className="w-full h-full object-contain"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default Lightbox;
