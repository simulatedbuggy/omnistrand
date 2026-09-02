/**
 * src/components/VariantFilterToolbar.tsx
 * 
 * Interactive filtering toolbar for genomic variants.
 * Features:
 * - Free-text search input (rsID, pos, alleles, gene)
 * - PASS-only toggle badge
 * - Variant type selection pills (SNP, INDEL, MNP, OTHER)
 * - Minimum QUAL slider & presets
 * - Minimum Allele Frequency (AF) slider & presets
 * - Live count chip and quick-reset action
 */

import React, { useState } from 'react';
import type { VariantFilters } from '../lib/filterUtils';
import { DEFAULT_VARIANT_FILTERS } from '../lib/filterUtils';

interface VariantFilterToolbarProps {
  filters: VariantFilters;
  onChange: (filters: VariantFilters) => void;
  totalCount: number;
  filteredCount: number;
}

const VARIANT_TYPES: Array<{ id: 'SNP' | 'INDEL' | 'MNP' | 'OTHER'; label: string; color: string }> = [
  { id: 'SNP', label: 'SNP', color: 'text-secondary border-secondary/40 bg-secondary/15' },
  { id: 'INDEL', label: 'INDEL', color: 'text-secondary-fixed border-secondary-fixed/40 bg-secondary-fixed/15' },
  { id: 'MNP', label: 'MNP', color: 'text-primary border-primary/40 bg-primary/15' },
  { id: 'OTHER', label: 'OTHER', color: 'text-outline border-outline/40 bg-outline/15' },
];

export const VariantFilterToolbar: React.FC<VariantFilterToolbarProps> = ({
  filters,
  onChange,
  totalCount,
  filteredCount,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const hasActiveFilters =
    filters.minQual !== null ||
    filters.filterPassOnly ||
    filters.variantTypes.length < 4 ||
    filters.minAf !== null ||
    filters.searchTerm.trim() !== '';

  const handleToggleType = (typeId: 'SNP' | 'INDEL' | 'MNP' | 'OTHER') => {
    const current = filters.variantTypes;
    if (current.includes(typeId)) {
      onChange({ ...filters, variantTypes: current.filter((t) => t !== typeId) });
    } else {
      onChange({ ...filters, variantTypes: [...current, typeId] });
    }
  };

  const handleReset = () => {
    onChange(DEFAULT_VARIANT_FILTERS);
  };

  return (
    <div className="bg-surface-container border border-outline-variant rounded-lg p-2.5 flex flex-col gap-2 shadow-sm text-on-surface">
      {/* Top Primary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Search Box */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[16px] pointer-events-none">
            search
          </span>
          <input
            type="text"
            placeholder="Filter variants (rsID, pos, allele, gene)..."
            value={filters.searchTerm}
            onChange={(e) => onChange({ ...filters, searchTerm: e.target.value })}
            className="w-full bg-surface-container-high border border-outline-variant rounded-md py-1 pl-8 pr-7 text-xs text-on-surface focus:outline-none focus:border-secondary transition-all font-body-sm placeholder:text-on-surface-variant"
          />
          {filters.searchTerm && (
            <button
              onClick={() => onChange({ ...filters, searchTerm: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface text-xs"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Center: Quick Toggles */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* PASS Only Toggle */}
          <button
            type="button"
            onClick={() => onChange({ ...filters, filterPassOnly: !filters.filterPassOnly })}
            className={`px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-wider transition-all border flex items-center gap-1 cursor-pointer ${
              filters.filterPassOnly
                ? 'bg-secondary text-on-secondary border-secondary shadow-[0_0_8px_rgba(97,219,180,0.4)]'
                : 'bg-surface-container-high text-on-surface-variant border-outline-variant hover:text-on-surface hover:bg-surface-container-highest'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">
              {filters.filterPassOnly ? 'check_circle' : 'circle'}
            </span>
            PASS Only
          </button>

          {/* Type Pills */}
          <div className="flex items-center gap-1 bg-surface-container-low p-0.5 rounded border border-outline-variant/60">
            {VARIANT_TYPES.map((t) => {
              const isSelected = filters.variantTypes.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleToggleType(t.id)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold tracking-wider transition-all cursor-pointer ${
                    isSelected
                      ? `${t.color} border`
                      : 'text-on-surface-variant/40 hover:text-on-surface-variant opacity-60 border border-transparent'
                  }`}
                  title={`Toggle ${t.label} variants`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Advanced Filters Expand Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`px-2 py-1 rounded border text-xs flex items-center gap-1 transition-colors cursor-pointer ${
              showAdvanced || filters.minQual !== null || filters.minAf !== null
                ? 'bg-secondary/15 text-secondary border-secondary/40'
                : 'bg-surface-container-high text-on-surface-variant border-outline-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">tune</span>
            <span>Metrics</span>
            {(filters.minQual !== null || filters.minAf !== null) && (
              <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
            )}
          </button>
        </div>

        {/* Right: Counter & Reset */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-high border border-outline-variant text-[11px] font-code-sm">
            <span className="text-on-surface-variant">Variants:</span>
            <strong className={filteredCount < totalCount ? 'text-secondary' : 'text-on-surface'}>
              {filteredCount}
            </strong>
            <span className="text-outline">/</span>
            <span className="text-on-surface-variant">{totalCount}</span>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleReset}
              className="px-2 py-1 text-xs text-error hover:underline flex items-center gap-0.5 cursor-pointer"
              title="Reset all filters to defaults"
            >
              <span className="material-symbols-outlined text-[14px]">restart_alt</span>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Advanced Sliders Drawer */}
      {showAdvanced && (
        <div className="pt-2 border-t border-outline-variant/60 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-surface-container-low/60 p-2.5 rounded-md mt-1">
          {/* Minimum QUAL Slider & Presets */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-label-md font-semibold text-on-surface-variant uppercase tracking-wider">
                Min Quality Score (QUAL)
              </span>
              <span className="font-code-sm text-secondary font-bold">
                {filters.minQual !== null ? `≥ ${filters.minQual}` : 'All (No min)'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="200"
                step="5"
                value={filters.minQual ?? 0}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onChange({ ...filters, minQual: val === 0 ? null : val });
                }}
                className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-secondary"
              />
            </div>

            <div className="flex gap-1.5 text-[10px]">
              {[
                { label: 'All', val: null },
                { label: '≥ 30', val: 30 },
                { label: '≥ 60', val: 60 },
                { label: '≥ 100', val: 100 },
                { label: '≥ 140', val: 140 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onChange({ ...filters, minQual: p.val })}
                  className={`px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                    filters.minQual === p.val
                      ? 'bg-secondary/20 text-secondary border-secondary/40 font-bold'
                      : 'bg-surface-container text-on-surface-variant border-outline-variant hover:text-on-surface'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Minimum Allele Frequency (AF) Slider & Presets */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-label-md font-semibold text-on-surface-variant uppercase tracking-wider">
                Min Allele Frequency (AF)
              </span>
              <span className="font-code-sm text-secondary font-bold">
                {filters.minAf !== null ? `≥ ${(filters.minAf * 100).toFixed(1)}%` : 'All (No min)'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={filters.minAf ?? 0}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  onChange({ ...filters, minAf: val === 0 ? null : val });
                }}
                className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-secondary"
              />
            </div>

            <div className="flex gap-1.5 text-[10px]">
              {[
                { label: 'All', val: null },
                { label: '≥ 1%', val: 0.01 },
                { label: '≥ 5%', val: 0.05 },
                { label: '≥ 20%', val: 0.20 },
                { label: '≥ 50%', val: 0.50 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onChange({ ...filters, minAf: p.val })}
                  className={`px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                    filters.minAf === p.val
                      ? 'bg-secondary/20 text-secondary border-secondary/40 font-bold'
                      : 'bg-surface-container text-on-surface-variant border-outline-variant hover:text-on-surface'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VariantFilterToolbar;
