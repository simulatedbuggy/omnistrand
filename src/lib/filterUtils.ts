/**
 * src/lib/filterUtils.ts
 * 
 * High-performance, multi-parameter variant filter engine.
 * Supports:
 * - Minimum QUAL threshold
 * - PASS-only status toggle
 * - Variant Types multi-selection (SNP, INDEL, MNP, OTHER)
 * - Minimum Allele Frequency (AF)
 * - Free-text search matching ID, locus, REF>ALT alleles, gene symbols, and dbSNP IDs
 */

import type { ParsedVariant } from './vcfEngine';
import { detectVariantType, extractVariantAF, normalizeFilterStatus } from './exportUtils';

export interface VariantFilters {
  minQual: number | null;
  filterPassOnly: boolean;
  variantTypes: ('SNP' | 'INDEL' | 'MNP' | 'OTHER')[];
  minAf: number | null;
  searchTerm: string;
}

export const DEFAULT_VARIANT_FILTERS: VariantFilters = {
  minQual: null,
  filterPassOnly: false,
  variantTypes: ['SNP', 'INDEL', 'MNP', 'OTHER'],
  minAf: null,
  searchTerm: '',
};

/**
 * Evaluates variants against the active filter ruleset.
 */
export function evaluateVariantFilters(
  variants: ParsedVariant[],
  filters: Partial<VariantFilters>
): ParsedVariant[] {
  if (!variants || variants.length === 0) return [];

  const minQual = filters.minQual ?? null;
  const filterPassOnly = filters.filterPassOnly ?? false;
  const variantTypes = filters.variantTypes ?? ['SNP', 'INDEL', 'MNP', 'OTHER'];
  const minAf = filters.minAf ?? null;
  const rawTerm = filters.searchTerm ? filters.searchTerm.trim().toLowerCase() : '';

  return variants.filter((variant) => {
    // 1. Min Quality Filter
    if (minQual !== null && minQual !== undefined) {
      if (variant.qual === null || variant.qual === undefined || variant.qual < minQual) {
        return false;
      }
    }

    // 2. PASS-Only Filter
    if (filterPassOnly) {
      const { isPass } = normalizeFilterStatus(variant.filter);
      if (!isPass) {
        return false;
      }
    }

    // 3. Variant Types Filter
    if (variantTypes && variantTypes.length > 0) {
      const vType = (variant as any).type || detectVariantType(variant);
      if (!variantTypes.includes(vType)) {
        return false;
      }
    }

    // 4. Min Allele Frequency (AF) Filter
    if (minAf !== null && minAf !== undefined) {
      const af = extractVariantAF(variant);
      if (af === null || af < minAf) {
        return false;
      }
    }

    // 5. Free-Text Search Filter
    if (rawTerm !== '') {
      const matchId = variant.id ? variant.id.toLowerCase().includes(rawTerm) : false;
      const matchPos = `${variant.chrom}:${variant.pos}`.toLowerCase().includes(rawTerm);
      const matchRefAlt =
        `${variant.ref}>${variant.alt.join(',')}`.toLowerCase().includes(rawTerm) ||
        `${variant.ref}/${variant.alt.join(',')}`.toLowerCase().includes(rawTerm);
      const matchGene = variant.info?.GENE ? String(variant.info.GENE).toLowerCase().includes(rawTerm) : false;
      const matchSymbol = variant.info?.SYMBOL ? String(variant.info.SYMBOL).toLowerCase().includes(rawTerm) : false;
      const matchDbSnp = (variant as any).dbSnpId ? (variant as any).dbSnpId.toLowerCase().includes(rawTerm) : false;

      if (!matchId && !matchPos && !matchRefAlt && !matchGene && !matchSymbol && !matchDbSnp) {
        return false;
      }
    }

    return true;
  });
}
