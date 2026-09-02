/**
 * RulerTrack.tsx
 * 
 * A sleek horizontal coordinate axis using JetBrains Mono.
 * Shows major and minor tick marks scaled to the current locus range.
 */
import React, { useMemo } from 'react';

interface RulerTrackProps {
  start: number;
  end: number;
  chrom: string;
  width: number;
}

function formatBp(pos: number): string {
  if (pos >= 1_000_000) return `${(pos / 1_000_000).toFixed(2)}M`;
  if (pos >= 1_000) return `${(pos / 1_000).toFixed(1)}K`;
  return pos.toString();
}

const RulerTrack: React.FC<RulerTrackProps> = ({ start, end, chrom, width }) => {
  const range = end - start;

  const ticks = useMemo(() => {
    const result: { pos: number; x: number; label: string; major: boolean }[] = [];
    
    // Calculate a nice tick interval
    const targetTickCount = Math.max(4, Math.min(20, Math.floor(width / 100)));
    const rawInterval = range / targetTickCount;
    
    // Round to a nice number
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
    let interval: number;
    const normalized = rawInterval / magnitude;
    if (normalized <= 1) interval = magnitude;
    else if (normalized <= 2) interval = 2 * magnitude;
    else if (normalized <= 5) interval = 5 * magnitude;
    else interval = 10 * magnitude;

    const firstTick = Math.ceil(start / interval) * interval;
    
    for (let pos = firstTick; pos <= end; pos += interval) {
      const x = ((pos - start) / range) * width;
      const isMajor = pos % (interval * 5) === 0 || interval >= range / 5;
      result.push({
        pos,
        x,
        label: formatBp(pos),
        major: isMajor,
      });
    }
    
    return result;
  }, [start, end, range, width]);

  return (
    <div className="ruler-track" style={{ width, position: 'relative', height: 36 }}>
      {/* Chromosome label */}
      <span className="ruler-chrom-label code-sm">{chrom}</span>
      
      {/* Baseline */}
      <div className="ruler-baseline" />
      
      {/* Ticks */}
      {ticks.map((tick, i) => (
        <div key={i} className="ruler-tick-group" style={{ left: tick.x }}>
          <div className={`ruler-tick ${tick.major ? 'major' : 'minor'}`} />
          {tick.major && (
            <span className="ruler-tick-label code-sm">{tick.label}</span>
          )}
        </div>
      ))}
    </div>
  );
};

export default RulerTrack;
