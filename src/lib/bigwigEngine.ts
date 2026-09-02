/**
 * bigwigEngine.ts
 * 
 * Fetches and parses BigWig coverage data using @gmod/bbi.
 */
import { BigWig } from '@gmod/bbi';
import { RemoteFile } from 'generic-filehandle2';

export interface CoverageFeature {
  start: number;
  end: number;
  score: number;
}

/**
 * Creates a BigWig engine from a URL.
 */
export async function createBigwigEngineFromUrl(url: string) {
  const filehandle = new RemoteFile(url);
  const bw = new BigWig({ filehandle });
  await bw.getHeader();

  return {
    async query(chrom: string, start: number, end: number, numBins: number = 1000): Promise<CoverageFeature[]> {
      try {
        const bpPerBin = (end - start) / numBins;
        const features = await bw.getFeatures(chrom, start, end, { scale: 1 / bpPerBin });
        return features as CoverageFeature[];
      } catch (e) {
        console.warn(`BigWig query failed for ${chrom}:${start}-${end}`, e);
        // Fallback or retry with "chr" prefix swap
        try {
          const altChrom = chrom.startsWith('chr') ? chrom.replace('chr', '') : `chr${chrom}`;
          const bpPerBin = (end - start) / numBins;
          const features = await bw.getFeatures(altChrom, start, end, { scale: 1 / bpPerBin });
          return features as CoverageFeature[];
        } catch {
          return [];
        }
      }
    }
  };
}

export type BigwigEngine = Awaited<ReturnType<typeof createBigwigEngineFromUrl>>;
