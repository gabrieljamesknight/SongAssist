import type { FC } from 'react';
import { Stem, StemIsolation } from '../types';

interface StemMixerProps {
  stemVolumes: Record<Stem, number>;
  onVolumeChange: (stem: Stem, volume: number) => void;
  activeIsolation: StemIsolation;
  onIsolationChange: (isolation: StemIsolation) => void;
  isSeparating: boolean;
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
      <div className="mt-6 grid grid-cols-3 gap-2">
        <button
          onClick={() => onIsolationChange('guitar')}
          disabled={isSeparating}
          className={`px-3 py-2 text-sm font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            activeIsolation === 'guitar'
              ? 'bg-teal-500 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
        >
          Guitar Only
        </button>
        <button
          onClick={() => onIsolationChange('full')}
          disabled={isSeparating}
          className={`px-3 py-2 text-sm font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            activeIsolation === 'full'
              ? 'bg-teal-500 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
        >
          Full Mix
        </button>
        <button
          onClick={() => onIsolationChange('backingTrack')}
          disabled={isSeparating}
          className={`px-3 py-2 text-sm font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            activeIsolation === 'backingTrack'
              ? 'bg-teal-500 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
        >
          No Guitar
        </button>
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
