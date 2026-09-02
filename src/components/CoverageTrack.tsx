import React, { useEffect, useState, useMemo } from 'react';
import type { CoverageFeature, BigwigEngine } from '../lib/bigwigEngine';

interface CoverageTrackProps {
  chrom: string;
  start: number;
  end: number;
  width: number;
  height: number;
  engine: BigwigEngine | null;
  color: string;
  trackStyles?: React.CSSProperties;
}

const CoverageTrack: React.FC<CoverageTrackProps> = ({ chrom, start, end, width, height, engine, color, trackStyles }) => {
  const windowBp = end - start;
  const [features, setFeatures] = useState<CoverageFeature[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!engine) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    // Fetch roughly 1 data point per pixel
    engine.query(chrom, start, end, Math.max(100, width))
      .then(data => {
        if (isMounted) {
          setFeatures(data);
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
  }, [chrom, start, end, width, engine]);

  // Compute SVG Polygon points
  const points = useMemo(() => {
    if (features.length === 0) return '';
    
    // Find max score for normalization
    let maxScore = 1;
    for (const f of features) {
      if (f.score > maxScore) maxScore = f.score;
    }

    let pointStr = `0,${height} `;
    
    for (const f of features) {
      const startPercent = Math.max(0, (f.start - start) / windowBp);
      const endPercent = Math.min(1, (f.end - start) / windowBp);
      
      const x1 = startPercent * width;
      const x2 = endPercent * width;
      const y = height - (f.score / maxScore) * height;
      
      // We draw a box for each bin
      pointStr += `${x1},${height} ${x1},${y} ${x2},${y} ${x2},${height} `;
    }
    
    pointStr += `${width},${height}`;
    return pointStr;
  }, [features, start, windowBp, width, height]);

  return (
    <div 
      className="relative shrink-0 border-t border-outline-variant/50 bg-surface-container overflow-hidden"
      style={{ height: `${height}px` }}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-surface-container/20">
          <span className="text-on-surface-variant text-[10px] animate-pulse">Loading coverage...</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <span className="text-error text-[10px]">Failed to load coverage</span>
        </div>
      )}
      {!engine && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <span className="text-on-surface-variant text-[10px] opacity-50">No BigWig loaded</span>
        </div>
      )}
      
      <div className="absolute inset-0 w-full h-full" style={trackStyles}>
        {features.length > 0 && width > 0 && (
          <svg className="w-full h-full pointer-events-none" preserveAspectRatio="none">
            <polygon points={points} fill={color} opacity="0.6" />
          </svg>
        )}
      </div>
    </div>
  );
};

export default CoverageTrack;
