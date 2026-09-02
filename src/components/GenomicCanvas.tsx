import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { ParsedVariant } from '../lib/vcfEngine';
import type { BigwigEngine } from '../lib/bigwigEngine';
import type { TrackConfig, DisplayMode } from '../lib/webmcp';
import { clampTrackHeight, DEFAULT_TRACK_CONFIGS } from '../lib/trackUtils';
import ReferenceTrack from './ReferenceTrack';
import GenesTrack from './GenesTrack';
import VariantTrack from './VariantTrack';
import CoverageTrack from './CoverageTrack';

const TRACK_ORDER = ['reference', 'rna', 'genes', 'variants', 'atac'];

interface GenomicCanvasProps {
  variants: ParsedVariant[];
  rawVariantsCount?: number;
  chrom: string;
  start: number;
  end: number;
  selectedVariantId: string | null;
  onSelectVariant: (variant: ParsedVariant) => void;
  isLoading: boolean;
  hasVcfLoaded?: boolean;
  sampleName?: string;
  onPanEnd?: (deltaBp: number) => void;
  onZoom?: (factor: number) => void;
  bigwigEngineRna?: BigwigEngine | null;
  bigwigEngineAtac?: BigwigEngine | null;
  tracksConfig?: Record<string, TrackConfig>;
  onSetTrackHeight?: (trackId: string, height: number) => void;
  onSetTrackDisplayMode?: (trackId: string | undefined, mode: DisplayMode) => void;
  onToggleTrackVisibility?: (trackId: string, visible?: boolean) => void;
  onResetTrackHeights?: () => void;
}

const CHROM_SIZES: Record<string, number> = {
  chr1: 248956422,
  chr2: 242193529,
  chr3: 198295559,
  chr4: 190214555,
  chr5: 181538259,
  chr6: 170805979,
  chr7: 159345973,
  chr8: 145138636,
  chr9: 138394717,
  chr10: 133797422,
  chr11: 135086622,
  chr12: 133275309,
  chr13: 114364328,
  chr14: 107043718,
  chr15: 101991189,
  chr16: 90338345,
  chr17: 83257441,
  chr18: 80373285,
  chr19: 58617616,
  chr20: 64444167,
  chr21: 46709983,
  chr22: 50818468,
  chrX: 156040895,
  chrY: 57227415,
};

export const GenomicCanvas: React.FC<GenomicCanvasProps> = ({
  variants,
  chrom,
  start,
  end,
  selectedVariantId,
  onSelectVariant,
  isLoading,
  hasVcfLoaded,
  sampleName,
  onPanEnd,
  onZoom,
  bigwigEngineRna,
  bigwigEngineAtac,
  tracksConfig = DEFAULT_TRACK_CONFIGS,
  onSetTrackHeight,
  onSetTrackDisplayMode,
  onToggleTrackVisibility,
  onResetTrackHeights,
}) => {
  const dataContainerRef = useRef<HTMLDivElement>(null);

  // Drag-panning and hover state
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(1000);

  // Interactive track menu popover state
  const [activeMenuTrackId, setActiveMenuTrackId] = useState<string | null>(null);

  // Interactive track vertical drag-resize state
  const [resizingTrackId, setResizingTrackId] = useState<string | null>(null);
  const [resizeStartY, setResizeStartY] = useState(0);
  const [resizeStartHeight, setResizeStartHeight] = useState(0);

  useEffect(() => {
    if (!dataContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setContainerWidth(entries[0].contentRect.width);
      }
    });
    observer.observe(dataContainerRef.current);
    setContainerWidth(dataContainerRef.current.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Global mouse move & up listeners for drag resizing
  useEffect(() => {
    if (!resizingTrackId) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - resizeStartY;
      const newHeight = clampTrackHeight(resizeStartHeight + deltaY);
      if (onSetTrackHeight) {
        onSetTrackHeight(resizingTrackId, newHeight);
      }
    };

    const handleWindowMouseUp = () => {
      setResizingTrackId(null);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [resizingTrackId, resizeStartY, resizeStartHeight, onSetTrackHeight]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (resizingTrackId) return;
    setIsDragging(true);
    setStartX(e.clientX);
    setDragOffset(0);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dataContainerRef.current) {
      const rect = dataContainerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x >= 0 && x <= rect.width) {
        setHoverX(x);
      } else {
        setHoverX(null);
      }
    }
    if (!isDragging) return;
    setDragOffset(e.clientX - startX);
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);

    if (Math.abs(dragOffset) > 10 && onPanEnd && containerWidth > 0) {
      const bpPerPixel = (end - start) / containerWidth;
      const deltaBp = Math.round(-dragOffset * bpPerPixel);
      onPanEnd(deltaBp);
    }
    setDragOffset(0);
  };

  const handleMouseLeave = () => {
    setHoverX(null);
    handleMouseUp();
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!onZoom) return;
    if (Math.abs(e.deltaY) > 10) {
      const zoomFactor = e.deltaY > 0 ? 1.5 : 0.6;
      onZoom(zoomFactor);
    }
  };

  const startResizeTrack = (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setResizingTrackId(trackId);
    setResizeStartY(e.clientY);
    setResizeStartHeight(tracksConfig[trackId]?.height || 96);
  };

  // Dynamic Ruler Generation
  const ticks = useMemo(() => {
    const windowBp = Math.max(1, end - start);
    let tickInterval = Math.pow(10, Math.floor(Math.log10(windowBp / 10)));
    if (windowBp / tickInterval > 20) tickInterval *= 5;
    else if (windowBp / tickInterval > 10) tickInterval *= 2;

    const firstTick = Math.ceil(start / tickInterval) * tickInterval;
    const tickList = [];
    for (let pos = firstTick; pos <= end; pos += tickInterval) {
      let label: string;
      if (tickInterval >= 1000000) {
        label = `${(pos / 1000000).toFixed(1)}M`;
      } else if (tickInterval >= 100000) {
        label = `${(pos / 1000000).toFixed(2)}M`;
      } else if (tickInterval >= 10000) {
        label = `${(pos / 1000000).toFixed(3)}M`;
      } else if (tickInterval >= 1000) {
        label = `${(pos / 1000).toFixed(2)}k`;
      } else {
        label = pos.toLocaleString();
      }
      tickList.push({
        pos,
        percent: ((pos - start) / windowBp) * 100,
        label,
      });
    }
    return tickList;
  }, [start, end]);

  // Ideogram calculations
  const chromSize = CHROM_SIZES[chrom] || 250000000;
  const ideoWindowStart = Math.max(0, Math.min(100, (start / chromSize) * 100));
  const ideoWindowWidth = Math.max(((end - start) / chromSize) * 100, 0.5);

  const trackStyles = {
    transform: `translateX(${dragOffset}px)`,
    transition: isDragging || resizingTrackId ? 'none' : 'transform 0.2s ease',
  };

  // Global Presets Handlers
  const handleApplyGlobalPreset = (preset: 'compact' | 'standard' | 'expanded') => {
    if (!onSetTrackHeight || !onSetTrackDisplayMode) return;
    if (preset === 'compact') {
      onSetTrackDisplayMode(undefined, 'squished');
      onSetTrackHeight('variants', 40);
      onSetTrackHeight('genes', 40);
      onSetTrackHeight('rna', 40);
      onSetTrackHeight('atac', 40);
      onSetTrackHeight('reference', 24);
    } else if (preset === 'standard') {
      onSetTrackDisplayMode(undefined, 'expanded');
      onSetTrackHeight('variants', 96);
      onSetTrackHeight('genes', 80);
      onSetTrackHeight('rna', 96);
      onSetTrackHeight('atac', 96);
      onSetTrackHeight('reference', 32);
    } else if (preset === 'expanded') {
      onSetTrackDisplayMode(undefined, 'expanded');
      onSetTrackHeight('variants', 180);
      onSetTrackHeight('genes', 160);
      onSetTrackHeight('rna', 160);
      onSetTrackHeight('atac', 160);
      onSetTrackHeight('reference', 32);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 flex-1 select-none">
      {/* Top Global Canvas View Preset Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1 bg-surface-container-low border border-outline-variant/60 rounded-md text-xs">
        <div className="flex items-center gap-2">
          <span className="font-label-md text-on-surface-variant font-semibold uppercase text-[10px] tracking-wider">
            View Presets:
          </span>
          <div className="flex items-center gap-1 bg-surface-container p-0.5 rounded border border-outline-variant/40">
            <button
              type="button"
              onClick={() => handleApplyGlobalPreset('compact')}
              className="px-2 py-0.5 rounded text-[11px] font-label-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
              title="Compact View (40px, Squished)"
            >
              Compact (40px)
            </button>
            <button
              type="button"
              onClick={() => handleApplyGlobalPreset('standard')}
              className="px-2 py-0.5 rounded text-[11px] font-label-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
              title="Standard View (Default Heights, Expanded)"
            >
              Standard (96px)
            </button>
            <button
              type="button"
              onClick={() => handleApplyGlobalPreset('expanded')}
              className="px-2 py-0.5 rounded text-[11px] font-label-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
              title="Expanded Detail (180px)"
            >
              Expanded (180px)
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-label-md text-on-surface-variant font-semibold uppercase text-[10px] tracking-wider">
            Display Density:
          </span>
          <div className="flex items-center gap-1 bg-surface-container p-0.5 rounded border border-outline-variant/40">
            {(['expanded', 'squished', 'collapsed'] as DisplayMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onSetTrackDisplayMode && onSetTrackDisplayMode(undefined, mode)}
                className="px-2 py-0.5 rounded text-[11px] font-label-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high capitalize transition-colors cursor-pointer"
                title={`Set all tracks to ${mode} mode`}
              >
                {mode}
              </button>
            ))}
          </div>

          {onResetTrackHeights && (
            <button
              type="button"
              onClick={onResetTrackHeights}
              className="px-2 py-0.5 rounded border border-outline-variant text-[11px] text-on-surface-variant hover:text-on-surface hover:bg-surface-container flex items-center gap-1 transition-colors cursor-pointer"
              title="Reset all track heights and modes to defaults"
            >
              <span className="material-symbols-outlined text-[13px]">restart_alt</span>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Master Canvas Workspace */}
      <div
        className="flex flex-1 border border-outline-variant rounded-lg overflow-hidden shadow-sm bg-surface-container relative"
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
      >
        {/* Left Column: Fixed Synchronized Track Labels & Menus */}
        <div className="w-[160px] flex flex-col border-r border-outline-variant bg-surface-container shrink-0 z-40 relative">
          {/* Header 0: Chromosome */}
          <div className="h-10 flex items-center px-3 border-b border-outline-variant/50 shrink-0">
            <span className="font-label-md text-[11px] text-on-surface font-bold">Chromosome</span>
          </div>

          {/* Header 1: Ruler contig label */}
          <div className="h-8 flex items-center justify-center border-b border-outline-variant shrink-0 bg-surface-container-high/40">
            <span className="font-code-sm text-[11px] text-secondary font-bold">{chrom}</span>
          </div>

          {/* Data Track Labels (Iterating over TRACK_ORDER) */}
          {TRACK_ORDER.map((trackId) => {
            const track = tracksConfig[trackId];
            if (!track || !track.visible) return null;

            // Specific subtitle
            const subtitle = trackId === 'rna' || trackId === 'atac'
              ? sampleName || track.subtitle
              : track.subtitle;

            return (
              <div
                key={trackId}
                className="relative group/label flex items-center justify-between px-3 border-t border-outline-variant/50 shrink-0 select-none bg-surface-container"
                style={{ height: `${track.height}px` }}
              >
                <div className="flex flex-col justify-center overflow-hidden pr-1">
                  <span className="font-label-md text-[11px] text-on-surface font-bold leading-tight truncate">
                    {track.label}
                  </span>
                  {subtitle && (
                    <span className="text-on-surface-variant font-normal text-[10px] leading-tight truncate">
                      ({subtitle})
                    </span>
                  )}
                  <span className="font-code-sm text-[9px] text-outline opacity-60">
                    {track.height}px · {track.displayMode}
                  </span>
                </div>

                {/* Track Quick Settings Button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuTrackId(activeMenuTrackId === trackId ? null : trackId);
                    }}
                    className={`p-1 rounded hover:bg-surface-container-high transition-all cursor-pointer ${
                      activeMenuTrackId === trackId ? 'bg-surface-container-highest text-secondary' : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                    title={`Configure ${track.label} track`}
                  >
                    <span className="material-symbols-outlined text-[15px]">tune</span>
                  </button>

                  {/* Per-Track Popover Menu */}
                  {activeMenuTrackId === trackId && (
                    <div
                      className="absolute left-full top-0 ml-2 w-56 bg-surface-container-low border border-outline-variant rounded-lg p-3 shadow-2xl z-50 flex flex-col gap-3 font-body-sm text-xs text-on-surface animate-fadeIn"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-between items-center border-b border-outline-variant/60 pb-1.5">
                        <strong className="font-label-md text-xs">{track.label} Track Config</strong>
                        <button
                          type="button"
                          onClick={() => setActiveMenuTrackId(null)}
                          className="text-on-surface-variant hover:text-on-surface text-xs cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Height Slider */}
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-on-surface-variant">Height:</span>
                          <span className="font-code-sm text-secondary font-bold">{track.height}px</span>
                        </div>
                        <input
                          type="range"
                          min={track.minHeight ?? 20}
                          max={track.maxHeight ?? 500}
                          value={track.height}
                          onChange={(e) => onSetTrackHeight && onSetTrackHeight(trackId, Number(e.target.value))}
                          className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-secondary"
                        />
                      </div>

                      {/* Height Presets */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-on-surface-variant font-semibold uppercase">Presets:</span>
                        <div className="grid grid-cols-3 gap-1">
                          <button
                            type="button"
                            onClick={() => onSetTrackHeight && onSetTrackHeight(trackId, 40)}
                            className="px-1.5 py-0.5 rounded bg-surface-container border border-outline-variant hover:bg-surface-container-high text-[10px] text-center cursor-pointer"
                          >
                            40px
                          </button>
                          <button
                            type="button"
                            onClick={() => onSetTrackHeight && onSetTrackHeight(trackId, track.defaultHeight)}
                            className="px-1.5 py-0.5 rounded bg-surface-container border border-outline-variant hover:bg-surface-container-high text-[10px] text-center cursor-pointer"
                          >
                            {track.defaultHeight}px
                          </button>
                          <button
                            type="button"
                            onClick={() => onSetTrackHeight && onSetTrackHeight(trackId, 180)}
                            className="px-1.5 py-0.5 rounded bg-surface-container border border-outline-variant hover:bg-surface-container-high text-[10px] text-center cursor-pointer"
                          >
                            180px
                          </button>
                        </div>
                      </div>

                      {/* Display Mode */}
                      {(track.type === 'vcf' || track.type === 'genes') && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-on-surface-variant font-semibold uppercase">Display Mode:</span>
                          <div className="grid grid-cols-3 gap-1">
                            {(['expanded', 'squished', 'collapsed'] as DisplayMode[]).map((mode) => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => onSetTrackDisplayMode && onSetTrackDisplayMode(trackId, mode)}
                                className={`px-1.5 py-0.5 rounded border text-[10px] capitalize transition-colors cursor-pointer ${
                                  track.displayMode === mode
                                    ? 'bg-secondary/20 text-secondary border-secondary/40 font-bold'
                                    : 'bg-surface-container text-on-surface-variant border-outline-variant hover:text-on-surface'
                                }`}
                              >
                                {mode}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Visibility Toggle */}
                      <button
                        type="button"
                        onClick={() => {
                          if (onToggleTrackVisibility) onToggleTrackVisibility(trackId);
                          setActiveMenuTrackId(null);
                        }}
                        className="px-2 py-1 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-[11px] border border-outline-variant flex items-center justify-between cursor-pointer"
                      >
                        <span>Hide Track</span>
                        <span className="material-symbols-outlined text-[14px]">visibility_off</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Bottom resize handle in left column */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-[4px] cursor-row-resize hover:bg-secondary/40 z-30 transition-colors"
                  onMouseDown={(e) => startResizeTrack(e, trackId)}
                  onDoubleClick={() => onSetTrackHeight && onSetTrackHeight(trackId, track.defaultHeight)}
                  title="Drag to resize height, double-click to reset"
                />
              </div>
            );
          })}
        </div>

        {/* Right Column: Scrollable Synchronized Data Tracks */}
        <div
          className="flex-1 flex flex-col overflow-hidden relative cursor-crosshair"
          ref={dataContainerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onWheel={handleWheel}
        >
          {/* ROW 0: Ideogram */}
          <div className="h-10 flex items-center px-4 border-b border-outline-variant/50 shrink-0 relative bg-surface-container">
            <div className="w-full h-3 rounded-full border border-outline-variant bg-surface-container-high relative overflow-hidden flex">
              <div className="h-full flex-1 border-r border-outline-variant/30" />
              <div className="h-full flex-1 border-r border-outline-variant/30 bg-surface-container" />
              <div className="h-full flex-1 border-r border-outline-variant/30" />
              <div className="h-full flex-[2] border-r border-outline-variant/30 bg-surface-container-highest" />
              <div className="h-full flex-1 border-r border-outline-variant/30 bg-surface-container" />
              <div className="h-full flex-1 border-r border-outline-variant/30" />

              {/* Current Window Highlight */}
              <div
                className="absolute top-0 bottom-0 border-2 border-error bg-error/20 rounded-[2px] shadow-[0_0_8px_rgba(255,180,171,0.6)] cursor-pointer z-10 min-w-[2px]"
                style={{ left: `${ideoWindowStart}%`, width: `${ideoWindowWidth}%` }}
                title={`${chrom}:${start.toLocaleString()}-${end.toLocaleString()}`}
              />
            </div>
          </div>

          {/* ROW 1: Ruler */}
          <div className="h-8 relative shrink-0 border-b border-outline-variant bg-surface-container">
            <div className="absolute inset-0 w-full h-full" style={trackStyles}>
              {ticks.map((tick) => (
                <div
                  key={tick.pos}
                  className="absolute bottom-0 flex flex-col items-center"
                  style={{ left: `${tick.percent}%`, transform: 'translateX(-50%)' }}
                >
                  <span className="font-code-sm text-[10px] text-on-surface-variant mb-1">{tick.label}</span>
                  <div className="w-[1px] h-1.5 bg-outline-variant" />
                </div>
              ))}
            </div>
          </div>

          {/* Data Tracks (Rendered strictly in TRACK_ORDER matching the left column) */}
          {TRACK_ORDER.map((trackId) => {
            const track = tracksConfig[trackId];
            if (!track || !track.visible) return null;

            return (
              <div key={trackId} className="relative shrink-0" style={{ height: `${track.height}px` }}>
                {trackId === 'reference' && (
                  <ReferenceTrack
                    chrom={chrom}
                    start={start}
                    end={end}
                    width={containerWidth}
                    trackStyles={trackStyles}
                  />
                )}

                {trackId === 'rna' && (
                  <CoverageTrack
                    chrom={chrom}
                    start={start}
                    end={end}
                    width={containerWidth}
                    height={track.height}
                    engine={bigwigEngineRna || null}
                    color={track.color || '#a0c0ff'}
                    trackStyles={trackStyles}
                  />
                )}

                {trackId === 'genes' && (
                  <GenesTrack
                    chrom={chrom}
                    start={start}
                    end={end}
                    width={containerWidth}
                    height={track.height}
                    displayMode={track.displayMode}
                    trackStyles={trackStyles}
                    color={track.color || '#a0c0ff'}
                  />
                )}

                {trackId === 'variants' && (
                  <VariantTrack
                    variants={variants}
                    start={start}
                    end={end}
                    width={containerWidth}
                    height={track.height}
                    displayMode={track.displayMode}
                    selectedVariantId={selectedVariantId}
                    onSelectVariant={onSelectVariant}
                    trackStyles={trackStyles}
                    color={track.color || '#61dbb4'}
                    isLoading={isLoading}
                    hasVcfLoaded={hasVcfLoaded}
                  />
                )}

                {trackId === 'atac' && (
                  <CoverageTrack
                    chrom={chrom}
                    start={start}
                    end={end}
                    width={containerWidth}
                    height={track.height}
                    engine={bigwigEngineAtac || null}
                    color={track.color || '#8cb1ff'}
                    trackStyles={trackStyles}
                  />
                )}

                {/* Bottom resize handle in right column */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-[4px] cursor-row-resize hover:bg-secondary/40 z-30 transition-colors"
                  onMouseDown={(e) => startResizeTrack(e, trackId)}
                  onDoubleClick={() => onSetTrackHeight && onSetTrackHeight(trackId, track.defaultHeight)}
                  title="Drag to resize height, double-click to reset"
                />
              </div>
            );
          })}

          {/* Interactive Global Crosshair */}
          {hoverX !== null && (
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-secondary z-50 pointer-events-none"
              style={{ left: hoverX, boxShadow: '0 0 8px rgba(97, 219, 180, 0.8)' }}
            >
              <div className="absolute top-10 left-2 bg-surface-container-high border border-outline-variant text-on-surface px-2 py-1 rounded shadow-lg text-[10px] font-code-sm whitespace-nowrap z-50">
                {chrom}:{Math.round(start + ((hoverX - dragOffset) * (end - start)) / containerWidth).toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GenomicCanvas;
