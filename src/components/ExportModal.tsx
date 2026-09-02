import React, { useState, useMemo } from 'react';
import type { ParsedVariant } from '../lib/vcfEngine';
import { exportTrackData, downloadExportFile, copyToClipboard } from '../lib/exportUtils';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  filteredVariants: ParsedVariant[];
  allVariants: ParsedVariant[];
  currentLocus: { chrom: string; start: number; end: number };
  sampleName?: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  filteredVariants,
  allVariants,
  currentLocus,
  sampleName,
}) => {
  const [scope, setScope] = useState<'filtered' | 'all'>('filtered');
  const [copied, setCopied] = useState(false);
  const [reviewed, setReviewed] = useState(false);

  // Target variant set based on scope selection
  const targetVariants = scope === 'filtered' ? filteredVariants : allVariants;
  
  // Track 1 constraints validation
  const isValid = targetVariants.length > 0 && targetVariants.length <= 1000;

  // Generated export payload (strictly CSV)
  const exportPayload = useMemo(() => {
    try {
      return exportTrackData(targetVariants, 'csv', {
        sampleNames: sampleName ? [sampleName] : undefined,
        locus: currentLocus,
        metadata: {
          locus: `${currentLocus.chrom}:${currentLocus.start}-${currentLocus.end}`,
          scope,
          filteredCount: filteredVariants.length,
          totalCount: allVariants.length,
        },
      });
    } catch (err: any) {
      return {
        data: `Error generating export: ${err.message}`,
        mimeType: 'text/plain',
        extension: 'csv',
        count: 0,
      };
    }
  }, [targetVariants, sampleName, currentLocus, scope, filteredVariants.length, allVariants.length]);

  if (!isOpen) return null;

  const defaultFilename = `track1_submission_${currentLocus.chrom}_${currentLocus.start}-${currentLocus.end}.csv`;

  const handleDownload = () => {
    if (!reviewed || !isValid) return;
    downloadExportFile(exportPayload.data, defaultFilename, exportPayload.mimeType);
  };

  const handleCopy = async () => {
    if (!reviewed || !isValid) return;
    const success = await copyToClipboard(exportPayload.data);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Live preview lines (first 15 lines)
  const linesArray = exportPayload.data.split('\n');
  const totalLines = linesArray.length;
  const previewLines = linesArray.slice(0, 15).join('\n');

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-container-low border border-outline-variant rounded-xl w-[700px] max-w-[90vw] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-surface-container">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-secondary text-[24px]">publish</span>
            <div>
              <h3 className="text-headline-md font-semibold text-on-surface text-[17px] leading-tight">
                Track 1 Submission Export
              </h3>
              <p className="text-body-sm text-[12px] text-on-surface-variant">
                {currentLocus.chrom}:{currentLocus.start.toLocaleString()} - {currentLocus.end.toLocaleString()}
              </p>
            </div>
          </div>
          <button
            className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container-high transition-colors cursor-pointer"
            onClick={onClose}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex flex-col gap-5">
          {/* Validation Status */}
          {!isValid && (
            <div className="p-3 bg-error/10 border border-error/50 rounded-lg flex gap-2 items-start text-error">
              <span className="material-symbols-outlined text-[18px] mt-0.5">warning</span>
              <div className="text-sm">
                <strong>Submission Invalid:</strong> Must have between 1 and 1000 variants. Currently {targetVariants.length} variants selected.
              </div>
            </div>
          )}

          {/* Scope Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-label-md text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
              1. Select Data Scope
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScope('filtered')}
                className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                  scope === 'filtered'
                    ? 'bg-secondary/10 border-secondary text-on-surface shadow-[0_0_8px_rgba(97,219,180,0.2)]'
                    : 'bg-surface-container border-outline-variant/60 text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-xs text-on-surface">Filtered Variants</span>
                  <span className="px-2 py-0.5 rounded-full bg-secondary/20 text-secondary text-[11px] font-bold font-code-sm">
                    {filteredVariants.length} records
                  </span>
                </div>
                <span className="text-[11px] text-on-surface-variant">
                  Respects currently active QUAL, PASS, AF, and type filters.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setScope('all')}
                className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                  scope === 'all'
                    ? 'bg-secondary/10 border-secondary text-on-surface shadow-[0_0_8px_rgba(97,219,180,0.2)]'
                    : 'bg-surface-container border-outline-variant/60 text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-xs text-on-surface">All Loaded in View</span>
                  <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface text-[11px] font-bold font-code-sm">
                    {allVariants.length} records
                  </span>
                </div>
                <span className="text-[11px] text-on-surface-variant">
                  Exports entire raw cohort loaded in genomic window.
                </span>
              </button>
            </div>
          </div>

          {/* Live Syntax Preview */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-label-md text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                2. Live CSV Preview
              </label>
              <span className="text-[11px] font-code-sm text-on-surface-variant">
                Showing {Math.min(15, totalLines)} of {totalLines} lines
              </span>
            </div>

            <div className="bg-surface-container-lowest border border-outline-variant/80 rounded-lg p-3 max-h-44 overflow-x-auto overflow-y-auto font-code-sm text-[11px] text-on-surface-variant whitespace-pre select-text">
              {previewLines}
              {totalLines > 15 && '\n... (truncated for preview)'}
            </div>
          </div>

          {/* Human Review Checkbox */}
          <div className="flex flex-col gap-1.5">
            <label className="text-label-md text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
              3. Human Review
            </label>
            <label className="flex items-start gap-3 p-3 bg-surface-container border border-outline-variant/60 rounded-lg cursor-pointer hover:bg-surface-container-high transition-colors">
              <input 
                type="checkbox" 
                className="mt-0.5 accent-secondary w-4 h-4"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              <span className="text-sm text-on-surface leading-tight">
                I attest that I have manually reviewed these candidate variants and approve them for Track 1 submission. I understand that raw clinical data exports (VCF/JSON/BED) are restricted by policy.
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-surface-container border-t border-outline-variant flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] font-code-sm text-on-surface-variant truncate max-w-xs">
            File: <span className="text-on-surface">{defaultFilename}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!reviewed || !isValid}
              className="px-3.5 py-2 rounded bg-surface-container-high border border-outline-variant hover:bg-surface-container-highest text-on-surface font-label-md text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[16px] text-secondary">
                {copied ? 'check' : 'content_copy'}
              </span>
              {copied ? 'Copied!' : 'Copy CSV'}
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={!reviewed || !isValid}
              className="px-4 py-2 rounded bg-secondary text-on-secondary hover:brightness-110 font-label-md text-xs font-semibold transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(97,219,180,0.4)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              Download CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
