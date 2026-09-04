/**
 * src/lib/trackUtils.ts
 * 
 * Track configuration, height clamping, and multi-density layout computation helpers.
 */

import type { ParsedVariant } from './vcfEngine';
import type { EnsemblGene } from './ensemblApi';
import type { TrackConfig, DisplayMode } from './webmcp';
import { detectVariantType, extractVariantAF } from './exportUtils';

export const MIN_TRACK_HEIGHT = 20;
export const MAX_TRACK_HEIGHT = 500;

export function clampTrackHeight(height: number, min = MIN_TRACK_HEIGHT, max = MAX_TRACK_HEIGHT): number {
  if (isNaN(height) || typeof height !== 'number') return min;
  const rounded = Math.round(height);
  return Math.max(min, Math.min(max, rounded));
}

export const DEFAULT_TRACK_CONFIGS: Record<string, TrackConfig> = {
  reference: {
    id: 'reference',
    label: 'Sequence',
    subtitle: 'GRCh38',
    type: 'reference',
    height: 32,
    displayMode: 'expanded',
    visible: true,
    minHeight: 20,
    maxHeight: 120,
    defaultHeight: 32,
  },
  rna: {
    id: 'rna',
    label: 'RNA-Seq',
    subtitle: 'Tumor',
    type: 'coverage',
    height: 96,
    displayMode: 'expanded',
    visible: true,
    color: '#a0c0ff',
    minHeight: 20,
    maxHeight: 500,
    defaultHeight: 96,
  },
  genes: {
    id: 'genes',
    label: 'Genes',
    subtitle: 'RefSeq',
    type: 'genes',
    height: 80,
    displayMode: 'expanded',
    visible: true,
    color: '#a0c0ff',
    minHeight: 20,
    maxHeight: 500,
    defaultHeight: 80,
  },
  variants: {
    id: 'variants',
    label: 'Variants',
    subtitle: 'VCF',
    type: 'vcf',
    height: 96,
    displayMode: 'expanded',
    visible: true,
    color: '#61dbb4',
    minHeight: 20,
    maxHeight: 500,
    defaultHeight: 96,
  },
  atac: {
    id: 'atac',
    label: 'ATAC-Seq',
    subtitle: 'Tumor',
    type: 'coverage',
    height: 96,
    displayMode: 'expanded',
    visible: true,
    color: '#8cb1ff',
    minHeight: 20,
    maxHeight: 500,
    defaultHeight: 96,
  },
};

export interface LayoutVariant {
  variant: ParsedVariant;
  leftPercent: number;
  subRow: number;
  isHighQuality: boolean;
  type: 'SNP' | 'INDEL' | 'MNP' | 'OTHER';
  af: number | null;
}

export function computeVariantLayout(
  variants: ParsedVariant[],
  start: number,
  end: number,
  displayMode: DisplayMode
): { layoutVariants: LayoutVariant[]; totalSubRows: number } {
  const windowBp = Math.max(1, end - start);

  if (displayMode === 'collapsed') {
    return {
      layoutVariants: variants.map((v) => ({
        variant: v,
        leftPercent: Math.max(0, Math.min(100, ((v.pos - start) / windowBp) * 100)),
        subRow: 0,
        isHighQuality: v.filter === 'PASS' && (v.qual === null || v.qual > 30),
        type: (v as any).type || detectVariantType(v),
        af: extractVariantAF(v),
      })),
      totalSubRows: 1,
    };
  }

  const minSpacingPercent = displayMode === 'squished' ? 1.2 : 2.5;
  const rows: number[] = [];

  const layoutVariants = variants.map((v) => {
    const leftPercent = Math.max(0, Math.min(100, ((v.pos - start) / windowBp) * 100));
    let subRow = 0;

    while (rows[subRow] !== undefined && leftPercent - rows[subRow] < minSpacingPercent) {
      subRow++;
    }
    rows[subRow] = leftPercent;

    return {
      variant: v,
      leftPercent,
      subRow,
      isHighQuality: v.filter === 'PASS' && (v.qual === null || v.qual > 30),
      type: (v as any).type || detectVariantType(v),
      af: extractVariantAF(v),
    };
  });

  return {
    layoutVariants,
    totalSubRows: Math.max(1, rows.length),
  };
}

export function computeGeneLayout(
  genes: EnsemblGene[],
  start: number,
  end: number,
  displayMode: DisplayMode
) {
  const windowBp = Math.max(1, end - start);

  if (displayMode === 'collapsed') {
    return {
      positionedGenes: genes.map((g) => ({ gene: g, rowIndex: 0 })),
      maxRows: 1,
      rowHeight: 18,
    };
  }

  const rowHeight = displayMode === 'squished' ? 12 : 24;
  const paddingPercent = displayMode === 'squished' ? 0.02 : 0.05;

  const rows: { end: number }[] = [];
  const positionedGenes = genes.map((gene) => {
    const gEnd = Math.min(end, gene.end);
    const paddedEnd = gEnd + windowBp * paddingPercent;

    let rowIndex = 0;
    while (rows[rowIndex] && rows[rowIndex].end > gene.start) {
      rowIndex++;
    }
    rows[rowIndex] = { end: paddedEnd };

    return { gene, rowIndex };
  });

  const maxRows = Math.max(1, rows.length);
  return { positionedGenes, maxRows, rowHeight };
}
