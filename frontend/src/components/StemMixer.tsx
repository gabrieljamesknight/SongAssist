import type { FC } from 'react';
import { Stem, StemIsolation } from '../types';

interface StemMixerProps {
  stemVolumes: Record<Stem, number>;
  onVolumeChange: (stem: Stem, volume: number) => void;
  activeIsolation: StemIsolation;
  onIsolationChange: (isolation: StemIsolation) => void;
  isSeparating: boolean; // Renamed from isProcessing for clarity
}

const StemMixer: React.FC<StemMixerProps> = ({ 
  stemVolumes, 
  onVolumeChange, 
  activeIsolation, 
  onIsolationChange,
  isSeparating 
}) => {

  const stemControls = (
    <>
      <div className="space-y-4">
        {(['guitar', 'backingTrack'] as Stem[]).map((stem) => (
          <div key={stem}>
            <label className="capitalize mb-1 block text-sm font-medium text-gray-300">
              {stem === 'backingTrack' ? 'Backing Track' : 'Guitar'}
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={stemVolumes[stem]}
              onChange={(e) => onVolumeChange(stem, parseInt(e.target.value, 10))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
              disabled={isSeparating}
            />
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="bg-gray-800 p-6 rounded-xl shadow-lg">
      <h3 className="text-xl font-bold mb-4 text-white">Stem Mixer</h3>
      {isSeparating ? (
        <div className="text-center py-8">
          <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-3 text-gray-300">Separating stems...</p>
          <p className="text-xs text-gray-500">(This may take a minute)</p>
        </div>
      ) : (
        stemControls
      )}
    </div>
  );
};

export default StemMixer;
