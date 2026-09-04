import React, { useMemo } from 'react';
import type { ParsedVariant } from '../lib/vcfEngine';
import type { DisplayMode } from '../lib/webmcp';
import { computeVariantLayout } from '../lib/trackUtils';

export type { DisplayMode };

interface VariantTrackProps {
  variants: ParsedVariant[];
  start: number;
  end: number;
  width?: number;
  height: number;
  displayMode: DisplayMode;
  selectedVariantId: string | null;
  onSelectVariant: (variant: ParsedVariant) => void;
  trackStyles?: React.CSSProperties;
  color?: string;
  isLoading?: boolean;
  hasVcfLoaded?: boolean;
}

export const VariantTrack: React.FC<VariantTrackProps> = ({
  variants,
  start,
  end,
  width: _width,
  height,
  displayMode,
  selectedVariantId,
  onSelectVariant,
  trackStyles,
  color = '#61dbb4',
  isLoading = false,
  hasVcfLoaded = false,
}) => {
  const { layoutVariants, totalSubRows } = useMemo(() => {
    return computeVariantLayout(variants, start, end, displayMode);
  }, [variants, start, end, displayMode]);

  return (
    <div
      className="relative shrink-0 border-t border-outline-variant/50 bg-surface-container select-none"
      style={{ height: `${height}px` }}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-surface-container/60 pointer-events-none">
          <span className="text-on-surface-variant text-body-sm animate-pulse">Loading variants...</span>
        </div>
      )}

      {!hasVcfLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none gap-2 bg-surface-container-high/30">
          <span className="material-symbols-outlined text-on-surface-variant/50 text-[24px]">upload_file</span>
          <span className="text-on-surface-variant/80 text-body-sm font-medium">No Patient Data Loaded</span>
          <span className="text-on-surface-variant/60 text-[10px]">Click "Upload VCF" in the top right to overlay variants</span>
        </div>
      )}

      {hasVcfLoaded && !isLoading && variants.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <span className="text-on-surface-variant/60 text-body-sm text-[11px]">No variants matching active filters in this window</span>
        </div>
      )}

      <div className="absolute inset-0 w-full h-full" style={trackStyles}>
        {/* Baseline in collapsed or squished mode */}
        {displayMode === 'collapsed' && (
          <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[1px] bg-outline-variant/40" />
        )}

        {layoutVariants.map(({ variant, leftPercent, subRow, isHighQuality, type, af }) => {
          const isSelected = variant.id === selectedVariantId;

          // Collapsed Mode: 1D vertical density bars
          if (displayMode === 'collapsed') {
            return (
              <div
                key={variant.id}
                className="absolute top-1/2 -translate-y-1/2 group/variant cursor-pointer z-20"
                style={{ left: `${leftPercent}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectVariant(variant);
                }}
              >
                <div
                  className={`w-[2px] h-[16px] -translate-x-1/2 transition-all ${
                    isSelected
                      ? 'bg-secondary w-[3px] h-[20px] shadow-[0_0_8px_rgba(97,219,180,0.8)] z-30'
                      : isHighQuality
                      ? 'bg-primary opacity-80 hover:opacity-100'
                      : 'bg-secondary-fixed opacity-70 hover:opacity-100'
                  }`}
                  style={!isHighQuality && !isSelected && color ? { backgroundColor: color } : undefined}
                />
              </div>
            );
          }

          // Squished Mode: Compact 4px beads packed in sub-rows
          if (displayMode === 'squished') {
            const subRowHeight = Math.max(10, Math.min(14, (height - 12) / Math.max(1, totalSubRows)));
            const topOffset = Math.min(height - 10, 6 + subRow * subRowHeight);

            return (
              <div
                key={variant.id}
                className="absolute group/variant cursor-pointer z-20"
                style={{ left: `${leftPercent}%`, top: `${topOffset}px` }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectVariant(variant);
                }}
              >
                <div
                  className={`w-2 h-2 rotate-45 -translate-x-1/2 transition-transform ${
                    isSelected
                      ? 'bg-secondary scale-150 shadow-[0_0_8px_rgba(97,219,180,0.8)] z-30'
                      : isHighQuality
                      ? 'bg-primary shadow-[0_0_4px_rgba(200,200,200,0.5)]'
                      : 'bg-secondary-fixed'
                  }`}
                  style={!isHighQuality && !isSelected && color ? { backgroundColor: color } : undefined}
                />
              </div>
            );
          }

          // Expanded Mode: Needles and Diamond markers with rich hover cards
          const subRowHeight = Math.max(16, Math.min(24, (height - 20) / Math.max(1, totalSubRows)));
          const topOffset = Math.min(height - 16, 10 + subRow * subRowHeight);

          return (
            <div
              key={variant.id}
              className={`absolute group/variant cursor-pointer z-20 ${isSelected ? 'z-40' : ''}`}
              style={{ left: `${leftPercent}%`, top: `${topOffset}px` }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectVariant(variant);
              }}
            >
              {isHighQuality ? (
                <div
                  className={`w-3 h-3 bg-primary rotate-45 -translate-x-1/2 transition-transform ${
                    isSelected
                      ? 'shadow-[0_0_14px_rgba(200,200,200,0.9)] scale-125 ring-2 ring-primary/60'
                      : 'shadow-[0_0_8px_rgba(200,200,200,0.6)] group-hover/variant:scale-110'
                  }`}
                />
              ) : (
                <div
                  className={`w-2.5 h-2.5 bg-secondary-fixed rotate-45 -translate-x-1/2 transition-transform ${
                    isSelected
                      ? 'shadow-[0_0_12px_rgba(97,219,180,0.8)] scale-125 ring-2 ring-secondary/60'
                      : 'group-hover/variant:scale-110'
                  }`}
                  style={color ? { backgroundColor: color } : undefined}
                />
              )}

              {/* Selection Beam indicator */}
              {isSelected && (
                <div className="absolute top-1/2 -translate-y-1/2 left-0 -translate-x-1/2 w-[1px] h-[300px] bg-secondary/40 pointer-events-none -z-10" />
              )}

              {/* Hover Tooltip */}
              <div className="hidden group-hover/variant:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-tertiary-container text-on-surface p-2.5 rounded-lg shadow-2xl border border-outline-variant z-50 pointer-events-none">
                <p className="font-label-md text-xs font-bold mb-1 truncate text-on-surface">
                  {variant.id || `${variant.chrom}:${variant.pos}`}
                </p>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="px-1.5 py-0.2 rounded bg-surface-container text-[10px] font-code-sm font-semibold uppercase">
                    {type}
                  </span>
                  {isHighQuality ? (
                    <span className="text-[10px] text-primary font-semibold">High Quality</span>
                  ) : (
                    <span className="text-[10px] text-on-surface-variant">Low Quality</span>
                  )}
                </div>
                <p className="font-code-sm text-[10px] text-on-surface-variant">
                  {variant.ref} &gt; {variant.alt.join(', ')}
                </p>
                {af !== null && (
                  <p className="font-code-sm text-[10px] text-secondary mt-0.5">
                    AF: {(af * 100).toFixed(1)}%
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VariantTrack;
