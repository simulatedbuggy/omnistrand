import React, { useEffect, useState, useMemo } from 'react';
import { fetchGenes, type EnsemblGene } from '../lib/ensemblApi';
import type { DisplayMode } from '../lib/webmcp';
import { computeGeneLayout } from '../lib/trackUtils';

interface GenesTrackProps {
  chrom: string;
  start: number;
  end: number;
  width?: number;
  height: number;
  displayMode: DisplayMode;
  trackStyles?: React.CSSProperties;
  color?: string;
}

export const GenesTrack: React.FC<GenesTrackProps> = ({
  chrom,
  start,
  end,
  width: _width,
  height,
  displayMode,
  trackStyles,
  color = '#a0c0ff',
}) => {
  const windowBp = Math.max(1, end - start);
  const [genes, setGenes] = useState<EnsemblGene[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only fetch genes if the window is reasonable, e.g., < 2MB to avoid massive API payloads
    if (windowBp > 2000000) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetchGenes(chrom, start, end)
      .then((data) => {
        if (isMounted) {
          setGenes(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [chrom, start, end, windowBp]);

  const { positionedGenes, rowHeight } = useMemo(() => {
    return computeGeneLayout(genes, start, end, displayMode);
  }, [genes, start, end, displayMode]);

  if (windowBp > 2000000) {
    return (
      <div
        className="relative shrink-0 border-t border-outline-variant/50 pointer-events-none flex items-center justify-center bg-surface-container"
        style={{ height: `${height}px` }}
      >
        <span className="font-code-sm text-[10px] text-on-surface-variant/50">Zoom in to &lt; 2MB to see genes</span>
      </div>
    );
  }

  return (
    <div
      className="relative shrink-0 border-t border-outline-variant/50 bg-surface-container select-none"
      style={{ height: `${height}px` }}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-surface-container/50 pointer-events-none">
          <span className="text-on-surface-variant text-[10px] animate-pulse">Loading genes...</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <span className="text-error text-[10px]">Failed to load genes</span>
        </div>
      )}

      <div className="absolute inset-0 w-full h-full" style={trackStyles}>
        {positionedGenes.map(({ gene, rowIndex }) => {
          const leftPercent = Math.max(0, ((gene.start - start) / windowBp) * 100);
          const rightPercent = Math.min(100, ((gene.end - start) / windowBp) * 100);
          const widthPercent = Math.max(0.1, rightPercent - leftPercent);

          const topPos = displayMode === 'collapsed'
            ? height / 2 - 4
            : Math.min(height - 16, rowIndex * rowHeight + 14);

          const boxHeight = displayMode === 'collapsed' ? 6 : displayMode === 'squished' ? 4 : 8;

          return (
            <div
              key={gene.id}
              className="absolute group/gene cursor-pointer"
              style={{
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
                top: `${topPos}px`,
                height: `${displayMode === 'squished' ? 12 : 16}px`,
              }}
            >
              {/* Central intron line */}
              <div
                className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[2px] opacity-50 group-hover/gene:opacity-100 transition-opacity"
                style={{ backgroundColor: color }}
              />

              {/* Exon / Gene body box */}
              <div
                className="absolute top-1/2 -translate-y-1/2 left-0 right-0 rounded-[1px] border group-hover/gene:brightness-125 transition-all"
                style={{
                  height: `${boxHeight}px`,
                  backgroundColor: color,
                  borderColor: color,
                  opacity: displayMode === 'collapsed' ? 0.7 : 0.9,
                }}
              />

              {/* Gene label (hidden on canvas in collapsed mode) */}
              {displayMode !== 'collapsed' && (
                <span
                  className="absolute top-[-13px] left-0 font-code-sm text-on-surface-variant whitespace-nowrap opacity-70 group-hover/gene:opacity-100 group-hover/gene:text-on-surface transition-opacity"
                  style={{ fontSize: displayMode === 'squished' ? '8px' : '9px' }}
                >
                  {gene.display_name || gene.id} {gene.strand === 1 ? '→' : '←'}
                </span>
              )}

              {/* Hover Tooltip */}
              <div className="hidden group-hover/gene:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 bg-tertiary-container text-on-surface p-2 rounded-lg shadow-xl border border-outline-variant z-50 pointer-events-none">
                <p className="font-label-md text-xs font-bold truncate">{gene.display_name || gene.id}</p>
                <p className="font-body-sm text-[10px] text-on-surface-variant mt-0.5">{gene.id}</p>
                <p className="font-body-sm text-[10px] text-on-surface-variant capitalize">
                  {gene.biotype.replace(/_/g, ' ')}
                </p>
                <p className="font-code-sm text-[9px] text-secondary mt-0.5">
                  {gene.start.toLocaleString()} - {gene.end.toLocaleString()} ({gene.strand === 1 ? 'Forward' : 'Reverse'})
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GenesTrack;
