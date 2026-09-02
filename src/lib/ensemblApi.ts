/// <reference types="node" />
/**
 * ensemblApi.ts
 * 
 * Fetches genomic data from the Ensembl REST API (GRCh38).
 */

export interface EnsemblGene {
  id: string;
  display_name: string;
  biotype: string;
  start: number;
  end: number;
  strand: number;
  description: string;
  assembly_name: string;
}

export interface EnsemblSequence {
  id: string;
  seq: string;
  desc: string;
}

const ENSEMBL_REST_BASE = 'https://rest.ensembl.org';

/**
 * Normalizes chromosome string to standard Ensembl format (e.g., "chr1" -> "1").
 */
function normalizeChrom(chrom: string): string {
  if (chrom.toLowerCase().startsWith('chr')) {
    return chrom.substring(3);
  }
  return chrom;
}

const CHUNK_SIZE_GENES = 50000;
const geneCache: Record<string, Promise<EnsemblGene[]>> = {};

/**
 * Fetches genes overlapping a specific genomic region.
 * Uses GRCh38 by default. Aligns requested region to fixed chunks to optimize caching.
 */
export async function fetchGenes(chrom: string, start: number, end: number): Promise<EnsemblGene[]> {
  const normChrom = normalizeChrom(chrom);
  
  const startChunk = Math.floor((start - 1) / CHUNK_SIZE_GENES);
  const endChunk = Math.floor((end - 1) / CHUNK_SIZE_GENES);
  
  const chunkPromises: Promise<EnsemblGene[]>[] = [];
  
  for (let i = startChunk; i <= endChunk; i++) {
    const chunkKey = `${normChrom}:${i}`;
    
    if (!geneCache[chunkKey]) {
      const chunkStart = i * CHUNK_SIZE_GENES + 1;
      const chunkEnd = (i + 1) * CHUNK_SIZE_GENES;
      
      const url = `${ENSEMBL_REST_BASE}/overlap/region/human/${normChrom}:${chunkStart}-${chunkEnd}?feature=gene;content-type=application/json`;
      
      geneCache[chunkKey] = fetch(url)
        .then(async res => {
          if (!res.ok) {
            if (res.status === 400) return [];
            throw new Error(`Ensembl API error: ${res.statusText}`);
          }
          const data = await res.json();
          return data as EnsemblGene[];
        })
        .catch(err => {
          console.error('Failed to fetch genes chunk:', err);
          delete geneCache[chunkKey];
          return [];
        });
    }
    
    chunkPromises.push(geneCache[chunkKey]);
  }
  
  try {
    const chunkResults = await Promise.all(chunkPromises);
    
    const geneMap = new Map<string, EnsemblGene>();
    for (const chunkGenes of chunkResults) {
      for (const g of chunkGenes) {
        if (g.start <= end && g.end >= start) {
          geneMap.set(g.id, g);
        }
      }
    }
    
    return Array.from(geneMap.values());
  } catch (error) {
    console.error('Failed to fetch genes:', error);
    return [];
  }
}

const CHUNK_SIZE_SEQ = 5000;
const seqCache: Record<string, Promise<string>> = {};

/**
 * Fetches the reference DNA sequence for a specific genomic region.
 * Maximum allowed size is typically 10MB, but we should only call this for small windows (< 10kb).
 * Aligns requests to fixed chunks to optimize caching.
 */
export async function fetchSequence(chrom: string, start: number, end: number): Promise<string> {
  const normChrom = normalizeChrom(chrom);
  
  const startChunk = Math.floor((start - 1) / CHUNK_SIZE_SEQ);
  const endChunk = Math.floor((end - 1) / CHUNK_SIZE_SEQ);
  
  const chunkPromises: Promise<string>[] = [];
  
  for (let i = startChunk; i <= endChunk; i++) {
    const chunkKey = `${normChrom}:${i}`;
    
    if (!seqCache[chunkKey]) {
      const chunkStart = i * CHUNK_SIZE_SEQ + 1;
      const chunkEnd = (i + 1) * CHUNK_SIZE_SEQ;
      
      const url = `${ENSEMBL_REST_BASE}/sequence/region/human/${normChrom}:${chunkStart}..${chunkEnd}?coord_system_version=GRCh38;content-type=text/plain`;
      
      seqCache[chunkKey] = fetch(url)
        .then(async res => {
          if (!res.ok) {
            throw new Error(`Ensembl API error: ${res.statusText}`);
          }
          const data = await res.text();
          return data.trim();
        })
        .catch(err => {
          console.error('Failed to fetch sequence chunk:', err);
          delete seqCache[chunkKey];
          return 'N'.repeat(CHUNK_SIZE_SEQ);
        });
    }
    
    chunkPromises.push(seqCache[chunkKey]);
  }
  
  try {
    const chunkResults = await Promise.all(chunkPromises);
    
    let fullSeq = '';
    for (const seq of chunkResults) {
      fullSeq += seq;
    }
    
    const offset = (start - 1) - (startChunk * CHUNK_SIZE_SEQ);
    const length = end - start + 1;
    
    return fullSeq.substring(offset, offset + length);
  } catch (error) {
    console.error('Failed to fetch sequence:', error);
    return '';
  }
}
