import React, { useEffect, useRef } from 'react';

interface DiscoveryPanelProps {
  uniprotId?: string;
  highlightResidue?: number | null;
  focusResidues?: { start: number; end?: number } | null;
  viewerRepresentation?: 'cartoon' | 'surface' | 'ball-and-stick';
  aiCommentary?: string | null;
}

const DiscoveryPanel: React.FC<DiscoveryPanelProps> = ({ 
  uniprotId = '', 
  highlightResidue = null,
  focusResidues = null,
  viewerRepresentation = 'cartoon',
  aiCommentary = null
}) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const pluginInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!viewerRef.current || !uniprotId) return;
    
    // Clear previous viewer content
    viewerRef.current.innerHTML = '';
    
    if ((window as any).PDBeMolstarPlugin) {
      const plugin = new (window as any).PDBeMolstarPlugin();
      pluginInstanceRef.current = plugin;
      
      const options = {
        customData: {
          url: `https://alphafold.ebi.ac.uk/files/AF-${uniprotId}-F1-model_v6.cif`,
          format: 'cif'
        },
        alphafoldView: true,
        bgColor: { r: 13, g: 13, b: 13 }, // Dark theme matching background
        hideControls: false,
      };
      
      plugin.render(viewerRef.current, options);
    }
  }, [uniprotId]);

  useEffect(() => {
    if (pluginInstanceRef.current && highlightResidue !== null) {
      try {
        pluginInstanceRef.current.visual.select({
          data: [{
            residue_number: highlightResidue
          }]
        });
      } catch (e) {
        console.error('Failed to highlight residue:', e);
      }
    }
  }, [highlightResidue]);

  useEffect(() => {
    if (pluginInstanceRef.current && focusResidues !== null) {
      try {
        pluginInstanceRef.current.visual.focus([{
          residue_number: focusResidues.start,
        }]);
      } catch (e) {
        console.error('Failed to focus residues:', e);
      }
    }
  }, [focusResidues]);

  useEffect(() => {
    if (pluginInstanceRef.current && viewerRepresentation) {
      // Future hook for Molstar visualization updates
    }
  }, [viewerRepresentation]);

  return (
    <div className="flex flex-col md:flex-row h-full gap-4 w-full">
      {/* Left Column: 3D Structure Viewer (Takes 2/3 of width) */}
        <div className="w-full md:w-2/3 bg-surface-container border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col relative">
          <div className="px-4 py-3 border-b border-outline-variant bg-surface-container-low flex justify-between items-center">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Protein Structure (AlphaFold)</h2>
            {uniprotId && <span className="text-body-sm text-secondary font-mono">{uniprotId}</span>}
          </div>
          <div className="flex-1 relative bg-background/50 flex flex-col items-center justify-center">
            {uniprotId ? (
              <div ref={viewerRef} className="absolute inset-0" />
            ) : (
              <div className="flex flex-col items-center text-on-surface-variant max-w-sm text-center">
                <span className="material-symbols-outlined text-5xl mb-4 opacity-50">science</span>
                <p className="font-body-lg mb-2">No Protein Structure Loaded</p>
                <p className="font-body-sm opacity-70">
                  Select a candidate variant from the genome browser or use the AI assistant to search for a structure.
                </p>
              </div>
            )}
          </div>
        </div>

      {/* Right Column: Gene Specifications and Target Rationale (Takes 1/3 of width) */}
      <div className="w-full md:w-1/3 bg-surface-container border border-outline-variant rounded-xl shadow-sm flex flex-col">
        <div className="px-4 py-3 border-b border-outline-variant bg-surface-container-low">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Target Rationale & Specs</h2>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-6">
          
          {/* Gene Specification Card */}
          <div className="bg-surface-container-high rounded-lg p-4 border border-outline-variant/50">
            <div className="flex items-center gap-2 mb-3 text-primary">
              <span className="material-symbols-outlined text-[20px]">science</span>
              <h3 className="font-label-lg font-bold text-on-surface">Gene Specifications</h3>
            </div>
            <div className="flex flex-col gap-2 text-body-sm text-on-surface-variant">
              <div className="flex justify-between border-b border-outline-variant/30 pb-1">
                <span className="font-semibold text-on-surface">Gene</span>
                <span>BUB1B</span>
              </div>
              <div className="flex justify-between border-b border-outline-variant/30 pb-1">
                <span className="font-semibold text-on-surface">UniProt ID</span>
                <span className="text-secondary">{uniprotId}</span>
              </div>
              <div className="flex justify-between border-b border-outline-variant/30 pb-1">
                <span className="font-semibold text-on-surface">Function</span>
                <span>Spindle Assembly Checkpoint Kinase</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-on-surface">Locus</span>
                <span>Chr15: 40.2M (GRCh38)</span>
              </div>
            </div>
          </div>

          {/* Discovery Rationale Card */}
          <div className="bg-surface-container-high rounded-lg p-4 border border-outline-variant/50">
            <div className="flex items-center gap-2 mb-3 text-error">
              <span className="material-symbols-outlined text-[20px]">troubleshoot</span>
              <h3 className="font-label-lg font-bold text-on-surface">Discovery Rationale</h3>
            </div>
            <p className="text-body-sm text-on-surface-variant leading-relaxed">
              Diagnostic analysis identified compound heterozygous mutations in <strong>BUB1B</strong> as the causal factor for the proband's Mosaic Variegated Aneuploidy (MVA).
            </p>
            <p className="text-body-sm text-on-surface-variant leading-relaxed mt-2">
              The target objective is to analyze the 3D kinase domain for potential allosteric binding pockets or compensatory drug repurposing candidates to restore spindle checkpoint functionality.
            </p>
          </div>

          {/* Dynamic AI Insights (Replaces the bubble) */}
          {aiCommentary ? (
            <div className="bg-primary/10 rounded-lg p-4 border border-primary/30 mt-auto">
              <div className="flex items-center gap-2 mb-2 text-primary">
                <span className="material-symbols-outlined text-[20px]">smart_toy</span>
                <h3 className="font-label-md font-bold">AI Structural Insights</h3>
              </div>
              <p className="text-body-sm text-on-surface-variant leading-relaxed">
                {aiCommentary}
              </p>
            </div>
          ) : (
            <div className="bg-surface-container-high rounded-lg p-4 border border-outline-variant mt-auto border-dashed opacity-70">
              <div className="flex items-center gap-2 mb-2 text-on-surface-variant">
                <span className="material-symbols-outlined text-[20px]">psychology</span>
                <h3 className="font-label-md font-bold">Awaiting AI Analysis...</h3>
              </div>
              <p className="text-body-sm text-on-surface-variant leading-relaxed italic">
                Ask the OmniStrand agent to analyze the pharmacological potential of this structure.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default DiscoveryPanel;
