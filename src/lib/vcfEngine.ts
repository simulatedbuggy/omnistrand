/**
 * vcfEngine.ts
 * 
 * Wraps @gmod/tabix + @gmod/vcf to provide a streaming VCF query interface.
 * Works entirely in-browser using HTML5 File objects (no server needed).
 */
import { TabixIndexedFile } from '@gmod/tabix';
import VCF from '@gmod/vcf';
import { BlobFile, RemoteFile } from 'generic-filehandle2';

export interface ParsedVariant {
  id: string;
  chrom: string;
  pos: number;
  ref: string;
  alt: string[];
  qual: number | null;
  filter: string; // normalized string e.g. "PASS", "MQ40;LowQual"
  isPass: boolean;
  info: Record<string, any>;
  genotypes: Record<string, {
    GT?: string[];
    AD?: number[];
    DP?: number[];
    GQ?: number[];
    PL?: number[];
    PGT?: string[];
    PID?: string[];
    [key: string]: any;
  }>;
  af?: number;
  dp?: number;
  ad?: number[];
  gq?: number;
  pl?: number[];
  fs?: number;
  sor?: number;
  mq?: number;
  qd?: number;
  dbSnpId?: string;
  type: 'SNP' | 'INDEL' | 'MNP' | 'OTHER';
}

export interface LocusRange {
  chrom: string;
  start: number;
  end: number;
}

/**
 * Parse a locus string like "chr15:40,689,400-40,689,500" into a LocusRange.
 */
export function parseLocus(locus: string): LocusRange | null {
  const cleaned = locus.replace(/,/g, '').trim();
  const match = cleaned.match(/^((?:chr)?\w+):(\d+)-(\d+)$/i);
  if (!match) return null;
  return {
    chrom: match[1],
    start: parseInt(match[2], 10),
    end: parseInt(match[3], 10),
  };
}

/**
 * Format a large number with commas for display.
 */
export function formatPosition(pos: number): string {
  return pos.toLocaleString();
}

/**
 * Normalize the raw FILTER field from @gmod/vcf into a string and calculate isPass.
 */
export function normalizeFilter(rawFilter: any): { filter: string; isPass: boolean } {
  if (rawFilter === undefined || rawFilter === null || rawFilter === '.' || (Array.isArray(rawFilter) && rawFilter.length === 0)) {
    return { filter: 'PASS', isPass: true };
  }
  if (Array.isArray(rawFilter)) {
    const filter = rawFilter.join(';');
    const isPass = rawFilter.length === 1 && (rawFilter[0] === 'PASS' || rawFilter[0] === '.');
    return { filter: filter || 'PASS', isPass };
  }
  const filter = String(rawFilter).trim();
  if (filter === '' || filter === '.') {
    return { filter: 'PASS', isPass: true };
  }
  const isPass = filter === 'PASS';
  return { filter, isPass };
}

/**
 * Classify the variant type from reference and alternate alleles.
 */
export function computeVariantType(ref: string, alt: string[]): 'SNP' | 'INDEL' | 'MNP' | 'OTHER' {
  if (!alt || alt.length === 0 || !alt[0]) return 'OTHER';
  
  // Check if any allele is symbolic e.g. <DEL>, * or contains colon
  if (alt.some(a => a.startsWith('<') || a.includes(':') || a === '*')) return 'OTHER';

  // Check if all alleles are SNPs (1bp substitutions)
  const allSnp = alt.every(a => ref.length === 1 && a.length === 1);
  if (allSnp) return 'SNP';

  // Check if all alleles are MNPs of equal length > 1
  const allMnp = alt.every(a => ref.length === a.length && ref.length > 1);
  if (allMnp) return 'MNP';

  // Check if any allele is an insertion or deletion
  const hasIndel = alt.some(a => ref.length !== a.length);
  if (hasIndel) return 'INDEL';

  return 'OTHER';
}

/**
 * Format a raw parsed record from @gmod/vcf into a strongly-typed ParsedVariant.
 */
export function formatParsedVariant(parsed: any, fallbackChrom?: string): ParsedVariant {
  const { filter, isPass } = normalizeFilter(parsed.FILTER);
  const genotypes = typeof parsed.SAMPLES === 'function' ? (parsed.SAMPLES() || {}) : (parsed.SAMPLES || {});
  const chrom = parsed.CHROM !== undefined ? String(parsed.CHROM) : (fallbackChrom || '');
  const pos = parsed.POS !== undefined ? Number(parsed.POS) : 0;
  const ref = parsed.REF !== undefined ? String(parsed.REF) : '';
  const alt: string[] = Array.isArray(parsed.ALT) ? parsed.ALT : (parsed.ALT ? [String(parsed.ALT)] : []);
  const qual = (parsed.QUAL !== undefined && parsed.QUAL !== null && parsed.QUAL !== '.') ? Number(parsed.QUAL) : null;
  const type = computeVariantType(ref, alt);
  const info: Record<string, any> = parsed.INFO || {};

  // Extract AF
  let af: number | undefined;
  if (info.AF !== undefined) {
    const rawAf = Array.isArray(info.AF) ? info.AF[0] : info.AF;
    const numAf = typeof rawAf === 'number' ? rawAf : parseFloat(rawAf);
    if (!isNaN(numAf)) af = numAf;
  } else if (info.AC !== undefined && info.AN !== undefined) {
    const rawAc = Array.isArray(info.AC) ? info.AC[0] : info.AC;
    const rawAn = Array.isArray(info.AN) ? info.AN[0] : info.AN;
    const ac = typeof rawAc === 'number' ? rawAc : parseFloat(rawAc);
    const an = typeof rawAn === 'number' ? rawAn : parseFloat(rawAn);
    if (!isNaN(ac) && !isNaN(an) && an > 0) af = ac / an;
  }

  // Extract DP
  let dp: number | undefined;
  if (info.DP !== undefined) {
    const rawDp = Array.isArray(info.DP) ? info.DP[0] : info.DP;
    const numDp = typeof rawDp === 'number' ? rawDp : parseInt(rawDp, 10);
    if (!isNaN(numDp)) dp = numDp;
  } else {
    const sampleKeys = Object.keys(genotypes);
    if (sampleKeys.length > 0) {
      const s = genotypes[sampleKeys[0]];
      if (s?.DP?.[0] !== undefined) {
        const numDp = typeof s.DP[0] === 'number' ? s.DP[0] : parseInt(s.DP[0], 10);
        if (!isNaN(numDp)) dp = numDp;
      } else if (Array.isArray(s?.AD) && s.AD.length >= 2) {
        dp = s.AD.reduce((a: number, b: number) => a + (Number(b) || 0), 0);
      }
    }
  }

  // Extract sample-level stats from first sample
  let ad: number[] | undefined;
  let gq: number | undefined;
  let pl: number[] | undefined;
  const sampleKeys = Object.keys(genotypes);
  if (sampleKeys.length > 0) {
    const s = genotypes[sampleKeys[0]];
    if (Array.isArray(s?.AD)) ad = s.AD.map((n: any) => Number(n) || 0);
    if (s?.GQ !== undefined) {
      const rawGq = Array.isArray(s.GQ) ? s.GQ[0] : s.GQ;
      const numGq = typeof rawGq === 'number' ? rawGq : parseInt(rawGq, 10);
      if (!isNaN(numGq)) gq = numGq;
    }
    if (Array.isArray(s?.PL)) pl = s.PL.map((n: any) => Number(n) || 0);
  }

  // Extract statistical fields from INFO
  const getNumeric = (val: any): number | undefined => {
    if (val === undefined || val === null) return undefined;
    const raw = Array.isArray(val) ? val[0] : val;
    const num = typeof raw === 'number' ? raw : parseFloat(raw);
    return isNaN(num) ? undefined : num;
  };
  const fs = getNumeric(info.FS);
  const sor = getNumeric(info.SOR);
  const mq = getNumeric(info.MQ);
  const qd = getNumeric(info.QD);

  // Extract dbSNP ID
  let dbSnpId: string | undefined;
  if (parsed.ID && Array.isArray(parsed.ID) && parsed.ID.length > 0 && parsed.ID[0] !== '.') {
    dbSnpId = parsed.ID[0];
  } else if (typeof parsed.ID === 'string' && parsed.ID !== '.' && parsed.ID.length > 0) {
    dbSnpId = parsed.ID;
  } else if (info.DB) {
    const rawId = Array.isArray(parsed.ID) ? parsed.ID[0] : parsed.ID;
    dbSnpId = (rawId && rawId !== '.') ? rawId : 'dbSNP';
  }

  // ID fallback
  const rawId = Array.isArray(parsed.ID) ? parsed.ID[0] : parsed.ID;
  const id = (rawId && rawId !== '.') ? rawId : `${chrom}:${pos}_${ref}/${alt.join(',')}`;

  return {
    id,
    chrom,
    pos,
    ref,
    alt,
    qual,
    filter,
    isPass,
    info,
    genotypes,
    af,
    dp,
    ad,
    gq,
    pl,
    fs,
    sor,
    mq,
    qd,
    dbSnpId,
    type,
  };
}

/**
 * Parse a raw VCF line into ParsedVariant using a VCF parser instance.
 */
export function parseRawVcfLineToParsedVariant(vcfParser: VCF, line: string, fallbackChrom?: string): ParsedVariant | null {
  const parsed = vcfParser.parseLine(line);
  if (!parsed) return null;
  return formatParsedVariant(parsed, fallbackChrom);
}

/**
 * Create a VCF query engine from local File objects.
 */
export async function createVcfEngine(vcfFile: File, indexFile: File) {
  const vcfBlob = new BlobFile(vcfFile);
  const tbiBlob = new BlobFile(indexFile);

  const tbiIndexed = new TabixIndexedFile({
    filehandle: vcfBlob,
    tbiFilehandle: tbiBlob,
  });

  // Read the VCF header to initialize the parser
  const headerText = await tbiIndexed.getHeader();
  const vcfParser = new VCF({ header: headerText });

  // Detect chromosome naming convention from the header
  // Some VCFs use "chr1", others use "1"
  const contigLines = headerText.split('\n').filter((l: string) => l.startsWith('##contig='));
  const hasChrPrefix = contigLines.some((l: string) => l.includes('ID=chr'));
  const hasNoChrPrefix = contigLines.some((l: string) => /ID=\d/.test(l));
  
  console.log(`[VcfEngine] Detected ${contigLines.length} contigs. chr prefix: ${hasChrPrefix}, no prefix: ${hasNoChrPrefix}`);
  console.log(`[VcfEngine] Sample contigs:`, contigLines.slice(0, 5));

  /**
   * Normalize chromosome name to match what the VCF file uses.
   * If user types "chr1" but VCF uses "1", strip the prefix.
   * If user types "1" but VCF uses "chr1", add the prefix.
   */
  function normalizeChrom(chrom: string): string[] {
    const candidates: string[] = [chrom];
    if (chrom.startsWith('chr')) {
      candidates.push(chrom.replace('chr', ''));
    } else {
      candidates.push('chr' + chrom);
    }
    return candidates;
  }

  return {
    /**
     * Query variants within a genomic range.
     * Automatically tries both chr-prefixed and non-prefixed chromosome names.
     */
    async query(chrom: string, start: number, end: number): Promise<ParsedVariant[]> {
      const variants: ParsedVariant[] = [];
      const chromCandidates = normalizeChrom(chrom);

      for (const chromName of chromCandidates) {
        try {
          await tbiIndexed.getLines(chromName, start, end, (line: string) => {
            try {
              const parsedVariant = parseRawVcfLineToParsedVariant(vcfParser, line, chromName);
              if (parsedVariant) {
                variants.push(parsedVariant);
              }
            } catch (e) {
              console.warn('Skipping malformed VCF line:', e);
            }
          });

          // If we found variants with this chromosome name, we're done
          if (variants.length > 0) break;
        } catch {
          // This chromosome name didn't work, try the next one
          console.log(`[VcfEngine] Chromosome "${chromName}" not found in index, trying alternative...`);
        }
      }

      return variants;
    },

    /**
     * Get the raw header text.
     */
    getHeader(): string {
      return headerText;
    },

    /**
     * Get sample names from the VCF header.
     */
    getSampleNames(): string[] {
      return vcfParser.samples || [];
    },

    /**
     * Get the list of contigs defined in the VCF header.
     */
    getContigs(): string[] {
      return contigLines.map((l: string) => {
        const match = l.match(/ID=([^,>]+)/);
        return match ? match[1] : '';
      }).filter(Boolean);
    },

    /**
     * Whether the VCF uses chr-prefixed chromosome names.
     */
    hasChrPrefix,
  };
}

/**
 * Create a VCF query engine from remote URLs (or local dev paths).
 */
export async function createVcfEngineFromUrls(vcfUrl: string, tbiUrl: string) {
  const vcfFilehandle = new RemoteFile(vcfUrl);
  const tbiFilehandle = new RemoteFile(tbiUrl);

  const tbiIndexed = new TabixIndexedFile({
    filehandle: vcfFilehandle,
    tbiFilehandle,
  });

  // Read the VCF header to initialize the parser
  const headerText = await tbiIndexed.getHeader();
  const vcfParser = new VCF({ header: headerText });

  const contigLines = headerText.split('\n').filter((l: string) => l.startsWith('##contig='));
  const hasChrPrefix = contigLines.some((l: string) => l.includes('ID=chr'));

  function normalizeChrom(chrom: string): string[] {
    const candidates: string[] = [chrom];
    if (chrom.startsWith('chr')) {
      candidates.push(chrom.replace('chr', ''));
    } else {
      candidates.push('chr' + chrom);
    }
    return candidates;
  }

  return {
    async query(chrom: string, start: number, end: number): Promise<ParsedVariant[]> {
      const variants: ParsedVariant[] = [];
      const chromCandidates = normalizeChrom(chrom);

      for (const chromName of chromCandidates) {
        try {
          await tbiIndexed.getLines(chromName, start, end, (line: string) => {
            try {
              const parsedVariant = parseRawVcfLineToParsedVariant(vcfParser, line, chromName);
              if (parsedVariant) {
                variants.push(parsedVariant);
              }
            } catch {}
          });
          if (variants.length > 0) break;
        } catch {}
      }
      return variants;
    },
    getHeader: () => headerText,
    getSampleNames: () => vcfParser.samples || [],
    getContigs: () => contigLines.map((l: string) => {
      const match = l.match(/ID=([^,>]+)/);
      return match ? match[1] : '';
    }).filter(Boolean),
    hasChrPrefix,
  };
}

export type VcfEngine = Awaited<ReturnType<typeof createVcfEngine>>;
