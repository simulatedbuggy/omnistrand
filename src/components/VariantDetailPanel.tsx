/**
 * VariantDetailPanel.tsx
 * 
 * Production-ready rich genomic variant detail panel.
 * Displays data-driven VCF metadata: Allelic Depths (AD) with visual ratio bars,
 * Population & Metric Badges (AF, DP, GQ, MQ, QD, QUAL), Sample Genotype Cards
 * with Phred likelihoods (PL) & Phasing, Strand Bias (FS, SOR, RankSum), dbSNP links,
 * and a searchable metadata inspector.
 * 
 * Conforms strictly to Tailwind CSS v4 design tokens and zero external UI libraries.
 */
import React, { useState, useMemo } from 'react';
import type { ParsedVariant } from '../lib/vcfEngine';
import { formatPosition } from '../lib/vcfEngine';

interface VariantDetailPanelProps {
  variant: ParsedVariant | null;
  onClose: () => void;
}

interface ExtractedVariantMetrics {
  typeLabel: 'SNP' | 'Insertion' | 'Deletion' | 'Complex';
  typeChipClass: string;
  isPass: boolean;
  filters: string[];
  rsId: string | null;
  hgvs: string;
  af: number | null;
  ac: number | null;
  an: number | null;
  dp: number | null;
  gq: number | null;
  mq: number | null;
  qd: number | null;
  fs: number | null;
  sor: number | null;
  baseQRankSum: number | null;
  mqRankSum: number | null;
  readPosRankSum: number | null;
  excessHet: number | null;
  refDepth: number;
  altDepth: number;
  totalAD: number;
  refPct: number;
  altPct: number;
}

/**
 * Helper to safely extract scalar number from potential array or string values
 */
function getNumericValue(val: any): number | null {
  if (val === undefined || val === null) return null;
  if (Array.isArray(val)) {
    if (val.length === 0) return null;
    const first = val[0];
    if (typeof first === 'number') return first;
    if (typeof first === 'string') {
      const parsed = parseFloat(first);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Derive human-readable zygosity string and styling from GT
 */
function getZygosityInfo(gt: string) {
  const cleanGt = gt.replace(/\|/g, '/');
  const isPhased = gt.includes('|');
  
  if (cleanGt === '0/0') {
    return {
      label: 'Homozygous Ref',
      chipClass: 'bg-surface-container-high text-on-surface-variant border border-outline-variant',
      isPhased,
    };
  }
  if (cleanGt === '0/1' || cleanGt === '1/0') {
    return {
      label: 'Heterozygous Alt',
      chipClass: 'bg-secondary/15 text-secondary border border-secondary/30',
      isPhased,
    };
  }
  if (cleanGt === '1/1') {
    return {
      label: 'Homozygous Alt',
      chipClass: 'bg-error/15 text-error border border-error/30',
      isPhased,
    };
  }
  if (cleanGt.includes('.')) {
    return {
      label: 'No Call',
      chipClass: 'bg-outline/10 text-outline border border-outline/20',
      isPhased,
    };
  }
  return {
    label: `Multi-allelic (${gt})`,
    chipClass: 'bg-primary/15 text-primary border border-primary/30',
    isPhased,
  };
}

/**
 * Extract all computed metrics, ratios, and annotations from ParsedVariant
 */
function extractVariantMetrics(variant: ParsedVariant): ExtractedVariantMetrics {
  const ref = variant.ref || '';
  const alts = variant.alt || [];
  const alt = alts[0] || '';

  // 1. Variant Type
  let typeLabel: 'SNP' | 'Insertion' | 'Deletion' | 'Complex' = 'Complex';
  if (ref.length === 1 && alt.length === 1) typeLabel = 'SNP';
  else if (alt.length > ref.length) typeLabel = 'Insertion';
  else if (alt.length < ref.length && alt.length > 0) typeLabel = 'Deletion';

  const typeChipClass =
    typeLabel === 'SNP' ? 'bg-secondary/15 text-secondary border border-secondary/30' :
    typeLabel === 'Insertion' ? 'bg-secondary-fixed/15 text-secondary-fixed border border-secondary-fixed/30' :
    typeLabel === 'Deletion' ? 'bg-error/15 text-error border border-error/30' :
    'bg-outline/15 text-outline border border-outline/30';

  // 2. Filters
  const rawFilter = variant.filter;
  let filters: string[] = [];
  if (Array.isArray(rawFilter)) {
    filters = rawFilter;
  } else if (typeof rawFilter === 'string' && rawFilter.trim().length > 0) {
    filters = rawFilter.split(';');
  } else {
    filters = ['PASS'];
  }
  const isPass = variant.isPass !== undefined ? variant.isPass : (filters.length === 1 && (filters[0] === 'PASS' || filters[0] === '.'));

  // 3. INFO Fields
  const info = variant.info || {};
  const af = variant.af !== undefined ? variant.af : getNumericValue(info.AF);
  const ac = getNumericValue(info.AC);
  const an = getNumericValue(info.AN);
  const dp = variant.dp !== undefined ? variant.dp : getNumericValue(info.DP);
  const mq = variant.mq !== undefined ? variant.mq : getNumericValue(info.MQ);
  const qd = variant.qd !== undefined ? variant.qd : getNumericValue(info.QD);
  const fs = variant.fs !== undefined ? variant.fs : getNumericValue(info.FS);
  const sor = variant.sor !== undefined ? variant.sor : getNumericValue(info.SOR);
  const baseQRankSum = getNumericValue(info.BaseQRankSum);
  const mqRankSum = getNumericValue(info.MQRankSum);
  const readPosRankSum = getNumericValue(info.ReadPosRankSum);
  const excessHet = getNumericValue(info.ExcessHet);

  // 4. dbSNP Identifier
  let rsId: string | null = null;
  if (variant.dbSnpId) {
    rsId = variant.dbSnpId;
  } else if (variant.id && variant.id.startsWith('rs')) {
    rsId = variant.id;
  } else if (info.DB === true && variant.id && variant.id !== '.') {
    rsId = variant.id;
  } else if (typeof info.dbSnpId === 'string') {
    rsId = info.dbSnpId;
  }

  // 5. HGVS Notation
  const hgvs = `g.${variant.pos}${variant.ref}>${variant.alt.join(',')}`;

  // 6. Sample Allelic Depth (AD) & Genotype Quality (GQ)
  let refDepth = 0;
  let altDepth = 0;
  let gq: number | null = variant.gq !== undefined ? variant.gq : null;

  const samples = variant.genotypes || {};
  const sampleKeys = Object.keys(samples);
  if (sampleKeys.length > 0) {
    const firstSample = samples[sampleKeys[0]];
    if (firstSample) {
      if (Array.isArray(firstSample.AD) && firstSample.AD.length >= 2) {
        refDepth = Number(firstSample.AD[0]) || 0;
        altDepth = Number(firstSample.AD[1]) || 0;
      } else if (variant.ad && variant.ad.length >= 2) {
        refDepth = Number(variant.ad[0]) || 0;
        altDepth = Number(variant.ad[1]) || 0;
      }
      if (gq === null && firstSample.GQ !== undefined) {
        gq = getNumericValue(firstSample.GQ);
      }
    }
  } else if (variant.ad && variant.ad.length >= 2) {
    refDepth = Number(variant.ad[0]) || 0;
    altDepth = Number(variant.ad[1]) || 0;
  }

  const totalAD = refDepth + altDepth;
  const refPct = totalAD > 0 ? (refDepth / totalAD) * 100 : 0;
  const altPct = totalAD > 0 ? (altDepth / totalAD) * 100 : 0;

  return {
    typeLabel,
    typeChipClass,
    isPass,
    filters,
    rsId,
    hgvs,
    af,
    ac,
    an,
    dp,
    gq,
    mq,
    qd,
    fs,
    sor,
    baseQRankSum,
    mqRankSum,
    readPosRankSum,
    excessHet,
    refDepth,
    altDepth,
    totalAD,
    refPct,
    altPct,
  };
}

const VariantDetailPanel: React.FC<VariantDetailPanelProps> = ({ variant, onClose }) => {
  const [activeTab, setActiveTab] = useState<'core' | 'info' | 'format'>('core');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedSection, setCopiedSection] = useState<'locus' | 'vcf' | 'json' | null>(null);

  const metrics = useMemo(() => {
    if (!variant) return null;
    return extractVariantMetrics(variant);
  }, [variant]);

  const sampleNames = useMemo(() => {
    if (!variant || !variant.genotypes) return [];
    return Object.keys(variant.genotypes);
  }, [variant]);

  if (!variant || !metrics) return null;

  const handleCopy = (type: 'locus' | 'vcf' | 'json', text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(type);
    setTimeout(() => setCopiedSection(null), 1800);
  };

  const rawVcfRow = `${variant.chrom}\t${variant.pos}\t${variant.id}\t${variant.ref}\t${variant.alt.join(',')}\t${variant.qual ?? '.'}\t${variant.filter}\t${Object.entries(variant.info).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`).join(';')}`;

  // Filtered INFO fields for search
  const filteredInfoEntries = Object.entries(variant.info || {}).filter(([k, v]) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return k.toLowerCase().includes(term) || String(v).toLowerCase().includes(term);
  });

  return (
    <div
      className="variant-detail-panel"
      style={{
        position: 'absolute',
        top: '80px',
        right: '24px',
        width: '420px',
        maxHeight: 'calc(100vh - 100px)',
        zIndex: 40,
        backgroundColor: 'rgba(26, 28, 28, 0.95)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--outline-variant)',
        borderRadius: '12px',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'slideUpFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* 1. Header Bar */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-outline-variant/70 shrink-0 bg-surface-container-low">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary text-[20px]">dna</span>
          <div>
            <h3 className="text-[15px] font-semibold text-on-surface leading-tight">Variant Inspector</h3>
            <span className="text-[11px] font-code-sm text-on-surface-variant">
              {variant.chrom}:{formatPosition(variant.pos)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
            title="Copy genomic coordinates"
            onClick={() => handleCopy('locus', `${variant.chrom}:${variant.pos}`)}
          >
            <span className="material-symbols-outlined text-[16px]">
              {copiedSection === 'locus' ? 'check' : 'content_copy'}
            </span>
          </button>
          <button
            className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors ml-1 close-btn"
            onClick={onClose}
            title="Close panel"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>

      {/* 2. Alleles, Status Badges & dbSNP Bar */}
      <div className="px-4 py-3 border-b border-outline-variant/50 bg-surface-container/60 shrink-0 flex flex-col gap-2.5">
        {/* Allele Sequence Card */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded bg-surface-container-high text-on-surface font-code-sm text-[13px] font-semibold border border-outline-variant">
              {variant.ref}
            </span>
            <span className="text-outline text-xs">→</span>
            {variant.alt.map((alt, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded bg-secondary/15 text-secondary font-code-sm text-[13px] font-semibold border border-secondary/30"
              >
                {alt}
              </span>
            ))}
          </div>
          <span className="text-[11px] font-code-sm text-on-surface-variant" title="HGVS syntax">
            {metrics.hgvs}
          </span>
        </div>

        {/* Badges row: Type, Filter, dbSNP */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {/* Variant Type Badge */}
          <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${metrics.typeChipClass}`}>
            {metrics.typeLabel}
          </span>

          {/* Filter Status Badges */}
          {metrics.isPass ? (
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-secondary/15 text-secondary border border-secondary/30 chip-pass">
              PASS
            </span>
          ) : (
            metrics.filters.map((f, i) => (
              <span
                key={i}
                className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-error/15 text-error border border-error/30 chip-fail"
              >
                {f}
              </span>
            ))
          )}

          {/* dbSNP External Link */}
          {metrics.rsId && (
            <a
              href={`https://www.ncbi.nlm.nih.gov/snp/${metrics.rsId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant text-[11px] font-code-sm text-secondary hover:underline ml-auto"
              title="View on NCBI dbSNP"
            >
              <span>{metrics.rsId}</span>
              <span className="material-symbols-outlined text-[12px]">open_in_new</span>
            </a>
          )}
        </div>
      </div>

      {/* 3. Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3.5 no-scrollbar">
        {/* SECTION A: Allelic Depth (AD) Visual Bar */}
        <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-surface-container border border-outline-variant/60">
          <div className="flex justify-between items-center text-[11px]">
            <span className="font-label-md font-semibold text-on-surface-variant uppercase tracking-wider">
              Allelic Depth (AD)
            </span>
            <span className="font-code-sm text-on-surface">{metrics.totalAD} reads</span>
          </div>

          {/* Segmented Depth Bar */}
          <div className="w-full h-3.5 rounded-full bg-surface-container-highest overflow-hidden flex border border-outline-variant/40">
            <div
              className="h-full bg-surface-container-high flex items-center justify-center text-[9px] font-code-sm text-on-surface-variant transition-all duration-300 relative"
              style={{ width: `${metrics.refPct}%` }}
              title={`Reference: ${metrics.refDepth} reads (${metrics.refPct.toFixed(1)}%)`}
            >
              {metrics.refPct >= 20 && <span>Ref {metrics.refDepth}</span>}
            </div>
            <div
              className="h-full bg-secondary flex items-center justify-center text-[9px] font-code-sm text-on-secondary font-bold transition-all duration-300 relative shadow-[0_0_8px_rgba(97,219,180,0.4)]"
              style={{ width: `${metrics.altPct}%` }}
              title={`Alternate: ${metrics.altDepth} reads (${metrics.altPct.toFixed(1)}%)`}
            >
              {metrics.altPct >= 20 && <span>Alt {metrics.altDepth}</span>}
            </div>
          </div>

          {/* Numerical Readout */}
          <div className="flex justify-between items-center text-[10px] font-code-sm text-on-surface-variant pt-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-surface-container-high border border-outline-variant inline-block"></span>
              <span>
                Ref ({variant.ref}): <strong className="text-on-surface">{metrics.refDepth}</strong> (
                {metrics.refPct.toFixed(1)}%)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-secondary inline-block"></span>
              <span>
                Alt ({variant.alt.join(',')}): <strong className="text-secondary">{metrics.altDepth}</strong> (
                {metrics.altPct.toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>

        {/* SECTION B: Population & Quality Metric Badges Grid */}
        <div className="grid grid-cols-3 gap-2">
          {/* 1. Allele Frequency (AF) */}
          <div className="p-2.5 rounded-lg bg-surface-container border border-outline-variant/60 flex flex-col justify-between">
            <span className="text-[10px] font-label-md text-on-surface-variant uppercase tracking-wider">
              Allele Freq (AF)
            </span>
            <div className="my-1">
              <span className="text-sm font-code-sm font-bold text-secondary">
                {metrics.af !== null ? `${(metrics.af * 100).toFixed(1)}%` : '—'}
              </span>
              {metrics.ac !== null && metrics.an !== null && (
                <span className="text-[10px] font-code-sm text-on-surface-variant block">
                  AC: {metrics.ac} / AN: {metrics.an}
                </span>
              )}
            </div>
            {metrics.af !== null && (
              <div className="w-full h-1 rounded-full bg-surface-container-highest overflow-hidden">
                <div className="h-full bg-secondary" style={{ width: `${Math.min(100, metrics.af * 100)}%` }}></div>
              </div>
            )}
          </div>

          {/* 2. Total Depth (DP) */}
          <div className="p-2.5 rounded-lg bg-surface-container border border-outline-variant/60 flex flex-col justify-between">
            <span className="text-[10px] font-label-md text-on-surface-variant uppercase tracking-wider">
              Total Depth (DP)
            </span>
            <div className="my-1">
              <span className="text-sm font-code-sm font-bold text-on-surface">
                {metrics.dp !== null ? `${metrics.dp}x` : '—'}
              </span>
              <span className="text-[10px] font-body-sm text-on-surface-variant block">Read coverage</span>
            </div>
            <div className="text-[10px] font-code-sm text-outline">
              {metrics.dp && metrics.dp >= 30 ? 'High Depth' : metrics.dp && metrics.dp >= 10 ? 'Adequate' : 'Low'}
            </div>
          </div>

          {/* 3. Genotype Quality (GQ) */}
          <div className="p-2.5 rounded-lg bg-surface-container border border-outline-variant/60 flex flex-col justify-between">
            <span className="text-[10px] font-label-md text-on-surface-variant uppercase tracking-wider">
              Genotype Qual (GQ)
            </span>
            <div className="my-1">
              <span
                className={`text-sm font-code-sm font-bold ${
                  metrics.gq !== null && metrics.gq >= 99
                    ? 'text-secondary'
                    : metrics.gq !== null && metrics.gq >= 30
                    ? 'text-on-surface'
                    : 'text-error'
                }`}
              >
                {metrics.gq !== null ? metrics.gq : '—'}
              </span>
              <span className="text-[10px] font-code-sm text-on-surface-variant block">
                {metrics.gq !== null && metrics.gq >= 99 ? 'Phred > 99.9%' : 'Sample confidence'}
              </span>
            </div>
            <div className="w-full h-1 rounded-full bg-surface-container-highest overflow-hidden">
              <div className="h-full bg-secondary" style={{ width: `${Math.min(100, metrics.gq || 0)}%` }}></div>
            </div>
          </div>

          {/* 4. Mapping Quality (MQ) */}
          <div className="p-2.5 rounded-lg bg-surface-container border border-outline-variant/60 flex flex-col justify-between">
            <span className="text-[10px] font-label-md text-on-surface-variant uppercase tracking-wider">
              Mapping Qual (MQ)
            </span>
            <div className="my-1">
              <span className="text-sm font-code-sm font-bold text-on-surface">
                {metrics.mq !== null ? metrics.mq.toFixed(1) : '—'}
              </span>
              <span className="text-[10px] font-body-sm text-on-surface-variant block">RMS quality</span>
            </div>
            <div className="text-[10px] font-code-sm text-outline">
              {metrics.mq && metrics.mq >= 60 ? 'Optimal' : metrics.mq && metrics.mq >= 40 ? 'Moderate' : 'Low'}
            </div>
          </div>

          {/* 5. Qual By Depth (QD) */}
          <div className="p-2.5 rounded-lg bg-surface-container border border-outline-variant/60 flex flex-col justify-between">
            <span className="text-[10px] font-label-md text-on-surface-variant uppercase tracking-wider">
              Qual By Depth (QD)
            </span>
            <div className="my-1">
              <span
                className={`text-sm font-code-sm font-bold ${
                  metrics.qd !== null && metrics.qd >= 2.0 ? 'text-on-surface' : 'text-error'
                }`}
              >
                {metrics.qd !== null ? metrics.qd.toFixed(2) : '—'}
              </span>
              <span className="text-[10px] font-body-sm text-on-surface-variant block">GATK threshold &ge; 2</span>
            </div>
            <div className="text-[10px] font-code-sm text-outline">
              {metrics.qd && metrics.qd >= 5 ? 'High' : metrics.qd && metrics.qd >= 2 ? 'Passable' : 'Warning'}
            </div>
          </div>

          {/* 6. Overall QUAL Score */}
          <div className="p-2.5 rounded-lg bg-surface-container border border-outline-variant/60 flex flex-col justify-between">
            <span className="text-[10px] font-label-md text-on-surface-variant uppercase tracking-wider">
              Overall QUAL
            </span>
            <div className="my-1">
              <span className="text-sm font-code-sm font-bold text-on-surface">
                {variant.qual !== null ? variant.qual.toFixed(1) : '—'}
              </span>
              <span className="text-[10px] font-body-sm text-on-surface-variant block">Phred score</span>
            </div>
            <div className="text-[10px] font-code-sm text-outline">
              {variant.qual && variant.qual > 100 ? 'High Confidence' : 'Standard'}
            </div>
          </div>
        </div>

        {/* SECTION C: Sample Genotype Cards */}
        {sampleNames.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-label-md font-semibold text-on-surface-variant uppercase tracking-wider">
              Sample Genotypes ({sampleNames.length})
            </span>
            <div className="flex flex-col gap-2">
              {sampleNames.map((sampleName) => {
                const sampleData = variant.genotypes[sampleName] || {};
                const gtVal = Array.isArray(sampleData.GT) ? sampleData.GT[0] : (sampleData.GT || './.');
                const zygosity = getZygosityInfo(gtVal);
                const plArray = Array.isArray(sampleData.PL) ? sampleData.PL : null;
                const sampleAd = Array.isArray(sampleData.AD) ? sampleData.AD : null;

                return (
                  <div
                    key={sampleName}
                    className="p-3 rounded-lg bg-surface-container border border-outline-variant/60 flex flex-col gap-2"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-secondary">person</span>
                        <span className="font-code-sm text-xs font-bold text-on-surface">{sampleName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${zygosity.chipClass}`}>
                          {zygosity.label}
                        </span>
                        {zygosity.isPhased && (
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-container-highest text-secondary border border-secondary/30"
                            title="Phased genotype"
                          >
                            Phased
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px] font-code-sm bg-surface-container-low p-2 rounded border border-outline-variant/30">
                      <div>
                        <span className="text-[9px] text-on-surface-variant block">Genotype (GT)</span>
                        <span className="text-on-surface font-bold">{gtVal}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-on-surface-variant block">Allelic Depth (AD)</span>
                        <span className="text-on-surface">
                          {sampleAd ? `${sampleAd[0]} / ${sampleAd[1] ?? 0}` : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-on-surface-variant block">Genotype Qual (GQ)</span>
                        <span className="text-secondary font-bold">
                          {sampleData.GQ !== undefined ? (Array.isArray(sampleData.GQ) ? sampleData.GQ[0] : sampleData.GQ) : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Phred-scaled Likelihoods (PL) */}
                    {plArray && plArray.length > 0 && (
                      <div className="flex items-center justify-between text-[10px] font-code-sm pt-0.5 text-on-surface-variant">
                        <span>Likelihoods (PL):</span>
                        <div className="flex gap-1">
                          {plArray.map((pl: number, idx: number) => {
                            const isZero = pl === 0;
                            return (
                              <span
                                key={idx}
                                className={`px-1.5 py-0.2 rounded border ${
                                  isZero
                                    ? 'bg-secondary/15 text-secondary border-secondary/40 font-bold'
                                    : 'bg-surface-container-high text-on-surface-variant border-outline-variant/40'
                                }`}
                                title={`Genotype state ${idx}: PL=${pl}`}
                              >
                                {pl}
                                {isZero && '*'}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SECTION D: Strand Bias & Statistical Metrics */}
        {(metrics.fs !== null || metrics.sor !== null || metrics.baseQRankSum !== null) && (
          <div className="p-3 rounded-lg bg-surface-container border border-outline-variant/60 flex flex-col gap-2">
            <span className="text-[11px] font-label-md font-semibold text-on-surface-variant uppercase tracking-wider">
              Strand Bias & Statistical Tests
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between items-center bg-surface-container-high/60 p-2 rounded border border-outline-variant/30">
                <span className="font-label-md text-on-surface-variant">Fisher Strand (FS):</span>
                <span
                  className={`font-code-sm font-bold ${
                    metrics.fs !== null && metrics.fs > 60 ? 'text-error' : 'text-on-surface'
                  }`}
                >
                  {metrics.fs !== null ? metrics.fs.toFixed(3) : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center bg-surface-container-high/60 p-2 rounded border border-outline-variant/30">
                <span className="font-label-md text-on-surface-variant">Strand Odds Ratio (SOR):</span>
                <span
                  className={`font-code-sm font-bold ${
                    metrics.sor !== null && metrics.sor > 3 ? 'text-error' : 'text-on-surface'
                  }`}
                >
                  {metrics.sor !== null ? metrics.sor.toFixed(3) : '—'}
                </span>
              </div>
            </div>

            {/* RankSum Tests Grid */}
            <div className="grid grid-cols-3 gap-1.5 text-[11px] font-code-sm">
              <div className="bg-surface-container-low p-1.5 rounded text-center border border-outline-variant/20">
                <span className="text-[9px] text-on-surface-variant block">BaseQRankSum</span>
                <span className="text-on-surface font-semibold">
                  {metrics.baseQRankSum !== null ? metrics.baseQRankSum.toFixed(3) : '—'}
                </span>
              </div>
              <div className="bg-surface-container-low p-1.5 rounded text-center border border-outline-variant/20">
                <span className="text-[9px] text-on-surface-variant block">MQRankSum</span>
                <span className="text-on-surface font-semibold">
                  {metrics.mqRankSum !== null ? metrics.mqRankSum.toFixed(3) : '—'}
                </span>
              </div>
              <div className="bg-surface-container-low p-1.5 rounded text-center border border-outline-variant/20">
                <span className="text-[9px] text-on-surface-variant block">ReadPosRankSum</span>
                <span className="text-on-surface font-semibold">
                  {metrics.readPosRankSum !== null ? metrics.readPosRankSum.toFixed(3) : '—'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* SECTION E: Metadata Inspector (Searchable INFO & FORMAT) */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-label-md font-semibold text-on-surface-variant uppercase tracking-wider">
              Metadata Explorer
            </span>
            <div className="flex gap-1.5 text-[10px]">
              <button
                className={`px-2 py-0.5 rounded transition-colors ${
                  activeTab === 'core'
                    ? 'bg-secondary/20 text-secondary border border-secondary/40'
                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                }`}
                onClick={() => setActiveTab('core')}
              >
                INFO ({Object.keys(variant.info || {}).length})
              </button>
              <button
                className={`px-2 py-0.5 rounded transition-colors ${
                  activeTab === 'format'
                    ? 'bg-secondary/20 text-secondary border border-secondary/40'
                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                }`}
                onClick={() => setActiveTab('format')}
              >
                FORMAT
              </button>
            </div>
          </div>

          {/* Search box for metadata */}
          <div className="relative">
            <input
              type="text"
              placeholder="Filter metadata tags (e.g. AF, RankSum)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-surface-container border border-outline-variant rounded-md py-1.5 pl-7 pr-3 text-xs text-on-surface focus:outline-none focus:border-secondary transition-all font-body-sm placeholder:text-on-surface-variant/60"
            />
            <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-[14px]">
              search
            </span>
            {searchTerm && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface text-xs"
                onClick={() => setSearchTerm('')}
              >
                ✕
              </button>
            )}
          </div>

          {/* Info Key-Value Table */}
          {activeTab === 'core' && (
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto no-scrollbar border border-outline-variant/40 rounded-lg p-1 bg-surface-container-low">
              {filteredInfoEntries.length === 0 ? (
                <span className="text-xs text-on-surface-variant text-center py-3">No matching tags found</span>
              ) : (
                filteredInfoEntries.map(([key, value]) => (
                  <div
                    key={key}
                    className="flex justify-between items-start py-1 px-2 rounded hover:bg-surface-container-high/60 transition-colors text-xs font-code-sm"
                  >
                    <span className="text-secondary font-medium shrink-0">{key}</span>
                    <span className="text-on-surface text-right break-all pl-2">
                      {Array.isArray(value) ? value.join(', ') : String(value)}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Format Table */}
          {activeTab === 'format' && sampleNames.length > 0 && (
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto no-scrollbar border border-outline-variant/40 rounded-lg p-1 bg-surface-container-low">
              {Object.entries(variant.genotypes[sampleNames[0]] || {}).map(([key, value]) => (
                <div
                  key={key}
                  className="flex justify-between items-start py-1 px-2 rounded hover:bg-surface-container-high/60 transition-colors text-xs font-code-sm"
                >
                  <span className="text-secondary-fixed font-medium shrink-0">{key}</span>
                  <span className="text-on-surface text-right break-all pl-2">
                    {Array.isArray(value) ? value.join(', ') : String(value)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4. Footer Action Bar */}
      <div className="px-4 py-2.5 border-t border-outline-variant/70 bg-surface-container-low flex justify-between items-center shrink-0">
        <span className="text-[10px] font-code-sm text-on-surface-variant">
          ID: <strong className="text-on-surface">{variant.id || '.'}</strong>
        </span>
        <div className="flex gap-2">
          <button
            className="px-2.5 py-1 rounded bg-surface-container border border-outline-variant hover:bg-surface-container-high text-on-surface text-[11px] font-label-md transition-colors"
            onClick={() => handleCopy('vcf', rawVcfRow)}
          >
            {copiedSection === 'vcf' ? 'Copied VCF!' : 'Copy VCF Row'}
          </button>
          <button
            className="px-2.5 py-1 rounded bg-surface-container border border-outline-variant hover:bg-surface-container-high text-on-surface text-[11px] font-label-md transition-colors"
            onClick={() => handleCopy('json', JSON.stringify(variant, null, 2))}
          >
            {copiedSection === 'json' ? 'Copied JSON!' : 'Copy JSON'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VariantDetailPanel;
