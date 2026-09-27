import React, { useState, useRef } from 'react';
import { Brain, Check, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ModelConfig, ReasoningEffort } from '@/types/misc';

const EFFORT_LABELS: Record<
  ReasoningEffort,
  { label: string; description: string }
> = {
  off: { label: 'Off', description: 'No reasoning tokens generated' },
  low: {
    label: 'Low',
    description: 'Fast responses, minimal reasoning (~2k tokens)',
  },
  medium: {
    label: 'Medium',
    description: 'Balanced reasoning depth (~4k tokens)',
  },
  high: {
    label: 'High',
    description: 'Deep reasoning for complex models (~8k tokens)',
  },
  max: {
    label: 'Max',
    description: 'Maximum reasoning effort (~16k tokens)',
  },
};

export interface ReasoningEffortSelectorProps {
  modelConfig?: ModelConfig;
  selectedEffort: ReasoningEffort;
  onEffortChange: (effort: ReasoningEffort) => void;
  disabled?: boolean;
  className?: string;
  focused?: boolean;
}

export function ReasoningEffortSelector({
  modelConfig,
  selectedEffort,
  onEffortChange,
  disabled,
  className,
  focused,
}: ReasoningEffortSelectorProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const openedWithPointerRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  if (
    !modelConfig?.supportsThinking &&
    (!modelConfig?.reasoningEfforts ||
      modelConfig.reasoningEfforts.length === 0)
  ) {
    return null;
  }

  const availableEfforts: ReasoningEffort[] =
    modelConfig?.reasoningEfforts && modelConfig.reasoningEfforts.length > 0
      ? modelConfig.reasoningEfforts
      : ['off', 'low', 'medium', 'high', 'max'];

  const currentLabel = EFFORT_LABELS[selectedEffort]?.label || selectedEffort;

  return (
    <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => {
            openedWithPointerRef.current = true;
          }}
          className={cn(
            'border-adam-neutral-600 hover:bg-adam-neutral-600 flex h-7 items-center justify-between gap-1.5 rounded-full border bg-adam-neutral-700 px-2.5 py-0.5 text-xs font-medium text-adam-text-primary transition-colors hover:text-white',
            focused && 'border-adam-neutral-500 text-white',
            className,
          )}
          title={`Reasoning effort: ${currentLabel}`}
          aria-label={`Reasoning effort: ${currentLabel}`}
        >
          <Brain className="h-3.5 w-3.5 text-adam-text-secondary" />
          <span className="capitalize">{currentLabel}</span>
          <ChevronDown
            className={cn(
              'h-3 w-3 opacity-70 transition-transform duration-200',
              isDropdownOpen && 'rotate-180',
            )}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-1 overflow-y-auto rounded-lg bg-adam-neutral-700 p-1"
        align="end"
        onCloseAutoFocus={(event) => {
          if (openedWithPointerRef.current) {
            event.preventDefault();
            openedWithPointerRef.current = false;
            triggerRef.current?.blur();
          }
        }}
      >
        {availableEfforts.map((effort) => {
          const info = EFFORT_LABELS[effort];
          const isSelected = selectedEffort === effort;
          return (
            <DropdownMenuItem
              key={effort}
              className={cn(
                'cursor-pointer rounded-md bg-adam-neutral-700 px-3 py-2 transition-colors duration-150 focus:bg-adam-bg-secondary-dark',
                isSelected && 'bg-adam-neutral-800',
              )}
              onClick={(e) => {
                onEffortChange(effort);
                setIsDropdownOpen(false);
                e.stopPropagation();
              }}
            >
              <div className="flex w-full items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'text-sm font-medium text-adam-text-primary',
                      isSelected && 'font-semibold text-white',
                    )}
                  >
                    {info?.label || effort}
                  </span>
                  {info?.description && (
                    <p className="mt-0.5 text-xs text-gray-400">
                      {info.description}
                    </p>
                  )}
                </div>
                {isSelected && (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-adam-text-primary" />
                )}
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
