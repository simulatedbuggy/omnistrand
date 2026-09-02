/// <reference types="node" />
/**
 * src/lib/geneLookup.ts
 * 
 * Omnibar Gene Symbol & Locus Resolution Engine.
 * Supports:
 * - Direct chromosomal coordinate strings (e.g. "chr1:15,340,000-15,360,000")
 * - Curated local GRCh38 gene dictionary (BRCA1, TP53, EGFR, KRAS, BRAF, MYC, etc.)
 * - Live Ensembl REST API lookup with +/- 5,000bp padding and in-memory cache
 */

import { parseLocus, type LocusRange } from './vcfEngine';

export interface GeneDefinition {
  symbol: string;
  name: string;
  chrom: string;
  start: number;
  end: number;
  strand: '+' | '-';
  exonCount?: number;
  biotype: string;
  description: string;
  assembly?: string;
}

export interface GeneLookupResult {
  found: boolean;
  geneSymbol?: string;
  locus?: LocusRange;
  geneInfo?: GeneDefinition;
  source: 'database' | 'locus_parser' | 'unknown';
  message: string;
}

/**
 * Curated local high-frequency gene dictionary with GRCh38 coordinates
 */
export const LOCAL_GENE_DICTIONARY: Record<string, GeneDefinition> = {
  BRCA1: {
    symbol: 'BRCA1',
    name: 'BRCA1 DNA repair associated',
    chrom: 'chr17',
    start: 43044295,
    end: 43125483,
    strand: '-',
    exonCount: 24,
    biotype: 'protein_coding',
    description: 'Breast cancer type 1 susceptibility protein',
  },
  BRCA2: {
    symbol: 'BRCA2',
    name: 'BRCA2 DNA repair associated',
    chrom: 'chr13',
    start: 32315086,
    end: 32400266,
    strand: '+',
    exonCount: 27,
    biotype: 'protein_coding',
    description: 'Breast cancer type 2 susceptibility protein',
  },
  TP53: {
    symbol: 'TP53',
    name: 'tumor protein p53',
    chrom: 'chr17',
    start: 7668402,
    end: 7687550,
    strand: '-',
    exonCount: 11,
    biotype: 'protein_coding',
    description: 'Cellular tumor antigen p53',
  },
  EGFR: {
    symbol: 'EGFR',
    name: 'epidermal growth factor receptor',
    chrom: 'chr7',
    start: 55019017,
    end: 55211628,
    strand: '+',
    exonCount: 28,
    biotype: 'protein_coding',
    description: 'Receptor tyrosine-protein kinase erbB-1',
  },
  KRAS: {
    symbol: 'KRAS',
    name: 'KRAS proto-oncogene, GTPase',
    chrom: 'chr12',
    start: 25204789,
    end: 25250929,
    strand: '-',
    exonCount: 6,
    biotype: 'protein_coding',
    description: 'GTPase KRas',
  },
  BRAF: {
    symbol: 'BRAF',
    name: 'B-Raf proto-oncogene, serine/threonine kinase',
    chrom: 'chr7',
    start: 140719327,
    end: 140924929,
    strand: '-',
    exonCount: 18,
    biotype: 'protein_coding',
    description: 'Serine/threonine-protein kinase B-raf',
  },
  MYC: {
    symbol: 'MYC',
    name: 'MYC proto-oncogene, bHLH transcription factor',
    chrom: 'chr8',
    start: 127735434,
    end: 127742951,
    strand: '+',
    exonCount: 3,
    biotype: 'protein_coding',
    description: 'Myc proto-oncogene protein',
  },
  PTEN: {
    symbol: 'PTEN',
    name: 'phosphatase and tensin homolog',
    chrom: 'chr10',
    start: 87863113,
    end: 87971930,
    strand: '+',
    exonCount: 9,
    biotype: 'protein_coding',
    description: 'Phosphatidylinositol 3,4,5-trisphosphate 3-phosphatase PTEN',
  },
  APC: {
    symbol: 'APC',
    name: 'APC regulator of WNT signaling pathway',
    chrom: 'chr5',
    start: 112707498,
    end: 112846239,
    strand: '+',
    exonCount: 16,
    biotype: 'protein_coding',
    description: 'Adenomatous polyposis coli protein',
  },
  PIK3CA: {
    symbol: 'PIK3CA',
    name: 'phosphatidylinositol-4,5-bisphosphate 3-kinase catalytic subunit alpha',
    chrom: 'chr3',
    start: 179148114,
    end: 179240093,
    strand: '+',
    exonCount: 21,
    biotype: 'protein_coding',
    description: 'Phosphatidylinositol 4,5-bisphosphate 3-kinase catalytic subunit alpha isoform',
  },
  CFTR: {
    symbol: 'CFTR',
    name: 'cystic fibrosis transmembrane conductance regulator',
    chrom: 'chr7',
    start: 117479963,
    end: 117668665,
    strand: '+',
    exonCount: 27,
    biotype: 'protein_coding',
    description: 'Cystic fibrosis transmembrane conductance regulator',
  },
  APOE: {
    symbol: 'APOE',
    name: 'apolipoprotein E',
    chrom: 'chr19',
    start: 44905791,
    end: 44909393,
    strand: '+',
    exonCount: 4,
    biotype: 'protein_coding',
    description: 'Apolipoprotein E',
  },
  ERBB2: {
    symbol: 'ERBB2',
    name: 'erb-b2 receptor tyrosine kinase 2 (HER2)',
    chrom: 'chr17',
    start: 39687914,
    end: 39730415,
    strand: '+',
    exonCount: 30,
    biotype: 'protein_coding',
    description: 'Receptor tyrosine-protein kinase erbB-2',
  },
  CDK4: {
    symbol: 'CDK4',
    name: 'cyclin dependent kinase 4',
    chrom: 'chr12',
    start: 57747783,
    end: 57753177,
    strand: '+',
    exonCount: 8,
    biotype: 'protein_coding',
    description: 'Cyclin-dependent kinase 4',
  },
  MSH2: {
    symbol: 'MSH2',
    name: 'mutS homolog 2',
    chrom: 'chr2',
    start: 47403067,
    end: 47483669,
    strand: '+',
    exonCount: 16,
    biotype: 'protein_coding',
    description: 'DNA mismatch repair protein Msh2',
  },
  MSH6: {
    symbol: 'MSH6',
    name: 'mutS homolog 6',
    chrom: 'chr2',
    start: 47783287,
    end: 47807086,
    strand: '+',
    exonCount: 10,
    biotype: 'protein_coding',
    description: 'DNA mismatch repair protein Msh6',
  },
  MLH1: {
    symbol: 'MLH1',
    name: 'mutL homolog 1',
    chrom: 'chr3',
    start: 36993356,
    end: 37050896,
    strand: '+',
    exonCount: 19,
    biotype: 'protein_coding',
    description: 'DNA mismatch repair protein Mlh1',
  },
  PALB2: {
    symbol: 'PALB2',
    name: 'partner and localizer of BRCA2',
    chrom: 'chr16',
    start: 23603160,
    end: 23652678,
    strand: '-',
    exonCount: 13,
    biotype: 'protein_coding',
    description: 'Partner and localizer of BRCA2',
  },
  ATM: {
    symbol: 'ATM',
    name: 'ATM serine/threonine kinase',
    chrom: 'chr11',
    start: 108222484,
    end: 108369102,
    strand: '+',
    exonCount: 65,
    biotype: 'protein_coding',
    description: 'Serine-protein kinase ATM',
  },
  CHEK2: {
    symbol: 'CHEK2',
    name: 'checkpoint kinase 2',
    chrom: 'chr22',
    start: 28687743,
    end: 28742422,
    strand: '-',
    exonCount: 15,
    biotype: 'protein_coding',
    description: 'Serine/threonine-protein kinase Chk2',
  },
  BUB1B: {
    symbol: 'BUB1B',
    name: 'BUB1 mitotic checkpoint serine/threonine kinase B',
    chrom: 'chr15',
    start: 40361846,
    end: 40460937,
    strand: '+',
    exonCount: 23,
    biotype: 'protein_coding',
    description: 'Mitotic checkpoint serine/threonine-protein kinase BUB1 beta',
  },
};

const geneCache = new Map<string, GeneDefinition>();

function formatChrom(seqRegion: string): string {
  if (seqRegion.toLowerCase().startsWith('chr')) return seqRegion;
  return `chr${seqRegion}`;
}

/**
 * Synchronous / cached gene or locus resolver
 */
export function resolveGeneOrLocus(query: string, paddingBp: number = 2000): GeneLookupResult {
  if (!query || query.trim() === '') {
    return {
      found: false,
      source: 'unknown',
      message: 'Query string is empty.',
    };
  }

  const trimmed = query.trim();

  // 1. Direct locus coordinate parser (e.g. "chr1:1000-2000" or "chr1:15,340,000-15,360,000")
  const parsedLocus = parseLocus(trimmed);
  if (parsedLocus) {
    return {
      found: true,
      locus: parsedLocus,
      source: 'locus_parser',
      message: `Parsed direct genomic locus ${parsedLocus.chrom}:${parsedLocus.start}-${parsedLocus.end}`,
    };
  }

  // 2. Check in-memory memoization cache or local dictionary (case-insensitive)
  const upperSymbol = trimmed.toUpperCase();
  const cachedGene = geneCache.get(upperSymbol) || LOCAL_GENE_DICTIONARY[upperSymbol];

  if (cachedGene) {
    const paddedStart = Math.max(1, cachedGene.start - paddingBp);
    const paddedEnd = cachedGene.end + paddingBp;
    return {
      found: true,
      geneSymbol: cachedGene.symbol,
      geneInfo: cachedGene,
      locus: {
        chrom: cachedGene.chrom,
        start: paddedStart,
        end: paddedEnd,
      },
      source: 'database',
      message: `Resolved gene '${cachedGene.symbol}' to ${cachedGene.chrom}:${paddedStart}-${paddedEnd} (${cachedGene.description})`,
    };
  }

  return {
    found: false,
    source: 'unknown',
    message: `Gene symbol or locus '${query}' could not be resolved.`,
  };
}

/**
 * Async gene resolver with live Ensembl REST API lookup and fallback
 */
export async function resolveGeneOrLocusAsync(query: string, paddingBp: number = 5000): Promise<GeneLookupResult> {
  const syncResult = resolveGeneOrLocus(query, paddingBp);
  if (syncResult.found) {
    return syncResult;
  }

  if (!query || query.trim() === '') {
    return syncResult;
  }

  const upperSymbol = query.trim().toUpperCase();

  // 3. Query Ensembl REST API with retries
  if (typeof fetch !== 'undefined') {
    let lastError = null;
    let statusCode = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 15000) : null;
        const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
        const baseUrl = isNode || (typeof window !== 'undefined' && window.location.origin === 'null') ? 'https://rest.ensembl.org' : '/ensembl';
        const url = `${baseUrl}/lookup/symbol/homo_sapiens/${encodeURIComponent(upperSymbol)}?expand=0`;

        const response = await fetch(url, { 
          headers: { 'Accept': 'application/json' },
          signal: controller?.signal 
        });
        if (timeoutId) clearTimeout(timeoutId);

        statusCode = response.status;
        
        if (response.ok) {
          const data = await response.json();
          if (data && data.seq_region_name && data.start && data.end) {
            const geneDef: GeneDefinition = {
              symbol: data.display_name || upperSymbol,
              name: data.description || '',
              chrom: formatChrom(data.seq_region_name),
              start: data.start,
              end: data.end,
              strand: data.strand === 1 ? '+' : '-',
              biotype: data.biotype || 'protein_coding',
              description: data.description || `Ensembl gene ${data.id}`,
              assembly: data.assembly_name || 'GRCh38',
            };
            geneCache.set(upperSymbol, geneDef);

            const paddedStart = Math.max(1, geneDef.start - paddingBp);
            const paddedEnd = geneDef.end + paddingBp;
            return {
              found: true,
              geneSymbol: geneDef.symbol,
              geneInfo: geneDef,
              locus: {
                chrom: geneDef.chrom,
                start: paddedStart,
                end: paddedEnd,
              },
              source: 'database',
              message: `Resolved gene '${geneDef.symbol}' via Ensembl REST to ${geneDef.chrom}:${paddedStart}-${paddedEnd}`,
            };
          }
        }
        
        if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
          // Client error (e.g. 404 Not Found), no point in retrying
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[GeneLookup] Ensembl API lookup attempt ${attempt} failed for ${upperSymbol}:`, err?.message);
      }
      
      if (attempt < 3) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, attempt * 500));
      }
    }

    if (statusCode && statusCode >= 500) {
      return {
        found: false,
        source: 'unknown',
        message: `Ensembl API is currently unavailable (Status: ${statusCode}). Please try direct locus format (e.g. chr1:100-200).`,
      };
    } else if (lastError) {
      return {
        found: false,
        source: 'unknown',
        message: `Network error resolving gene '${query}'. Please check your connection or use direct locus format.`,
      };
    }
  }

  return {
    found: false,
    source: 'unknown',
    message: `Gene symbol or locus '${query}' could not be resolved.`,
  };
}
