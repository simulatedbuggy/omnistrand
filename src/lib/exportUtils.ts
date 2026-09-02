/**
 * src/lib/exportUtils.ts
 * 
 * Multi-Format Data Export Suite for OmniStrand IGV Tools.
 * Serializes parsed genomic variants into standard bioinformatics and tabular formats:
 * - VCF 4.2 (Standard text format with contig/INFO/FORMAT headers and sample genotypes)
 * - CSV (Escaped tabular format for spreadsheet, Pandas, and R analysis)
 * - JSON (Structured JSON array with metadata header)
 * - BED (0-based UCSC/IGV interval track format: chrom, chromStart, chromEnd, name, score, strand)
 * 
 * Includes browser download and clipboard copy helpers.
 */

import type { ParsedVariant } from './vcfEngine';

export type ExportFormat = 'vcf' | 'csv' | 'json' | 'bed';

export interface ExportResult {
  data: string;
  mimeType: string;
  extension: string;
  count: number;
}

export interface ExportOptions {
  trackName?: string;
  sampleNames?: string[];
  metadata?: Record<string, any>;
  locus?: { chrom: string; start: number; end: number };
}

/**
 * Detect variant type for formatting if not already set on variant object
 */
export function detectVariantType(variant: { ref: string; alt: string[] }): 'SNP' | 'INDEL' | 'MNP' | 'OTHER' {
  if (!variant.alt || variant.alt.length === 0 || variant.alt[0] === '.' || variant.alt[0] === '*') {
    return 'OTHER';
  }
  const ref = variant.ref;
  const alt = variant.alt[0];

  // Symbolic structural variants or breakpoints (e.g. <DEL>, <DUP>, <INV>, <INS>, <CNV>)
  if (alt.startsWith('<') || alt.includes(':')) {
    if (alt.toUpperCase().includes('DEL') || alt.toUpperCase().includes('INS') || alt.toUpperCase().includes('DUP')) {
      return 'INDEL';
    }
    return 'OTHER';
  }
  if (ref.length === 1 && alt.length === 1) {
    return 'SNP';
  }
  if (ref.length !== alt.length) {
    return 'INDEL';
  }
  if (ref.length === alt.length && ref.length > 1) {
    return 'MNP';
  }
  return 'OTHER';
}

/**
 * Extract numerical Allele Frequency (AF) safely handling 0.0, arrays, and AC/AN fallback
 */
export function extractVariantAF(variant: ParsedVariant): number | null {
  if (typeof (variant as any).af === 'number' && !isNaN((variant as any).af)) {
    return (variant as any).af;
  }
  if (variant.info?.AF !== undefined && variant.info?.AF !== null) {
    if (Array.isArray(variant.info.AF)) {
      const first = Number(variant.info.AF[0]);
      return isNaN(first) ? null : first;
    }
    const num = Number(variant.info.AF);
    return isNaN(num) ? null : num;
  }
  if (variant.info?.AC !== undefined && variant.info?.AN !== undefined) {
    const rawAc = Array.isArray(variant.info.AC) ? variant.info.AC[0] : variant.info.AC;
    const rawAn = Array.isArray(variant.info.AN) ? variant.info.AN[0] : variant.info.AN;
    const ac = Number(rawAc);
    const an = Number(rawAn);
    if (!isNaN(ac) && !isNaN(an) && an > 0) return ac / an;
  }
  return null;
}

/**
 * Normalize FILTER status string and check if it is PASS
 */
export function normalizeFilterStatus(filter: any): { filterString: string; isPass: boolean } {
  let filterStr = '';
  if (!filter || filter === '.' || filter === '') {
    filterStr = 'PASS';
  } else if (Array.isArray(filter)) {
    filterStr = filter.length === 0 || (filter.length === 1 && filter[0] === '.') ? 'PASS' : filter.join(';');
  } else if (typeof filter === 'string') {
    filterStr = filter;
  } else {
    filterStr = String(filter);
  }

  const isPass = filterStr.toUpperCase() === 'PASS';
  return { filterString: filterStr, isPass };
}

/**
 * 1. Export variants to standard VCF 4.2 format
 */
export function exportToVcf(variants: ParsedVariant[], sampleNames?: string[]): string {
  // Determine sample names
  let samples = sampleNames;
  if (!samples || samples.length === 0) {
    const sampleSet = new Set<string>();
    variants.forEach((v) => {
      if (v.genotypes) {
        Object.keys(v.genotypes).forEach((s) => sampleSet.add(s));
      }
    });
    samples = sampleSet.size > 0 ? Array.from(sampleSet) : ['SAMPLE_001'];
  }

  const headerLines = [
    '##fileformat=VCFv4.2',
    '##source=OmniStrand_Exporter_v1.0',
    '##INFO=<ID=DP,Number=1,Type=Integer,Description="Total Depth">',
    '##INFO=<ID=AF,Number=A,Type=Float,Description="Allele Frequency">',
    '##INFO=<ID=AC,Number=A,Type=Integer,Description="Allele count in genotypes">',
    '##INFO=<ID=AN,Number=1,Type=Integer,Description="Total number of alleles in called genotypes">',
    '##INFO=<ID=FS,Number=1,Type=Float,Description="Phred-scaled p-value using Fisher\'s exact test to detect strand bias">',
    '##INFO=<ID=SOR,Number=1,Type=Float,Description="Symmetric Odds Ratio test for strand bias">',
    '##INFO=<ID=MQ,Number=1,Type=Float,Description="RMS Mapping Quality">',
    '##INFO=<ID=QD,Number=1,Type=Float,Description="Variant Confidence/Quality by Depth">',
    '##INFO=<ID=DB,Number=0,Type=Flag,Description="dbSNP Membership">',
    '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
    '##FORMAT=<ID=AD,Number=R,Type=Integer,Description="Allelic depths for the ref and alt alleles in the order listed">',
    '##FORMAT=<ID=DP,Number=1,Type=Integer,Description="Approximate read depth (reads with MQ=255 or with bad mates are filtered)">',
    '##FORMAT=<ID=GQ,Number=1,Type=Integer,Description="Genotype Quality">',
    '##FORMAT=<ID=PL,Number=G,Type=Integer,Description="Normalized, Phred-scaled likelihoods for genotypes as defined in the VCF specification">',
    ['#CHROM', 'POS', 'ID', 'REF', 'ALT', 'QUAL', 'FILTER', 'INFO', 'FORMAT', ...samples].join('\t'),
  ];

  const bodyLines = variants.map((v) => {
    const qualStr = v.qual !== null && v.qual !== undefined ? v.qual.toFixed(1) : '.';
    const { filterString } = normalizeFilterStatus(v.filter);
    const altStr = v.alt && v.alt.length > 0 ? v.alt.join(',') : '.';

    // Build INFO field
    const infoEntries: string[] = [];
    if (v.info) {
      Object.entries(v.info).forEach(([key, val]) => {
        if (val === true) {
          infoEntries.push(key);
        } else if (val !== false && val !== null && val !== undefined) {
          infoEntries.push(`${key}=${Array.isArray(val) ? val.join(',') : val}`);
        }
      });
    }
    const infoStr = infoEntries.length > 0 ? infoEntries.join(';') : '.';

    // Build FORMAT and sample columns
    const formatKeys = ['GT', 'AD', 'DP', 'GQ'];
    const sampleDataCols = samples!.map((sName) => {
      const sampleGt = v.genotypes?.[sName];
      if (!sampleGt) return './.:0,0:0:0';
      const gt = sampleGt.GT ? (Array.isArray(sampleGt.GT) ? sampleGt.GT.join('/') : sampleGt.GT) : './.';
      const ad = sampleGt.AD ? (Array.isArray(sampleGt.AD) ? sampleGt.AD.join(',') : sampleGt.AD) : '.';
      const dp = sampleGt.DP ? (Array.isArray(sampleGt.DP) ? sampleGt.DP[0] : sampleGt.DP) : '.';
      const gq = sampleGt.GQ ? (Array.isArray(sampleGt.GQ) ? sampleGt.GQ[0] : sampleGt.GQ) : '.';
      return `${gt}:${ad}:${dp}:${gq}`;
    });

    return [
      v.chrom,
      v.pos,
      v.id || '.',
      v.ref,
      altStr,
      qualStr,
      filterString,
      infoStr,
      formatKeys.join(':'),
      ...sampleDataCols,
    ].join('\t');
  });

  return [...headerLines, ...bodyLines].join('\n');
}

/** Alias for exportToVcf */
export const exportVariantsToVCF = exportToVcf;

/**
 * 2. Export variants to CSV format
 */
export function exportToCsv(variants: ParsedVariant[]): string {
  const header = ['Chromosome', 'Position', 'ID', 'Reference', 'Alternate', 'Quality', 'Filter', 'Type', 'AF', 'DP', 'Genotype'];

  const rows = variants.map((v) => {
    const vType = (v as any).type || detectVariantType(v);
    const af = extractVariantAF(v);
    const primarySample = Object.values(v.genotypes || {})[0];
    const gt = primarySample?.GT ? (Array.isArray(primarySample.GT) ? primarySample.GT.join('/') : primarySample.GT) : '—';
    const dp = primarySample?.DP ? (Array.isArray(primarySample.DP) ? primarySample.DP[0] : primarySample.DP) : ((v as any).dp ?? v.info?.DP ?? '—');

    return [
      JSON.stringify(v.chrom),
      v.pos,
      JSON.stringify(v.id || `${v.chrom}:${v.pos}`),
      JSON.stringify(v.ref),
      JSON.stringify(v.alt.join(', ')),
      v.qual !== null && v.qual !== undefined ? v.qual : '—',
      JSON.stringify(v.filter || 'PASS'),
      JSON.stringify(vType),
      af !== null ? af : '—',
      dp,
      JSON.stringify(gt),
    ].join(',');
  });

  return [header.join(','), ...rows].join('\n');
}

/** Alias for exportToCsv */
export const exportVariantsToCSV = exportToCsv;

/**
 * 3. Export variants to structured JSON format with metadata
 */
export function exportToJson(variants: ParsedVariant[], metadata: Record<string, any> = {}): string {
  const payload = {
    metadata: {
      generatedAt: '2026-08-31T00:00:00Z',
      exporter: 'OmniStrand IGV Tools',
      totalCount: variants.length,
      ...metadata,
    },
    variants: variants.map((v) => ({
      ...v,
      type: (v as any).type || detectVariantType(v),
      af: extractVariantAF(v),
    })),
  };

  return JSON.stringify(payload, null, 2);
}

/** Alias for exportToJson */
export const exportVariantsToJSON = exportToJson;

/**
 * 4. Export variants to standard 0-based BED format
 */
export function exportToBed(variants: ParsedVariant[], trackName: string = 'OmniStrand_Variants'): string {
  const header = `track name="${trackName}" description="Exported variants from OmniStrand IGV Tools" useScore=1`;

  const rows = variants.map((v) => {
    const chrom = v.chrom;
    const chromStart = Math.max(0, v.pos - 1);
    const chromEnd = v.pos + Math.max(1, v.ref.length) - 1;
    const name = v.id || `${v.chrom}:${v.pos}_${v.ref}>${v.alt.join(',')}`;
    const score = v.qual !== null && v.qual !== undefined ? Math.min(1000, Math.round(v.qual * 10)) : 0;
    const strand = '+';

    return [chrom, chromStart, chromEnd, name, score, strand].join('\t');
  });

  return [header, ...rows].join('\n');
}

/** Alias for exportToBed */
export const exportVariantsToBED = exportToBed;

/**
 * Unified export dispatcher supporting all 4 formats
 */
export function exportTrackData(
  variants: ParsedVariant[],
  format: ExportFormat | string,
  options: ExportOptions = {}
): ExportResult {
  if (!format) {
    throw new Error("Missing required export format parameter. Valid formats are: 'vcf', 'csv', 'json', 'bed'.");
  }

  const normalizedFormat = format.toLowerCase().trim() as ExportFormat;

  switch (normalizedFormat) {
    case 'vcf':
      return {
        data: exportToVcf(variants, options.sampleNames),
        mimeType: 'text/vcard',
        extension: 'vcf',
        count: variants.length,
      };
    case 'csv':
      return {
        data: exportToCsv(variants),
        mimeType: 'text/csv',
        extension: 'csv',
        count: variants.length,
      };
    case 'json':
      return {
        data: exportToJson(variants, options.metadata),
        mimeType: 'application/json',
        extension: 'json',
        count: variants.length,
      };
    case 'bed':
      return {
        data: exportToBed(variants, options.trackName),
        mimeType: 'text/tab-separated-values',
        extension: 'bed',
        count: variants.length,
      };
    default:
      throw new Error(`Unsupported export format: '${format}'. Valid formats are: vcf, csv, json, bed.`);
  }
}

/**
 * Triggers a native browser file download using HTML5 Blob
 */
export function downloadExportFile(content: string, filename: string, mimeType: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Copies text content to user clipboard with asynchronous fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof window !== 'undefined' && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to fallback
    }
  }

  if (typeof document === 'undefined') return false;

  // Fallback using textarea element
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    document.body.removeChild(textArea);
    return false;
  }
}
