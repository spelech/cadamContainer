import React, { useState } from 'react';
import {
  Layers,
  Eye,
  EyeOff,
  Focus,
  Download,
  RotateCcw,
  Box,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { RuntimeAssemblyPart } from '@/utils/assemblyParser';

export interface PartsPanelProps {
  parts: RuntimeAssemblyPart[];
  explodeFraction: number;
  onExplodeChange: (fraction: number) => void;
  onToggleVisibility: (partId: string) => void;
  onToggleIsolate: (partId: string) => void;
  onExportPartStl?: (part: RuntimeAssemblyPart) => void;
  activeTab?: 'parameters' | 'assembly';
  onTabChange?: (tab: 'parameters' | 'assembly') => void;
  hasParameters?: boolean;
  children?: React.ReactNode;
}

export function PartsPanel({
  parts,
  explodeFraction,
  onExplodeChange,
  onToggleVisibility,
  onToggleIsolate,
  onExportPartStl,
  activeTab: propActiveTab,
  onTabChange: propOnTabChange,
  hasParameters = true,
  children,
}: PartsPanelProps) {
  const [internalTab, setInternalTab] = useState<'parameters' | 'assembly'>(
    hasParameters ? 'parameters' : 'assembly',
  );

  const activeTab = propActiveTab ?? internalTab;
  const handleTabChange = propOnTabChange ?? setInternalTab;

  const anyIsolated = parts.some((p) => p.isolated);
  const anyHidden = parts.some((p) => !p.visible);

  return (
    <div className="flex h-full w-full max-w-full flex-col overflow-hidden border-l border-gray-200/20 bg-adam-bg-secondary-dark dark:border-gray-800">
      {/* Top Sidebar Tab Navigation */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-adam-neutral-700 bg-gradient-to-r from-adam-bg-secondary-dark to-adam-bg-secondary-dark/95 px-4 py-2">
        <div
          role="tablist"
          aria-label="Inspector tabs"
          className="inline-flex h-9 items-center rounded-lg border border-adam-neutral-700/60 bg-adam-neutral-800 p-1"
        >
          <button
            type="button"
            role="tab"
            id="tab-parameters"
            aria-selected={activeTab === 'parameters'}
            aria-controls="panel-parameters"
            onClick={() => handleTabChange('parameters')}
            className={cn(
              'inline-flex items-center justify-center rounded-md px-3 py-1 text-xs font-semibold transition-all',
              activeTab === 'parameters'
                ? 'bg-adam-blue text-white shadow-sm'
                : 'text-adam-text-secondary hover:text-adam-text-primary',
            )}
          >
            Parameters
          </button>
          <button
            type="button"
            role="tab"
            id="tab-assembly"
            aria-selected={activeTab === 'assembly'}
            aria-controls="panel-assembly"
            onClick={() => handleTabChange('assembly')}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all',
              activeTab === 'assembly'
                ? 'bg-adam-blue text-white shadow-sm'
                : 'text-adam-text-secondary hover:text-adam-text-primary',
            )}
          >
            <span>Parts &amp; Assembly</span>
            {parts.length > 0 && (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none',
                  activeTab === 'assembly'
                    ? 'bg-white/20 text-white'
                    : 'bg-adam-neutral-700 text-adam-neutral-300',
                )}
              >
                {parts.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'assembly' && (anyIsolated || anyHidden) && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-adam-text-secondary hover:bg-adam-neutral-800 hover:text-adam-text-primary"
                  onClick={() => {
                    // Reset all parts to visible and not isolated
                    for (const part of parts) {
                      if (!part.visible) onToggleVisibility(part.id);
                      if (part.isolated) onToggleIsolate(part.id);
                    }
                  }}
                  aria-label="Restore all parts visibility"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Restore all parts</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Panel Contents */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'parameters' ? (
          <div
            role="tabpanel"
            id="panel-parameters"
            aria-labelledby="tab-parameters"
            className="h-full w-full"
          >
            {children || (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center text-sm text-adam-text-secondary">
                <Box className="mb-2 h-8 w-8 text-adam-neutral-500" />
                <p>No adjustable parameters</p>
              </div>
            )}
          </div>
        ) : (
          <div
            role="tabpanel"
            id="panel-assembly"
            aria-labelledby="tab-assembly"
            className="flex h-full flex-col overflow-hidden"
          >
            {/* Exploded View Control Section */}
            <div className="shrink-0 border-b border-adam-neutral-700/80 bg-adam-neutral-900/40 p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-adam-blue" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-adam-text-primary">
                    Exploded View
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-adam-blue">
                    {Math.round(explodeFraction * 100)}%
                  </span>
                  {explodeFraction > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-adam-neutral-400 hover:text-adam-text-primary"
                      onClick={() => onExplodeChange(0)}
                      title="Reset exploded view"
                      aria-label="Reset explode view"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
              <input
                type="range"
                data-testid="explode-slider"
                min="0"
                max="100"
                step="1"
                value={Math.round(explodeFraction * 100)}
                onChange={(e) => onExplodeChange(Number(e.target.value) / 100)}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-adam-neutral-700 accent-adam-blue transition-all"
                aria-label="Exploded View Slider"
              />
            </div>

            {/* Assembly Components List */}
            <div className="flex shrink-0 items-center justify-between border-b border-adam-neutral-800 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-adam-neutral-400">
              <span>Components ({parts.length})</span>
              <span>Actions</span>
            </div>

            <ScrollArea className="flex-1 px-3 py-2">
              {parts.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-sm text-adam-text-secondary">
                  <Layers className="mb-2 h-8 w-8 text-adam-neutral-500" />
                  <p>No multipart assembly detected</p>
                  <span className="mt-1 text-xs text-adam-neutral-400">
                    Define discrete modules or export an assembly manifest to
                    isolate components.
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 pb-4">
                  {parts.map((part) => (
                    <div
                      key={part.id}
                      data-testid="part-item"
                      data-part-id={part.id}
                      className={cn(
                        'group flex items-center justify-between gap-3 rounded-lg border p-2.5 transition-all',
                        part.isolated
                          ? 'border-adam-blue/60 bg-adam-blue/10 shadow-sm'
                          : part.visible
                            ? 'hover:border-adam-neutral-600 border-adam-neutral-700/60 bg-adam-neutral-800/60 hover:bg-adam-neutral-800'
                            : 'border-adam-neutral-800/40 bg-adam-neutral-900/40 opacity-60',
                      )}
                    >
                      {/* Left: Swatch & Info */}
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/20 shadow-sm"
                          style={{ backgroundColor: part.colorHex }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-adam-text-primary">
                            {part.name}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-adam-neutral-400">
                            <span className="truncate font-mono">
                              {part.moduleName || part.id}
                            </span>
                            <span>•</span>
                            <span>
                              {part.triangleCount.toLocaleString()} tris
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions (Visibility, Isolate, Export STL) */}
                      <div className="flex shrink-0 items-center gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  'h-7 w-7 rounded-md p-0',
                                  part.visible
                                    ? 'text-adam-text-secondary hover:text-adam-text-primary'
                                    : 'text-adam-neutral-500 hover:text-adam-neutral-300',
                                )}
                                onClick={() => onToggleVisibility(part.id)}
                                aria-label={
                                  part.visible
                                    ? `Hide ${part.name}`
                                    : `Show ${part.name}`
                                }
                              >
                                {part.visible ? (
                                  <Eye className="h-3.5 w-3.5" />
                                ) : (
                                  <EyeOff className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{part.visible ? 'Hide part' : 'Show part'}</p>
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  'h-7 w-7 rounded-md p-0 transition-colors',
                                  part.isolated
                                    ? 'bg-adam-blue/20 text-adam-blue hover:bg-adam-blue/30'
                                    : 'text-adam-text-secondary hover:text-adam-text-primary',
                                )}
                                onClick={() => onToggleIsolate(part.id)}
                                aria-label={
                                  part.isolated
                                    ? `Unisolate ${part.name}`
                                    : `Isolate ${part.name}`
                                }
                              >
                                <Focus className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {part.isolated
                                  ? 'Restore all parts'
                                  : 'Isolate this part'}
                              </p>
                            </TooltipContent>
                          </Tooltip>

                          {onExportPartStl && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 rounded-md p-0 text-adam-text-secondary hover:bg-adam-blue/10 hover:text-adam-blue"
                                  onClick={() => onExportPartStl(part)}
                                  aria-label={`Export ${part.name} as STL`}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Export STL for this part</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TooltipProvider>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
