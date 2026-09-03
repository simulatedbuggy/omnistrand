import React, { useEffect, useRef, useState } from 'react';

interface DiscoveryPanelProps {
  uniprotId?: string;
  highlightResidue?: number | null;
  focusResidues?: { start: number; end?: number } | null;
  viewerRepresentation?: 'cartoon' | 'surface' | 'ball-and-stick';
  aiCommentary?: string | null;
  onLoadStructure?: (id: string) => void;
}

const DiscoveryPanel: React.FC<DiscoveryPanelProps> = ({ 
  uniprotId = '', 
  highlightResidue = null,
  focusResidues = null,
  viewerRepresentation = 'cartoon',
  aiCommentary = null,
  onLoadStructure
}) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const pluginInstanceRef = useRef<any>(null);
  const [proteinData, setProteinData] = useState<{gene: string, name: string, function: string, rationale: string} | null>(null);

  useEffect(() => {
    if (!uniprotId) {
      setProteinData(null);
      return;
    }
    
    // Hardcoded fallback for the demo MVA case to guarantee it works perfectly during presentation
    if (uniprotId === 'O60566') {
      setProteinData({
        gene: 'BUB1B',
        name: 'Spindle Assembly Checkpoint Kinase',
        function: 'Essential component of the mitotic checkpoint. Required for normal mitosis progression.',
        rationale: "Diagnostic analysis identified compound heterozygous mutations in BUB1B as the causal factor for the proband's Mosaic Variegated Aneuploidy (MVA). The target objective is to analyze the 3D kinase domain for potential allosteric binding pockets or compensatory drug repurposing candidates to restore spindle checkpoint functionality."
      });
      return;
    }

    // Dynamic fetch for all other proteins
    async function fetchUniprot() {
      try {
        const res = await fetch(`https://rest.uniprot.org/uniprotkb/${uniprotId}`);
        const data = await res.json();
        const gene = data.genes?.[0]?.geneName?.value || 'Unknown Gene';
        let name = data.proteinDescription?.recommendedName?.fullName?.value || 'Unknown Protein';
        
        if (!data.proteinDescription?.recommendedName) {
           name = data.proteinDescription?.submissionNames?.[0]?.fullName?.value || name;
        }

        const funcComment = data.comments?.find((c: any) => c.commentType === 'FUNCTION')?.texts?.[0]?.value || 'No function description available.';
        
        setProteinData({
          gene,
          name,
          function: funcComment,
          rationale: `Automated dynamic analysis loaded for ${gene} (${uniprotId}). Exploring 3D structural variants and candidate therapeutic sites.`
        });
      } catch (err) {
        console.error(err);
        setProteinData({
          gene: 'Unknown',
          name: 'Unknown Protein',
          function: 'Failed to fetch protein details.',
          rationale: 'No rationale available.'
        });
      }
    }
    fetchUniprot();
  }, [uniprotId]);

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

  const isShowreel = new URLSearchParams(window.location.search).get('showreel') === 'true';
  const showreelClass = isShowreel ? 'animate-slide-pop-slow' : 'animate-slide-pop';
  const getShowreelStyle = (fastMs: number, slowMs: number) => ({ animationDelay: `${isShowreel ? slowMs : fastMs}ms` });
  
  return (
    <div className="flex flex-col md:flex-row h-full gap-4 w-full">
      {/* Left Column: 3D Structure Viewer (Takes 2/3 of width) */}
        <div className="w-full md:w-2/3 bg-surface-container border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col relative">
          <div className="px-4 py-3 border-b border-outline-variant bg-surface-container-low flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Protein Structure (AlphaFold)</h2>
              {uniprotId && <span className="text-body-sm text-secondary font-mono bg-secondary/10 px-2 py-0.5 rounded border border-secondary/20">{uniprotId}</span>}
            </div>
            
            {onLoadStructure && (
              <div className="flex gap-2">
                 {/* Reserved for future toolbar actions if needed */}
              </div>
            )}
          </div>
          <div className={`flex-1 relative bg-background/50 flex flex-col items-center justify-center ${showreelClass}`} style={getShowreelStyle(150, 600)}>
            {uniprotId ? (
              <div ref={viewerRef} className="absolute inset-0" />
              ) : (
                <div className="flex flex-col items-center justify-center text-on-surface-variant w-80 h-80 bg-surface-container-low border-2 border-dashed border-outline-variant rounded-3xl p-6 text-center shadow-sm">
                  <span className="material-symbols-outlined text-6xl mb-4 opacity-40">science</span>
                  <p className="font-body-lg font-medium text-on-surface mb-2">No Structure Loaded</p>
                  <p className="font-body-sm opacity-70 leading-relaxed">
                    Select a candidate variant from the browser or use the AI assistant to search for a structure.
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
            
            {uniprotId ? (
              <>
                {/* Gene Specification Card */}
                <div className="bg-surface-container-high rounded-lg p-4 border border-outline-variant/50">
                  <div className="flex items-center gap-2 mb-3 text-primary">
                    <span className="material-symbols-outlined text-[20px]">science</span>
                    <h3 className="font-label-lg font-bold text-on-surface">Gene Specifications</h3>
                  </div>
                  <div className="flex flex-col gap-2 text-body-sm text-on-surface-variant">
                    <div className="flex justify-between border-b border-outline-variant/30 pb-1">
                      <span className="font-semibold text-on-surface">Gene</span>
                      <span>{proteinData ? proteinData.gene : 'Loading...'}</span>
                    </div>
                    <div className="flex justify-between border-b border-outline-variant/30 pb-1">
                      <span className="font-semibold text-on-surface">UniProt ID</span>
                      <span className="text-secondary">{uniprotId}</span>
                    </div>
                      <div className="flex flex-col border-b border-outline-variant/30 pb-2 mt-1">
                        <span className="font-semibold text-on-surface mb-1">Protein Name</span>
                        <span className="text-xs text-on-surface-variant leading-relaxed">{proteinData ? proteinData.name : 'Loading...'}</span>
                      </div>
                      <div className="flex flex-col mt-1">
                        <span className="font-semibold text-on-surface mb-1">Function</span>
                        <span className="text-xs text-on-surface-variant leading-relaxed">{proteinData ? proteinData.function : 'Loading...'}</span>
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
                    {proteinData ? proteinData.rationale : 'Loading diagnostic rationale...'}
                  </p>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 opacity-50">
                <span className="material-symbols-outlined text-4xl mb-2">plumbing</span>
                <p className="font-body-sm">Select a target gene to view its specifications and diagnostic rationale.</p>
              </div>
            )}
  
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


