/**
 * src/lib/webmcp.ts
 * 
 * WebMCP Toolset Registration & Dispatcher.
 * Exposes core IGV researcher tools to AI/LLM agents via:
 * 1. document.modelContext (Native WebMCP)
 * 2. window.__webmcp_tools__ and window.invokeWebMCPTool (Polyfill & Test Harness)
 */

import type { VariantFilters } from './filterUtils';
import type { GeneLookupResult } from './geneLookup';

export type DisplayMode = 'expanded' | 'squished' | 'collapsed';

export interface TrackConfig {
  id: string;
  label: string;
  subtitle?: string;
  type: 'vcf' | 'genes' | 'reference' | 'coverage' | 'ruler';
  height: number;
  displayMode: DisplayMode;
  visible: boolean;
  color?: string;
  minHeight?: number;
  maxHeight?: number;
  defaultHeight: number;
}

export interface WebMCPCallbacks {
  // Navigation & Viewport
  onNavigate: (chrom: string, start: number, end: number) => Promise<void> | void;
  onZoom: (factor: number) => Promise<void> | void;
  onPan: (deltaBp: number) => Promise<void> | void;

  // Track Configuration
  onSetTrackHeight: (trackId: string, height: number) => { success: boolean; message: string; clampedHeight?: number; trackId?: string; height?: number };
  onSetTrackDisplayMode: (trackId: string | undefined, mode: 'expanded' | 'squished' | 'collapsed') => { success: boolean; message: string; trackId?: string; mode?: string };
  onToggleTrackVisibility: (trackId: string, visible?: boolean) => { success: boolean; visible: boolean; message: string; trackId?: string };
  onSetTrackColor: (trackId: string, color: string) => { success: boolean; message: string; trackId?: string; color?: string };

  // Variant Filtering & Export
  onFilterVariants: (filters: Partial<VariantFilters>) => { success: boolean; activeFilters: VariantFilters; matchingCount: number; message?: string };
  prepareTrack1Export: () => Promise<{ success: boolean; message: string; data?: any }>;
  validateTrack1Submission: () => Promise<{ success: boolean; message: string; isValid?: boolean }>;
  exportClinicalFindingsCsv: (args: { primaryVariantId: string; secondaryVariantId?: string; epcr: number; findingType: string; notes?: string }) => { success: boolean; message: string; csv?: string };

  // Gene & Variant Inspection
  onSearchGene: (geneSymbol: string, navigate?: boolean) => Promise<GeneLookupResult> | GeneLookupResult;
  onSelectVariant: (variantId: string) => boolean;
  getCandidateSummary: (variantId?: string) => { success: boolean; summary?: any; candidates?: any[]; message: string };

  // Discovery / Track 2 Tools
  switchTab?: (tabId: 'browser' | 'discovery') => { success: boolean; message: string };
  loadProteinStructure?: (uniprotId: string) => { success: boolean; message: string };
  highlightResidue?: (position: number) => { success: boolean; message: string };
  focusResidues?: (start: number, end?: number) => { success: boolean; message: string };
  setViewerRepresentation?: (type: 'cartoon' | 'surface' | 'ball-and-stick') => { success: boolean; message: string };
  setAiCommentary?: (text: string) => { success: boolean; message: string };
  getViewState: () => any;
  getEpigeneticSummary: (chrom: string, start: number, end: number) => Promise<any>;
  onSwitchTab: (tabId: string) => { success: boolean; message: string; tabId?: string };
  onLoadProteinStructure: (uniprotId: string) => { success: boolean; message: string };
  onHighlightResidue: (position: number) => { success: boolean; message: string };
}

export interface WebMCPToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (args: any) => Promise<any>;
}

// In-memory fallback tool registry
const toolRegistry = new Map<string, WebMCPToolDef>();

// Canonical and alias tool name mappings
const TOOL_ALIASES: Record<string, string> = {
  navigateLocus: 'navigate_locus',
  zoomLocus: 'zoom_locus',
  panLocus: 'pan_locus',
  setTrackHeight: 'set_track_height',
  setDisplayMode: 'set_track_display_mode',
  setTrackDisplayMode: 'set_track_display_mode',
  filterVariants: 'filter_variants',
  prepareTrack1Export: 'prepare_track1_export',
  validateTrack1Submission: 'validate_track1_submission',
  exportClinicalFindingsCsv: 'export_clinical_findings_csv',
  searchGene: 'search_gene_locus',
  searchGeneLocus: 'search_gene_locus',
  getCandidateSummary: 'get_candidate_summary',
  getViewState: 'get_view_state',
  toggleTrack: 'toggle_track_visibility',
  toggleTrackVisibility: 'toggle_track_visibility',
  setTrackColor: 'set_track_color',
  selectVariant: 'select_variant',
  getEpigenetic: 'get_epigenetic_summary',
  getEpigeneticSummary: 'get_epigenetic_summary',
  switchTab: 'switch_tab',
  loadProteinStructure: 'load_protein_structure',
  highlightResidue: 'highlight_residue',
  focusResidues: 'focus_residues',
  setViewerRepresentation: 'set_viewer_representation',
  setAiCommentary: 'set_ai_commentary',
};

/**
 * Register all WebMCP tools with document.modelContext and polyfill window.__webmcp_tools__
 */
export function registerWebMCPTools(callbacks: WebMCPCallbacks): WebMCPToolDef[] {
  toolRegistry.clear();

  const tools: WebMCPToolDef[] = [
    // 1. navigate_locus
    {
      name: 'navigate_locus',
      description: 'Navigates the OmniStrand browser to a specific locus. Use this to jump to a specific chromosome and coordinate range. (Genome Build: GRCh38)',
      inputSchema: {
        type: 'object',
        properties: {
          chrom: { type: 'string', description: 'Chromosome name (e.g., chr1, chrX, 17)' },
          start: { type: 'number', description: 'Start coordinate in base pairs (1-based)' },
          end: { type: 'number', description: 'End coordinate in base pairs' },
        },
        required: ['chrom', 'start', 'end'],
      },
      execute: async (args: any) => {
        try {
          const chrom = args.chrom;
          const start = Number(args.start);
          const end = Number(args.end);
          if (!chrom || isNaN(start) || isNaN(end)) {
            return { success: false, message: "Missing required argument: 'chrom', 'start', or 'end'" };
          }
          await callbacks.onNavigate(chrom, start, end);
          return { success: true, locus: { chrom, start, end }, message: `Navigated to ${chrom}:${start}-${end}` };
        } catch (e: any) {
          return { success: false, message: `Failed to navigate: ${e.message}` };
        }
      },
    },

    // 2. zoom_locus
    {
      name: 'zoom_locus',
      description: 'Zooms the OmniStrand browser in or out. factor < 1 zooms in (e.g. 0.5 shows half the region), factor > 1 zooms out (e.g. 2.0 shows twice the region). (Genome Build: GRCh38)',
      inputSchema: {
        type: 'object',
        properties: {
          factor: { type: 'number', description: 'Zoom factor. < 1 zooms in, > 1 zooms out.' },
        },
        required: ['factor'],
      },
      execute: async (args: any) => {
        try {
          const factor = Number(args.factor);
          if (isNaN(factor)) {
            return { success: false, message: "Missing required argument: 'factor'" };
          }
          await callbacks.onZoom(factor);
          const viewState = callbacks.getViewState();
          return { success: true, locus: viewState?.locus, message: `Zoomed by factor ${factor}` };
        } catch (e: any) {
          return { success: false, message: `Failed to zoom: ${e.message}` };
        }
      },
    },

    // 3. pan_locus
    {
      name: 'pan_locus',
      description: 'Pans the OmniStrand browser view by a specified number of base pairs. Positive shifts right (downstream), negative shifts left (upstream). (Genome Build: GRCh38)',
      inputSchema: {
        type: 'object',
        properties: {
          deltaBp: { type: 'number', description: 'Number of base pairs to shift. Positive for right, negative for left.' },
        },
        required: ['deltaBp'],
      },
      execute: async (args: any) => {
        try {
          const delta = Number(args.deltaBp);
          if (isNaN(delta)) {
            return { success: false, message: "Missing required argument: 'deltaBp'" };
          }
          await callbacks.onPan(delta);
          const viewState = callbacks.getViewState();
          return { success: true, locus: viewState?.locus, message: `Panned by ${delta} bp` };
        } catch (e: any) {
          return { success: false, message: `Failed to pan: ${e.message}` };
        }
      },
    },

    // 4. set_track_height
    {
      name: 'set_track_height',
      description: 'Sets the height of a specific genomic track in pixels (clamped between 20px and 500px).',
      inputSchema: {
        type: 'object',
        properties: {
          trackId: { type: 'string', description: 'Track ID (e.g. variants, genes, rna, atac, reference)' },
          height: { type: 'number', description: 'Desired height in pixels (20 to 500)' },
        },
        required: ['trackId', 'height'],
      },
      execute: async (args: any) => {
        try {
          const trackId = args.trackId;
          const height = Number(args.height);
          if (!trackId) {
            return { success: false, message: "Missing required argument: 'trackId'" };
          }
          if (isNaN(height)) {
            return { success: false, message: "Missing required argument: 'height'" };
          }
          const res = callbacks.onSetTrackHeight(trackId, height);
          return {
            success: res.success,
            trackId,
            height: res.clampedHeight ?? res.height ?? height,
            message: res.message,
          };
        } catch (e: any) {
          return { success: false, message: `Failed to set track height: ${e.message}` };
        }
      },
    },

    // 5. set_track_display_mode
    {
      name: 'set_track_display_mode',
      description: 'Sets the display mode of a specific track or all tracks (expanded, squished, or collapsed).',
      inputSchema: {
        type: 'object',
        properties: {
          trackId: { type: 'string', description: 'Optional track ID. If omitted, applies to all tracks.' },
          mode: { type: 'string', enum: ['expanded', 'squished', 'collapsed'], description: 'Visual density display mode' },
        },
        required: ['mode'],
      },
      execute: async (args: any) => {
        try {
          const trackId = args.trackId;
          const mode = args.mode;
          if (!mode) {
            return { success: false, message: "Missing required argument: 'mode'" };
          }
          if (!['expanded', 'squished', 'collapsed'].includes(mode)) {
            return { success: false, message: `Invalid display mode: '${mode}'. Must be 'expanded', 'squished', or 'collapsed'.` };
          }
          const res = callbacks.onSetTrackDisplayMode(trackId, mode);
          return {
            success: res.success,
            trackId,
            mode,
            message: res.message,
          };
        } catch (e: any) {
          return { success: false, message: `Failed to set display mode: ${e.message}` };
        }
      },
    },

    // 6. filter_variants
    {
      name: 'filter_variants',
      description: 'Applies multi-parameter filters to variants in view (min QUAL, PASS only, variant types, min AF, search term).',
      inputSchema: {
        type: 'object',
        properties: {
          minQual: { type: 'number', description: 'Minimum variant call quality score (QUAL)' },
          filterPassOnly: { type: 'boolean', description: 'When true, keeps only PASS filter variants' },
          variantTypes: { type: 'array', items: { type: 'string' }, description: 'Array of variant types to keep (SNP, INDEL, MNP, OTHER)' },
          minAf: { type: 'number', description: 'Minimum allele frequency threshold (0.0 to 1.0)' },
          searchTerm: { type: 'string', description: 'Free-text search query (rsID, position, gene, allele)' },
        },
      },
      execute: async (args: any) => {
        try {
          const filters: Partial<VariantFilters> = {};
          if (args.minQual !== undefined) {
            filters.minQual = Number(args.minQual);
          }
          if (args.filterPassOnly !== undefined) {
            filters.filterPassOnly = Boolean(args.filterPassOnly);
          }
          if (args.variantTypes !== undefined) {
            filters.variantTypes = args.variantTypes;
          }
          if (args.minAf !== undefined) {
            filters.minAf = Number(args.minAf);
          }
          if (args.searchTerm !== undefined) {
            filters.searchTerm = String(args.searchTerm);
          }

          const res = callbacks.onFilterVariants(filters);
          return {
            success: res.success,
            activeFilters: res.activeFilters,
            matchingCount: res.matchingCount,
            message: res.message || `Filters applied. ${res.matchingCount} variants matched.`,
          };
        } catch (e: any) {
          return { success: false, message: `Failed to filter variants: ${e.message}` };
        }
      },
    },

    // 7. prepare_track1_export
    {
      name: 'prepare_track1_export',
      description: 'Prepares the current track 1 genomic data and filters for an export payload.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        try {
          const res = await callbacks.prepareTrack1Export();
          return res;
        } catch (e: any) {
          return { success: false, message: `Failed to prepare export: ${e.message}` };
        }
      },
    },

    // 8. validate_track1_submission
    {
      name: 'validate_track1_submission',
      description: 'Validates the current track 1 configuration against submission requirements.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        try {
          const res = await callbacks.validateTrack1Submission();
          return res;
        } catch (e: any) {
          return { success: false, message: `Failed to validate submission: ${e.message}` };
        }
      },
    },

    // 8b. export_clinical_findings_csv
    {
      name: 'export_clinical_findings_csv',
      description: 'Generates a standardized clinical findings CSV report by pulling variant coordinates directly from the UI state and pairing them with AI-provided clinical metadata.',
      inputSchema: {
        type: 'object',
        properties: {
          primaryVariantId: { type: 'string', description: 'The ID of the primary causal variant (e.g. "15:40209701_T/G")' },
          secondaryVariantId: { type: 'string', description: 'The ID of the secondary variant for compound-hets. Leave empty if single variant.' },
          epcr: { type: 'number', description: 'Estimated probability of causal relationship (0.0 to 1.0)' },
          findingType: { type: 'string', enum: ['primary', 'secondary'], description: 'Whether this finding is primary or secondary' },
          notes: { type: 'string', description: 'Brief rationale or notes' },
        },
        required: ['primaryVariantId', 'epcr', 'findingType'],
      },
      execute: async (args: any) => {
        try {
          return callbacks.exportClinicalFindingsCsv(args);
        } catch (e: any) {
          return { success: false, message: `Failed to export CSV: ${e.message}` };
        }
      },
    },

    // 9. search_gene_locus
    {
      name: 'search_gene_locus',
      description: 'Resolves a gene symbol (e.g. BRCA1, TP53, EGFR) or locus string into genomic coordinates and optionally navigates. (Genome Build: GRCh38)',
      inputSchema: {
        type: 'object',
        properties: {
          geneSymbol: { type: 'string', description: 'Gene symbol or coordinate string' },
          query: { type: 'string', description: 'Alias for geneSymbol' },
          navigate: { type: 'boolean', description: 'Whether to navigate the browser viewport to resolved locus' },
        },
      },
      execute: async (args: any) => {
        try {
          const geneSymbol = args.geneSymbol || args.query;
          if (!geneSymbol) {
            return { success: false, message: "Missing required argument: 'geneSymbol' or 'query'" };
          }
          const navigate = args.navigate !== undefined ? Boolean(args.navigate) : true;
          const res = await callbacks.onSearchGene(geneSymbol, navigate);
          if (res.found && res.locus) {
            return {
              success: true,
              geneSymbol: res.geneSymbol || geneSymbol,
              locus: res.locus,
              source: res.source,
              geneInfo: res.geneInfo,
              message: res.message,
            };
          }
          return { success: false, message: res.message };
        } catch (e: any) {
          return { success: false, message: `Failed to resolve gene locus: ${e.message}` };
        }
      },
    },

    // 10. get_candidate_summary
    {
      name: 'get_candidate_summary',
      description: 'Returns a sanitized summary (normalized representation, quality band, inheritance fit, consequence) for variants without raw reads or patient identifiers.',
      inputSchema: {
        type: 'object',
        properties: {
          variantId: { type: 'string', description: 'Unique variant ID to summarize' },
        },
      },
      execute: async (args: any) => {
        try {
          return callbacks.getCandidateSummary(args.variantId);
        } catch (e: any) {
          return { success: false, message: `Failed to get candidate summary: ${e.message}` };
        }
      },
    },

    // 11. get_view_state
    {
      name: 'get_view_state',
      description: 'Returns the full snapshot of current browser viewport, active track configurations, variant filters, and selection.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        try {
          const state = callbacks.getViewState();
          return {
            success: true,
            ...state,
          };
        } catch (e: any) {
          return { success: false, message: `Failed to get view state: ${e.message}` };
        }
      },
    },

    // 12. toggle_track_visibility
    {
      name: 'toggle_track_visibility',
      description: 'Toggles or explicitly sets visibility for a specific genomic track.',
      inputSchema: {
        type: 'object',
        properties: {
          trackId: { type: 'string', description: 'Track ID to toggle' },
          visible: { type: 'boolean', description: 'Optional explicit visibility boolean' },
        },
        required: ['trackId'],
      },
      execute: async (args: any) => {
        try {
          const trackId = args.trackId;
          if (!trackId) {
            return { success: false, message: "Missing required argument: 'trackId'" };
          }
          const visible = args.visible !== undefined ? Boolean(args.visible) : undefined;
          const res = callbacks.onToggleTrackVisibility(trackId, visible);
          return {
            success: res.success,
            trackId,
            visible: res.visible,
            message: res.message,
          };
        } catch (e: any) {
          return { success: false, message: `Failed to toggle track: ${e.message}` };
        }
      },
    },

    // 13. set_track_color
    {
      name: 'set_track_color',
      description: 'Sets the accent display color for a specific genomic track.',
      inputSchema: {
        type: 'object',
        properties: {
          trackId: { type: 'string', description: 'Track ID to customize' },
          color: { type: 'string', description: 'CSS color string (hex, rgb, or var)' },
        },
        required: ['trackId', 'color'],
      },
      execute: async (args: any) => {
        try {
          const trackId = args.trackId;
          const color = args.color;
          if (!trackId || !color) {
            return { success: false, message: "Missing required argument: 'trackId' or 'color'" };
          }
          const res = callbacks.onSetTrackColor(trackId, color);
          return {
            success: res.success,
            trackId,
            color,
            message: res.message,
          };
        } catch (e: any) {
          return { success: false, message: `Failed to set track color: ${e.message}` };
        }
      },
    },

    // 14. select_variant
    {
      name: 'select_variant',
      description: 'Selects a specific variant in the UI by its ID to open the inspection panel.',
      inputSchema: {
        type: 'object',
        properties: {
          variantId: { type: 'string', description: 'The unique ID of the variant to select.' },
        },
        required: ['variantId'],
      },
      execute: async (args: any) => {
        try {
          const variantId = args.variantId;
          if (!variantId) {
            return { success: false, message: "Missing required argument: 'variantId'" };
          }
          const found = callbacks.onSelectVariant(variantId);
          if (found) {
            return { success: true, variantId, message: `Selected variant ${variantId}` };
          }
          return { success: false, message: `Variant ${variantId} not found in current view.` };
        } catch (e: any) {
          return { success: false, message: `Failed to select variant: ${e.message}` };
        }
      },
    },

    // 15. get_epigenetic_summary
    {
      name: 'get_epigenetic_summary',
      description: 'Queries loaded BigWig engines (RNA-Seq and ATAC-Seq) for average signal depth in a region <= 50kb. (Genome Build: GRCh38)',
      inputSchema: {
        type: 'object',
        properties: {
          chrom: { type: 'string' },
          start: { type: 'number' },
          end: { type: 'number' },
        },
        required: ['chrom', 'start', 'end'],
      },
      execute: async (args: any) => {
        try {
          const chrom = args.chrom;
          const start = Number(args.start);
          const end = Number(args.end);
          if (!chrom || isNaN(start) || isNaN(end)) {
            return { success: false, message: "Missing required argument: 'chrom', 'start', or 'end'" };
          }
          const windowSize = end - start;
          if (windowSize > 50000) {
            return {
              success: false,
              message: `Requested window (${windowSize} bp) exceeds the 50,000 bp limit to protect browser memory.`,
            };
          }
          const summary = await callbacks.getEpigeneticSummary(chrom, start, end);
          return { success: true, summary };
        } catch (e: any) {
          return { success: false, message: `Failed to summarize epigenetics: ${e.message}` };
        }
      },
    },

    // 16. switch_tab
    {
      name: 'switch_tab',
      description: 'Switches the main view between different application tabs (e.g., "browser" and "discovery").',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'string', enum: ['browser', 'discovery'], description: 'The ID of the tab to switch to.' },
        },
        required: ['tabId'],
      },
      execute: async (args: any) => {
        try {
          const tabId = args.tabId;
          if (!tabId) {
            return { success: false, message: "Missing required argument: 'tabId'" };
          }
          if (!['browser', 'discovery'].includes(tabId)) {
            return { success: false, message: `Invalid tab ID: '${tabId}'. Must be 'browser' or 'discovery'.` };
          }
          const res = callbacks.onSwitchTab(tabId);
          return {
            success: res.success,
            tabId,
            message: res.message,
          };
        } catch (e: any) {
          return { success: false, message: `Failed to switch tab: ${e.message}` };
        }
      },
    },
    // 17. load_protein_structure
    {
      name: 'load_protein_structure',
      description: 'Loads a 3D protein structure into the Discovery Panel by UniProt ID and switches to the Discovery tab.',
      inputSchema: {
        type: 'object',
        properties: {
          uniprotId: { type: 'string', description: 'UniProt ID of the protein (e.g. O60566)' },
        },
        required: ['uniprotId'],
      },
      execute: async (args: any) => {
        try {
          const uniprotId = args.uniprotId;
          if (!uniprotId) {
            return { success: false, message: "Missing required argument: 'uniprotId'" };
          }
          return callbacks.onLoadProteinStructure(uniprotId);
        } catch (e: any) {
          return { success: false, message: `Failed to load protein structure: ${e.message}` };
        }
      },
    },

    // 18. highlight_residue
    {
      name: 'highlight_residue',
      description: 'Highlights a specific amino acid residue on the active 3D protein structure.',
      inputSchema: {
        type: 'object',
        properties: {
          position: { type: 'number', description: 'The amino acid position/residue number to highlight' },
        },
        required: ['position'],
      },
      execute: async (args: any) => {
        try {
          const position = Number(args.position);
          if (isNaN(position)) {
            return { success: false, message: "Missing required argument: 'position'" };
          }
          return callbacks.onHighlightResidue(position);
        } catch (e: any) {
          return { success: false, message: `Failed to highlight residue: ${e.message}` };
        }
      },
    },
    // 19. focus_residues
    {
      name: 'focus_residues',
      description: 'Smoothly pans and zooms the 3D camera to focus on a specific residue or range of residues.',
      inputSchema: {
        type: 'object',
        properties: {
          start: { type: 'number', description: 'The starting residue number to focus on' },
          end: { type: 'number', description: 'The ending residue number (optional, for a range)' },
        },
        required: ['start'],
      },
      execute: async (args: any) => {
        try {
          const start = Number(args.start);
          const end = args.end !== undefined ? Number(args.end) : undefined;
          if (isNaN(start)) {
            return { success: false, message: "Missing required argument: 'start'" };
          }
          if (callbacks.focusResidues) {
            return callbacks.focusResidues(start, end);
          }
          return { success: false, message: 'focusResidues callback not implemented.' };
        } catch (e: any) {
          return { success: false, message: `Failed to focus residues: ${e.message}` };
        }
      },
    },

    // 20. set_viewer_representation
    {
      name: 'set_viewer_representation',
      description: 'Changes the visual representation of the 3D protein structure (e.g. cartoon, surface, ball-and-stick).',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['cartoon', 'surface', 'ball-and-stick'], description: 'The type of representation' },
        },
        required: ['type'],
      },
      execute: async (args: any) => {
        try {
          const type = args.type;
          if (!type || !['cartoon', 'surface', 'ball-and-stick'].includes(type)) {
            return { success: false, message: "Invalid or missing representation type" };
          }
          if (callbacks.setViewerRepresentation) {
            return callbacks.setViewerRepresentation(type as 'cartoon' | 'surface' | 'ball-and-stick');
          }
          return { success: false, message: 'setViewerRepresentation callback not implemented.' };
        } catch (e: any) {
          return { success: false, message: `Failed to set viewer representation: ${e.message}` };
        }
      },
    },

    // 21. set_ai_commentary
    {
      name: 'set_ai_commentary',
      description: 'Sets the text for the AI Tour Guide/Commentary UI overlay in the 3D Discovery Panel.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The text commentary to show to the user' },
        },
        required: ['text'],
      },
      execute: async (args: any) => {
        try {
          const text = args.text;
          if (!text) {
            return { success: false, message: "Missing required argument: 'text'" };
          }
          if (callbacks.setAiCommentary) {
            return callbacks.setAiCommentary(text);
          }
          return { success: false, message: 'setAiCommentary callback not implemented.' };
        } catch (e: any) {
          return { success: false, message: `Failed to set AI commentary: ${e.message}` };
        }
      },
    },
  ];

  // Store in local toolRegistry
  for (const tool of tools) {
    toolRegistry.set(tool.name, tool);
  }

  // 1. Register with document.modelContext if available (Native WebMCP)
  if (typeof document !== 'undefined' && 'modelContext' in document && (document as any).modelContext) {
    const mc = (document as any).modelContext;
    for (const tool of tools) {
      try {
        const p = mc.registerTool(tool);
        if (p && p.catch) {
          p.catch((e: any) => {
            if (e?.name !== 'InvalidStateError') {
              console.warn(`[WebMCP] Could not register ${tool.name}:`, e);
            }
          });
        }
      } catch (e: any) {
        if (e?.name !== 'InvalidStateError') {
          console.warn(`[WebMCP] Could not register ${tool.name}:`, e);
        }
      }
    }
    console.log(`[WebMCP] Registered ${tools.length} IGV tools with document.modelContext`);
  }

  // 2. Setup Polyfill & Test Dispatcher on window
  if (typeof window !== 'undefined') {
    const win = window as any;

    win.__webmcp_tools__ = {
      tools: toolRegistry,
      getTools: () => Array.from(toolRegistry.values()),
      getTool: (name: string) => toolRegistry.get(TOOL_ALIASES[name] || name),
      hasTool: (name: string) => toolRegistry.has(TOOL_ALIASES[name] || name),
      executeTool: async (name: string, args: any = {}) => {
        // Dispatch event for UI "piloting" overlay
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('webmcp-ai-piloting'));
        }

        const canonicalName = TOOL_ALIASES[name] || name;
        const tool = toolRegistry.get(canonicalName);
        if (!tool) {
          return { success: false, message: `Tool '${name}' not found in WebMCP registry.` };
        }
        // Validate required args
        if (tool.inputSchema?.required) {
          for (const reqKey of tool.inputSchema.required) {
            if (args[reqKey] === undefined) {
              return { success: false, message: `Missing required argument: '${reqKey}'` };
            }
          }
        }
        return tool.execute(args);
      },
    };

    win.invokeWebMCPTool = async (name: string, args: any = {}) => {
      const canonicalName = TOOL_ALIASES[name] || name;
      if (win.__webmcp_tools__?.executeTool) {
        return win.__webmcp_tools__.executeTool(canonicalName, args);
      }
      const tool = toolRegistry.get(canonicalName);
      if (!tool) {
        return { success: false, message: `Tool '${name}' not found in WebMCP registry.` };
      }
      return tool.execute(args);
    };
  }

  return tools;
}

/**
 * Programmatic invocation helper for headless testing and external calls
 */
export async function invokeWebMCPTool(name: string, args: any = {}): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).invokeWebMCPTool) {
    return (window as any).invokeWebMCPTool(name, args);
  }
  const canonicalName = TOOL_ALIASES[name] || name;
  const tool = toolRegistry.get(canonicalName);
  if (!tool) {
    return { success: false, message: `Tool '${name}' not found in WebMCP registry.` };
  }
  return tool.execute(args);
}
