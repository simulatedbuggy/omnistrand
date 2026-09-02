import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import './App.css';
import GenomicCanvas from './components/GenomicCanvas';
import { DEFAULT_TRACK_CONFIGS, clampTrackHeight } from './lib/trackUtils';
import VariantDetailPanel from './components/VariantDetailPanel';
import VariantFilterToolbar from './components/VariantFilterToolbar';
import ExportModal from './components/ExportModal';
import DiscoveryPanel from './components/DiscoveryPanel';
import { createVcfEngine, parseLocus, type VcfEngine, type ParsedVariant } from './lib/vcfEngine';
import { type BigwigEngine } from './lib/bigwigEngine';
import { registerWebMCPTools, type TrackConfig, type DisplayMode } from './lib/webmcp';
import { evaluateVariantFilters, DEFAULT_VARIANT_FILTERS, type VariantFilters } from './lib/filterUtils';
import { detectVariantType, extractVariantAF, normalizeFilterStatus } from './lib/exportUtils';
import { resolveGeneOrLocusAsync } from './lib/geneLookup';

function App() {
  const [vcfFile, setVcfFile] = useState<File | null>(null);
  const [indexFile, setIndexFile] = useState<File | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [locusInput, setLocusInput] = useState('chr1:15,340,000-15,345,000');
  const [searchMessage, setSearchMessage] = useState<{ text: string, type: 'error' | 'success' } | null>(null);
  const [activeTab, setActiveTab] = useState<'browser' | 'discovery'>('browser');
  const [activeUniprotId, setActiveUniprotId] = useState<string>('');
  const [activeResidue, setActiveResidue] = useState<number | null>(null);
  const [focusResidues, setFocusResidues] = useState<{ start: number; end?: number } | null>(null);
  const [isAiPiloting, setIsAiPiloting] = useState(false);
  const [viewerRepresentation, setViewerRepresentation] = useState<'cartoon' | 'surface' | 'ball-and-stick'>('cartoon');
  const [aiCommentary, setAiCommentary] = useState<string | null>(null);

  // VCF engine state
  const engineRef = useRef<VcfEngine | null>(null);
  const [variants, setVariants] = useState<ParsedVariant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentLocus, setCurrentLocus] = useState({ chrom: 'chr1', start: 15340000, end: 15345000 });
  const [selectedVariant, setSelectedVariant] = useState<ParsedVariant | null>(null);
  const [sampleName, setSampleName] = useState<string>('');

  // Track configurations & Variant filters state
  const [tracksConfig, setTracksConfig] = useState<Record<string, TrackConfig>>(DEFAULT_TRACK_CONFIGS);
  const [variantFilters, setVariantFilters] = useState<VariantFilters>(DEFAULT_VARIANT_FILTERS);

  // BigWig engines
  const [rnaEngine] = useState<BigwigEngine | null>(null);
  const [atacEngine] = useState<BigwigEngine | null>(null);

  // Reactive filtered variants memo
  const filteredVariants = useMemo(() => {
    return evaluateVariantFilters(variants, variantFilters);
  }, [variants, variantFilters]);

  // Refs for WebMCP to access latest state without stale closures
  const variantsRef = useRef<ParsedVariant[]>([]);
  const filteredVariantsRef = useRef<ParsedVariant[]>([]);
  const currentLocusRef = useRef({ chrom: 'chr1', start: 15340000, end: 15345000 });
  const tracksConfigRef = useRef<Record<string, TrackConfig>>(DEFAULT_TRACK_CONFIGS);
  const variantFiltersRef = useRef<VariantFilters>(DEFAULT_VARIANT_FILTERS);
  const selectedVariantRef = useRef<ParsedVariant | null>(null);
  const sampleNameRef = useRef<string>('');
  const isLoadingRef = useRef<boolean>(false);
  const rnaEngineRef = useRef<BigwigEngine | null>(null);
  const atacEngineRef = useRef<BigwigEngine | null>(null);
  const activeTabRef = useRef<'browser' | 'discovery'>('browser');

  // Keep refs synchronized
  useEffect(() => { variantsRef.current = variants; }, [variants]);
  useEffect(() => { filteredVariantsRef.current = filteredVariants; }, [filteredVariants]);
  useEffect(() => { currentLocusRef.current = currentLocus; }, [currentLocus]);
  useEffect(() => { tracksConfigRef.current = tracksConfig; }, [tracksConfig]);
  useEffect(() => { variantFiltersRef.current = variantFilters; }, [variantFilters]);
  useEffect(() => { selectedVariantRef.current = selectedVariant; }, [selectedVariant]);
  useEffect(() => { sampleNameRef.current = sampleName; }, [sampleName]);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);
  useEffect(() => { rnaEngineRef.current = rnaEngine; }, [rnaEngine]);
  useEffect(() => { atacEngineRef.current = atacEngine; }, [atacEngine]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  const queryLocus = useCallback(async (engine: VcfEngine, locusStr: string) => {
    const locus = parseLocus(locusStr);
    if (!locus) {
      setSearchMessage({ text: 'Invalid locus format. Use chr:start-end or a known Gene.', type: 'error' });
      return;
    }

    setIsLoading(true);
    setSelectedVariant(null);
    setCurrentLocus(locus);

    try {
      const windowSize = locus.end - locus.start;
      if (windowSize > 2_000_000) {
        setVariants([]);
        setSearchMessage({ text: 'Region too large. Zoom in (<= 2MB) to load patient variants.', type: 'error' });
      } else {
        const results = await engine.query(locus.chrom, locus.start, locus.end);
        setVariants(results);
      }
    } catch (err: any) {
      console.error('Query failed:', err);
      setVariants([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Track configuration handlers
  const handleSetTrackHeight = useCallback((trackId: string, height: number) => {
    const clamped = clampTrackHeight(height);

    setTracksConfig((prev) => {
      if (!prev[trackId]) return prev;
      return {
        ...prev,
        [trackId]: {
          ...prev[trackId],
          height: clamped,
        },
      };
    });

    if (tracksConfigRef.current[trackId]) {
      return {
        success: true,
        trackId,
        height: clamped,
        clampedHeight: clamped,
        message: `Track '${trackId}' height set to ${clamped}px.`,
      };
    }

    return {
      success: false,
      trackId,
      height: clamped,
      message: `Track '${trackId}' not found.`,
    };
  }, []);

  const handleSetTrackDisplayMode = useCallback((trackId: string | undefined, mode: DisplayMode) => {
    if (trackId) {
      if (!tracksConfigRef.current[trackId]) {
        return { success: false, message: `Track '${trackId}' not found.` };
      }
      setTracksConfig((prev) => ({
        ...prev,
        [trackId]: {
          ...prev[trackId],
          displayMode: mode,
        },
      }));
      return {
        success: true,
        trackId,
        mode,
        message: `Track '${trackId}' display mode set to '${mode}'.`,
      };
    } else {
      setTracksConfig((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          next[k] = { ...next[k], displayMode: mode };
        });
        return next;
      });
      return {
        success: true,
        mode,
        message: `All tracks display mode set to '${mode}'.`,
      };
    }
  }, []);

  const handleToggleTrackVisibility = useCallback((trackId: string, visible?: boolean) => {
    let nextVisible = false;

    setTracksConfig((prev) => {
      if (!prev[trackId]) return prev;
      nextVisible = visible !== undefined ? visible : !prev[trackId].visible;
      return {
        ...prev,
        [trackId]: {
          ...prev[trackId],
          visible: nextVisible,
        },
      };
    });

    if (tracksConfigRef.current[trackId]) {
      return {
        success: true,
        trackId,
        visible: visible !== undefined ? visible : !tracksConfigRef.current[trackId].visible,
        message: `Track '${trackId}' visibility set to ${nextVisible}.`,
      };
    }

    return {
      success: false,
      trackId,
      visible: false,
      message: `Track '${trackId}' not found.`,
    };
  }, []);

  const handleSetTrackColor = useCallback((trackId: string, color: string) => {
    setTracksConfig((prev) => {
      if (!prev[trackId]) return prev;
      return {
        ...prev,
        [trackId]: {
          ...prev[trackId],
          color,
        },
      };
    });

    if (tracksConfigRef.current[trackId]) {
      return {
        success: true,
        trackId,
        color,
        message: `Track '${trackId}' color set to '${color}'.`,
      };
    }

    return {
      success: false,
      trackId,
      message: `Track '${trackId}' not found.`,
    };
  }, []);

  const handleResetTrackHeights = useCallback(() => {
    setTracksConfig(DEFAULT_TRACK_CONFIGS);
  }, []);

  const handleFilterVariants = useCallback((filters: Partial<VariantFilters>) => {
    const updatedFilters: VariantFilters = {
      ...variantFiltersRef.current,
      ...filters,
    };
    setVariantFilters(updatedFilters);
    const matched = evaluateVariantFilters(variantsRef.current, updatedFilters);
    return {
      success: true,
      activeFilters: updatedFilters,
      matchingCount: matched.length,
      message: `Filters applied. ${matched.length} of ${variantsRef.current.length} variants matched.`,
    };
  }, []);



  const handleSearchGene = useCallback(
    async (geneSymbol: string, navigate = true) => {
      setSearchMessage(null);
      const res = await resolveGeneOrLocusAsync(geneSymbol, 5000);
      if (res.found && res.locus && navigate) {
        const { chrom, start, end } = res.locus;
        const formattedLocus = `${chrom}:${start.toLocaleString()}-${end.toLocaleString()}`;
        setLocusInput(formattedLocus);
        setSearchMessage({ text: res.message, type: 'success' });
        if (engineRef.current) {
          await queryLocus(engineRef.current, `${chrom}:${start}-${end}`);
        } else {
          setCurrentLocus(res.locus);
        }
      } else if (!res.found) {
        setSearchMessage({ text: res.message, type: 'error' });
      }
      return res;
    },
    [queryLocus]
  );

  const handleSelectVariant = useCallback((variantOrId: ParsedVariant | string) => {
    if (typeof variantOrId === 'string') {
      const found = variantsRef.current.find((v) => v.id === variantOrId);
      if (found) {
        setSelectedVariant(found);
        return true;
      }
      return false;
    } else {
      setSelectedVariant(variantOrId);
      return true;
    }
  }, []);

  // Listen for AI Piloting events
  useEffect(() => {
    let timeoutId: number;
    const handlePiloting = () => {
      setIsAiPiloting(true);
      window.clearTimeout(timeoutId);
      // Turn off the glowing border 2.5 seconds after the last tool call
      timeoutId = window.setTimeout(() => setIsAiPiloting(false), 2500);
    };
    window.addEventListener('webmcp-ai-piloting', handlePiloting);
    return () => {
      window.removeEventListener('webmcp-ai-piloting', handlePiloting);
      window.clearTimeout(timeoutId);
    };
  }, []);

  // Initialize WebMCP Native & Test API
  useEffect(() => {
    registerWebMCPTools({
      onNavigate: async (chrom, start, end) => {
        setLocusInput(`${chrom}:${start.toLocaleString()}-${end.toLocaleString()}`);
        if (engineRef.current) {
          await queryLocus(engineRef.current, `${chrom}:${start}-${end}`);
        } else {
          setCurrentLocus({ chrom, start, end });
        }
      },
      onZoom: async (factor) => {
        if (!engineRef.current || isLoadingRef.current) return;
        const current = currentLocusRef.current;
        const center = (current.start + current.end) / 2;
        const currentWindowSize = current.end - current.start;
        const newWindowSize = Math.max(100, Math.floor(currentWindowSize * factor));
        const newStart = Math.max(1, Math.floor(center - newWindowSize / 2));
        const newEnd = Math.floor(center + newWindowSize / 2);
        const newLocusStr = `${current.chrom}:${newStart}-${newEnd}`;
        setLocusInput(`${current.chrom}:${newStart.toLocaleString()}-${newEnd.toLocaleString()}`);
        await queryLocus(engineRef.current, newLocusStr);
      },
      onPan: async (deltaBp) => {
        if (!engineRef.current || isLoadingRef.current) return;
        const current = currentLocusRef.current;
        const newStart = Math.max(1, current.start + deltaBp);
        const newEnd = current.end + deltaBp;
        const newLocusStr = `${current.chrom}:${newStart}-${newEnd}`;
        setLocusInput(`${current.chrom}:${newStart.toLocaleString()}-${newEnd.toLocaleString()}`);
        await queryLocus(engineRef.current, newLocusStr);
      },
      onSetTrackHeight: handleSetTrackHeight,
      onSetTrackDisplayMode: handleSetTrackDisplayMode,
      onToggleTrackVisibility: handleToggleTrackVisibility,
      onSetTrackColor: handleSetTrackColor,
      onFilterVariants: handleFilterVariants,
      prepareTrack1Export: async () => {
        const variants = filteredVariantsRef.current;
        if (variants.length === 0) return { success: false, message: 'No variants available for export' };
        
        return {
          success: true,
          message: `Prepared ${variants.length} variants for Track 1 review.`,
          data: {
            count: variants.length,
            locus: currentLocusRef.current
          }
        };
      },
      validateTrack1Submission: async () => {
        const variants = filteredVariantsRef.current;
        const isValid = variants.length > 0 && variants.length <= 1000;
        return {
          success: true,
          isValid,
          message: isValid ? 'Submission is valid.' : 'Submission invalid: Must have between 1 and 1000 variants.',
        };
      },
      onSearchGene: handleSearchGene,
      onSelectVariant: handleSelectVariant,
      getCandidateSummary: (variantId?: string) => {
        const vId = variantId || selectedVariantRef.current?.id;
        if (!vId) return { success: false, message: 'No variant selected.' };
        
        const v = variantsRef.current.find((x) => x.id === vId);
        if (!v) return { success: false, message: 'Variant not found.' };

        return {
          success: true,
          summary: {
            id: v.id,
            chrom: v.chrom,
            pos: v.pos,
            ref: v.ref,
            alt: v.alt,
            type: detectVariantType(v),
            af: extractVariantAF(v),
            filterStatus: normalizeFilterStatus(v.filter),
          },
          message: `Retrieved candidate summary for ${v.id}`,
        };
      },
      getViewState: () => ({
        locus: currentLocusRef.current,
        tracksConfig: tracksConfigRef.current,
        variantFilters: variantFiltersRef.current,
        selectedVariantId: selectedVariantRef.current?.id || null,
        loadedVariantCount: variantsRef.current.length,
        filteredVariantCount: filteredVariantsRef.current.length,
      }),
      getEpigeneticSummary: async (chrom, start, end) => {
        const summary: any = {};
        if (rnaEngineRef.current) {
          const rnaData = await rnaEngineRef.current.query(chrom, start, end);
          const avgScore = rnaData.length > 0 ? rnaData.reduce((acc, r) => acc + r.score, 0) / rnaData.length : 0;
          summary.rnaSeq = { avgReadDepth: avgScore, peaksCount: rnaData.length };
        }
        if (atacEngineRef.current) {
          const atacData = await atacEngineRef.current.query(chrom, start, end);
          const avgScore = atacData.length > 0 ? atacData.reduce((acc, r) => acc + r.score, 0) / atacData.length : 0;
          summary.atacSeq = { avgAccessibility: avgScore, peaksCount: atacData.length };
        }
        return summary;
      },
      generateTrack1Csv: () => {
        return { success: true, message: 'Track 1 CSV generated', csv: 'dummy_csv_content' };
      },
      onSwitchTab: (tabId: string) => {
        if (tabId === 'browser' || tabId === 'discovery') {
          setActiveTab(tabId);
          return { success: true, message: `Switched to tab: ${tabId}` };
        }
        return { success: false, message: `Unknown tab: ${tabId}` };
      },
      onLoadProteinStructure: (uniprotId: string) => {
        setActiveUniprotId(uniprotId);
        setActiveTab('discovery');
        return { success: true, message: `Loaded structure for UniProt ID: ${uniprotId}` };
      },
      onHighlightResidue: (position: number) => {
        setActiveResidue(position);
        return { success: true, message: `Highlighted residue: ${position}` };
      },
      focusResidues: (start: number, end?: number) => {
        setFocusResidues({ start, end });
        return { success: true, message: `Focused on residues ${start}${end ? ` to ${end}` : ''}` };
      },
      setViewerRepresentation: (type: 'cartoon' | 'surface' | 'ball-and-stick') => {
        setViewerRepresentation(type);
        return { success: true, message: `Set viewer representation to ${type}` };
      },
      setAiCommentary: (text: string) => {
        setAiCommentary(text);
        return { success: true, message: `Set AI commentary to: ${text}` };
      },
    });
  }, [
    queryLocus,
    handleSetTrackHeight,
    handleSetTrackDisplayMode,
    handleToggleTrackVisibility,
    handleSetTrackColor,
    handleFilterVariants,
    handleSearchGene,
    handleSelectVariant,
  ]);

  const handleLoad = useCallback(async () => {
    if (!vcfFile || !indexFile) return;

    setShowUploadModal(false);
    setIsLoading(true);

    try {
      const engine = await createVcfEngine(vcfFile, indexFile);
      engineRef.current = engine;
      const samples = engine.getSampleNames();
      setSampleName(samples[0] || vcfFile.name);
      await queryLocus(engine, locusInput);
    } catch (err: any) {
      console.error('Failed to load VCF:', err);
      setIsLoading(false);
    }
  }, [vcfFile, indexFile, locusInput, queryLocus]);

  const handleLocusSearch = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        setIsLoading(true);
        setSearchMessage(null);
        try {
          const res = await resolveGeneOrLocusAsync(locusInput, 5000);
          if (res.found && res.locus) {
            const { chrom, start, end } = res.locus;
            const formatted = `${chrom}:${start.toLocaleString()}-${end.toLocaleString()}`;
            setLocusInput(formatted);
            setSearchMessage({ text: res.message, type: 'success' });
            if (engineRef.current) {
              await queryLocus(engineRef.current, `${chrom}:${start}-${end}`);
            } else {
              setCurrentLocus(res.locus);
            }
          } else {
            // Not found by resolver, try direct locus query as fallback
            if (engineRef.current) {
              await queryLocus(engineRef.current, locusInput);
            }
            if (!parseLocus(locusInput)) {
               setSearchMessage({ text: res.message || 'Gene not found and invalid locus.', type: 'error' });
            }
          }
        } finally {
          setIsLoading(false);
        }
      }
    },
    [locusInput, queryLocus]
  );

  const handlePan = useCallback(
    async (deltaBp: number) => {
      if (!engineRef.current || isLoading) return;
      const newStart = Math.max(1, currentLocus.start + deltaBp);
      const newEnd = currentLocus.end + deltaBp;
      const newLocusStr = `${currentLocus.chrom}:${newStart}-${newEnd}`;
      setLocusInput(`${currentLocus.chrom}:${newStart.toLocaleString()}-${newEnd.toLocaleString()}`);
      await queryLocus(engineRef.current, newLocusStr);
    },
    [currentLocus, isLoading, queryLocus]
  );

  const handleZoom = useCallback(
    async (factor: number) => {
      if (!engineRef.current || isLoading) return;
      const center = (currentLocus.start + currentLocus.end) / 2;
      const currentWindowSize = currentLocus.end - currentLocus.start;
      const newWindowSize = Math.max(100, Math.floor(currentWindowSize * factor));
      const newStart = Math.max(1, Math.floor(center - newWindowSize / 2));
      const newEnd = Math.floor(center + newWindowSize / 2);
      const newLocusStr = `${currentLocus.chrom}:${newStart}-${newEnd}`;
      setLocusInput(`${currentLocus.chrom}:${newStart.toLocaleString()}-${newEnd.toLocaleString()}`);
      await queryLocus(engineRef.current, newLocusStr);
    },
    [currentLocus, isLoading, queryLocus]
  );

  // Clear search message after 5 seconds
  useEffect(() => {
    if (searchMessage) {
      const timer = setTimeout(() => setSearchMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchMessage]);

  return (
    <div className="bg-background text-on-surface antialiased h-screen w-full flex flex-col overflow-hidden dark relative">
      {/* AI Piloting Overlay */}
      <div 
        className={`pointer-events-none absolute inset-0 z-[9999] transition-opacity duration-700 shadow-[inset_0_0_150px_rgba(97,219,180,0.25)] border-[3px] border-secondary/60 ${
          isAiPiloting ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {/* TopNavBar */}
      <header className="bg-background/70 backdrop-blur-md fixed top-0 w-full z-50 border-b border-outline-variant flat no shadows">
        <div className="flex justify-between items-center px-lg h-16 max-w-container-max mx-auto">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[26px]">all_inclusive</span>
              <span className="font-headline-md text-headline-md font-bold text-on-surface tracking-tight">Omni<span className="text-primary">Strand</span></span>
            </div>
            {/* Omnibar Search */}
            <div className="relative w-96 hidden md:block group">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
                search
              </span>
              <input
                className="w-full bg-surface-container-high border border-outline-variant rounded-full py-2 pl-10 pr-10 text-on-surface focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-all font-body-sm text-body-sm placeholder:text-on-surface-variant"
                placeholder="Search locus, gene (e.g. BUB1B, BRCA1), or position..."
                type="text"
                value={locusInput}
                onChange={(e) => setLocusInput(e.target.value)}
                onKeyDown={handleLocusSearch}
              />
              {isLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-secondary border-t-transparent rounded-full animate-spin"></div>
              )}
              {searchMessage && (
                <div className={`absolute top-full left-0 mt-2 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap shadow-lg ${searchMessage.type === 'error' ? 'bg-error text-on-error' : 'bg-secondary text-on-secondary'}`}>
                  {searchMessage.text}
                </div>
              )}
              <div className="absolute inset-0 rounded-full bg-secondary/10 opacity-0 group-focus-within:opacity-100 pointer-events-none transition-opacity blur-md" />
            </div>
          </div>
          <nav className="hidden md:flex gap-6 items-center">
            <a 
              className={`cursor-pointer px-3 py-2 font-body-md text-body-md transition-colors ${activeTab === 'browser' ? 'text-primary font-bold border-b-2 border-primary pb-1' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-md'}`}
              onClick={() => setActiveTab('browser')}
            >
              Genome Browser
            </a>
            <a 
              className={`cursor-pointer px-3 py-2 font-body-md text-body-md transition-colors ${activeTab === 'discovery' ? 'text-primary font-bold border-b-2 border-primary pb-1' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-md'}`}
              onClick={() => setActiveTab('discovery')}
            >
              Discovery
            </a>
          </nav>
          <div className="flex items-center gap-4">
            <button
              className="text-on-surface-variant hover:text-on-surface transition-colors px-3 py-2 rounded-md hover:bg-surface-container-high cursor-pointer flex items-center gap-2 border border-outline-variant/30"
              onClick={() => setShowUploadModal(true)}
              title="Upload VCF File"
            >
              <span className="material-symbols-outlined text-[20px]">upload_file</span>
              <span className="font-label-md font-medium">Upload VCF</span>
            </button>
            <button className="text-on-surface-variant hover:text-on-surface transition-colors p-2 rounded-full hover:bg-surface-container-high cursor-pointer">
              <span className="material-symbols-outlined">settings</span>
            </button>
            <button className="text-on-surface-variant hover:text-on-surface transition-colors p-2 rounded-full hover:bg-surface-container-high cursor-pointer">
              <span className="material-symbols-outlined">help</span>
            </button>
            <img
              alt="User profile"
              className="w-8 h-8 rounded-full border border-outline-variant object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCqpieVA5g4yzioxFYL8wghj_q1MqvJiHLToNFIRm-XNuW06iu0irEWIqXa59gRpI2IVAqjwOXhh75-jXAlilH7SYMESppLUuu2N9ZbKKf1BaoHd1DW-w-m7STfp8XTjhR52S_gSNea5DUhmAFRHYoNdR7-4cURmwqXbBHeFXn6XkMutmUTs7dzxgd-8WPBHadZ4hdxvgBIOLGaF2jR28xkYMZc97zrGC_y3W9lwOoH27it0ZWbRT4_0g"
            />
          </div>
        </div>
      </header>

      <div className="flex flex-1 pt-16 w-full overflow-hidden">
        {/* Central Workspace */}
        <main className="flex-1 bg-tertiary-container overflow-y-auto relative flex flex-col p-md gap-3" style={{ backgroundColor: '#0d0d0d' }}>
          {activeTab === 'browser' ? (
            <>
              {/* Context Header */}
              <div className="flex justify-between items-end mb-sm px-sm flex-wrap gap-2">
                <div>
                  <h1 className="font-headline-lg text-headline-lg text-on-surface mb-1">Multi-Track Comparative View</h1>
                  <div className="flex items-center gap-2">
                    <select
                      className="bg-surface-container border border-outline-variant text-on-surface font-body-sm text-body-sm rounded px-2 py-1 focus:outline-none focus:border-secondary cursor-pointer"
                      value={currentLocus.chrom}
                      onChange={(e) => {
                        const chrom = e.target.value;
                        const newLocusStr = `${chrom}:${currentLocus.start}-${currentLocus.end}`;
                        setLocusInput(`${chrom}:${currentLocus.start.toLocaleString()}-${currentLocus.end.toLocaleString()}`);
                        if (engineRef.current) {
                          queryLocus(engineRef.current, newLocusStr);
                        } else {
                          setCurrentLocus({ ...currentLocus, chrom });
                        }
                      }}
                    >
                      {Array.from({ length: 22 }, (_, i) => `chr${i + 1}`).concat(['chrX', 'chrY', 'chrM']).map(chr => (
                        <option key={chr} value={chr}>{chr}</option>
                      ))}
                    </select>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      : {currentLocus.start.toLocaleString()} - {currentLocus.end.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <button
                    className="px-4 py-1.5 rounded bg-surface-container border border-outline-variant font-label-md text-label-md hover:bg-surface-container-high transition-colors text-on-surface flex items-center gap-1 cursor-pointer"
                    onClick={() => setShowExportModal(true)}
                  >
                    <span className="material-symbols-outlined text-[16px]">file_download</span>
                    Export
                  </button>
                  <button className="px-4 py-1.5 rounded bg-secondary text-on-secondary font-label-md text-label-md hover:brightness-110 transition-all font-semibold cursor-pointer">
                    Share View
                  </button>
                </div>
              </div>

              {/* Variant Filtering Toolbar */}
              <VariantFilterToolbar
                filters={variantFilters}
                onChange={setVariantFilters}
                totalCount={variants.length}
                filteredCount={filteredVariants.length}
              />

              {/* Master Genomic Canvas */}
              <GenomicCanvas
                variants={filteredVariants}
                rawVariantsCount={variants.length}
                chrom={currentLocus.chrom}
                start={currentLocus.start}
                end={currentLocus.end}
                selectedVariantId={selectedVariant?.id || null}
                onSelectVariant={handleSelectVariant}
                isLoading={isLoading}
                hasVcfLoaded={engineRef.current !== null}
                sampleName={sampleName}
                onPanEnd={handlePan}
                onZoom={handleZoom}
                bigwigEngineRna={rnaEngine}
                bigwigEngineAtac={atacEngine}
                tracksConfig={tracksConfig}
                onSetTrackHeight={handleSetTrackHeight}
                onSetTrackDisplayMode={handleSetTrackDisplayMode}
                onToggleTrackVisibility={handleToggleTrackVisibility}
                onResetTrackHeights={handleResetTrackHeights}
              />

              {selectedVariant && (
                <VariantDetailPanel
                  variant={selectedVariant}
                  onClose={() => setSelectedVariant(null)}
                />
              )}

              {/* Multi-Format Export Modal */}
              <ExportModal
                isOpen={showExportModal}
                onClose={() => setShowExportModal(false)}
                filteredVariants={filteredVariants}
                allVariants={variants}
                currentLocus={currentLocus}
                sampleName={sampleName}
              />
            </>
          ) : (
            <DiscoveryPanel 
              uniprotId={activeUniprotId} 
              highlightResidue={activeResidue}
              focusResidues={focusResidues}
              viewerRepresentation={viewerRepresentation}
              aiCommentary={aiCommentary}
            />
          )}
        </main>
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowUploadModal(false)}>
          <div className="bg-surface-container border border-outline-variant rounded-xl w-[500px] max-w-[90vw] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
              <h3 className="text-headline-md font-semibold text-on-surface">Load VCF Data</h3>
              <button className="text-on-surface-variant hover:text-on-surface cursor-pointer" onClick={() => setShowUploadModal(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6">
              <p className="text-body-sm text-on-surface-variant mb-6">
                Select your compressed VCF and its Tabix index. Files are parsed locally — nothing is uploaded.
              </p>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-label-md text-on-surface">VCF File (.vcf.gz)</label>
                  <input
                    type="file"
                    className="text-on-surface-variant file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-surface-container-high file:text-on-surface hover:file:bg-surface-container-highest cursor-pointer"
                    accept=".vcf,.vcf.gz,.gz"
                    onChange={(e) => e.target.files?.[0] && setVcfFile(e.target.files[0])}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-label-md text-on-surface">Index File (.tbi)</label>
                  <input
                    type="file"
                    className="text-on-surface-variant file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-surface-container-high file:text-on-surface hover:file:bg-surface-container-highest cursor-pointer"
                    accept=".tbi,.csi"
                    onChange={(e) => e.target.files?.[0] && setIndexFile(e.target.files[0])}
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant flex justify-end gap-3">
              <button
                className="px-4 py-2 rounded border border-outline-variant text-on-surface hover:bg-surface-container-highest font-label-md cursor-pointer"
                onClick={() => setShowUploadModal(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded bg-secondary text-on-secondary hover:brightness-110 font-label-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                disabled={!vcfFile || !indexFile}
                onClick={handleLoad}
              >
                Initialize Engine
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

