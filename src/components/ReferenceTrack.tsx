import React, { useEffect, useState } from 'react';
import { fetchSequence } from '../lib/ensemblApi';

interface ReferenceTrackProps {
  chrom: string;
  start: number;
  end: number;
  width: number;
  trackStyles?: React.CSSProperties;
}

const MAX_WINDOW_BP = 150;

const BASE_COLORS: Record<string, string> = {
  A: '#61dbb4', // Secondary
  T: '#ffb4ab', // Error
  C: '#8cb1ff', // Primary
  G: '#e5e1e6', // On-Surface
  N: '#49454f'  // Outline
};

const ReferenceTrack: React.FC<ReferenceTrackProps> = ({ chrom, start, end, width: _width, trackStyles }) => {
  const windowBp = end - start;
  const shouldRender = windowBp <= MAX_WINDOW_BP;
  const [sequence, setSequence] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldRender) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetchSequence(chrom, start, end)
      .then(seq => {
        if (isMounted) {
          setSequence(seq.toUpperCase());
          setIsLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err.message);
          setIsLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, [chrom, start, end, shouldRender]);

  if (!shouldRender) {
    return (
      <div className="h-6 relative shrink-0 border-b border-outline-variant/50 bg-surface-container flex items-center justify-center">
        <span className="font-code-sm text-[10px] text-on-surface-variant/50">Zoom in to &lt; {MAX_WINDOW_BP}bp to see reference sequence</span>
      </div>
    );
  }

  return (
    <div className="h-8 relative shrink-0 border-b border-outline-variant/50 bg-surface-container overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-surface-container/80">
          <span className="text-on-surface-variant text-[10px] animate-pulse">Fetching sequence...</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <span className="text-error text-[10px]">Failed to load sequence</span>
        </div>
      )}
      
      <div className="absolute inset-0 w-full h-full" style={trackStyles}>
        {sequence && sequence.split('').map((base, idx) => {
          const pos = start + idx;
          const percent = ((pos - start) / sequence.length) * 100;
          const blockWidth = (1 / sequence.length) * 100;
          
          return (
            <div 
              key={`${pos}-${idx}`} 
              className="absolute top-0 bottom-0 flex flex-col items-center justify-center border-r border-background/20"
              style={{ left: `${percent}%`, width: `${blockWidth}%`, backgroundColor: BASE_COLORS[base] || BASE_COLORS.N }}
              title={`${chrom}:${pos} - ${base}`}
            >
              <span className="font-code-sm text-[10px] font-bold text-background mix-blend-luminosity opacity-80">{base}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ReferenceTrack;
