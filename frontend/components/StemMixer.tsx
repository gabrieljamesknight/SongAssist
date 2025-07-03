
import React from 'react';
import { Stem, ALL_STEMS, StemIsolation } from '../types';

interface StemMixerProps {
  stemVolumes: Record<Stem, number>;
  onVolumeChange: (stem: Stem, volume: number) => void;
  activeIsolation: StemIsolation;
  onIsolationChange: (isolation: StemIsolation) => void;
}

const StemMixer: React.FC<StemMixerProps> = ({ stemVolumes, onVolumeChange, activeIsolation, onIsolationChange }) => {
  const getStemLabel = (stem: Stem) => {
    if (stem === 'backingTrack') return 'Rest of Song';
    return stem.charAt(0).toUpperCase() + stem.slice(1);
  };
  
  return (
    <div className="bg-gray-800 p-6 rounded-xl shadow-lg">
      <h3 className="text-xl font-bold text-white mb-4">Stem Mixer</h3>
      <div className="space-y-4 mb-6">
        {ALL_STEMS.map((stem) => (
          <div key={stem} className="grid grid-cols-4 items-center gap-4">
            <label htmlFor={`${stem}-volume`} className="text-gray-300 col-span-1 capitalize">{getStemLabel(stem)}</label>
            <input
              id={`${stem}-volume`}
              type="range"
              min="0"
              max="100"
              value={stemVolumes[stem]}
              onChange={(e) => onVolumeChange(stem, Number(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer col-span-2"
            />
            <span className="text-gray-400 text-sm text-right">{stemVolumes[stem]}%</span>
          </div>
        ))}
      </div>
       <div className="border-t border-gray-700 pt-4">
        <h4 className="text-lg font-semibold text-white mb-3">Quick Isolation</h4>
        <div className="flex space-x-2">
            <button 
                onClick={() => onIsolationChange('full')} 
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition ${activeIsolation === 'full' ? 'bg-teal-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
                Full Mix
            </button>
             <button 
                onClick={() => onIsolationChange('guitar_only')} 
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition ${activeIsolation === 'guitar_only' ? 'bg-teal-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
                Guitar Only
            </button>
             <button 
                onClick={() => onIsolationChange('no_guitar')} 
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition ${activeIsolation === 'no_guitar' ? 'bg-teal-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
                No Guitar
            </button>
        </div>
      </div>
    </div>
  );
};

export default StemMixer;