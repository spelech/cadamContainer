import { useState, useEffect, useCallback } from 'react';
import type { Model } from '@shared/types';
import type { ModelConfig, ReasoningEffort } from '@/types/misc';

const VALID_EFFORTS: ReasoningEffort[] = [
  'off',
  'low',
  'medium',
  'high',
  'max',
];

export function getSavedReasoningEffort(
  modelId: string,
  defaultEffort?: ReasoningEffort,
): ReasoningEffort {
  try {
    const saved = localStorage.getItem(`cadam_reasoning_effort_${modelId}`);
    if (saved && (VALID_EFFORTS as string[]).includes(saved)) {
      return saved as ReasoningEffort;
    }
  } catch {
    // LocalStorage unavailable
  }
  return defaultEffort || 'low';
}

export function saveReasoningEffort(
  modelId: string,
  effort: ReasoningEffort,
): void {
  try {
    localStorage.setItem(`cadam_reasoning_effort_${modelId}`, effort);
  } catch {
    // Ignore storage quota / permissions errors
  }
}

export function useReasoningEffort(model: Model, modelConfig?: ModelConfig) {
  const defaultEffort = modelConfig?.defaultReasoningEffort;

  const [effort, setEffortState] = useState<ReasoningEffort>(() =>
    getSavedReasoningEffort(model, defaultEffort),
  );

  useEffect(() => {
    setEffortState(getSavedReasoningEffort(model, defaultEffort));
  }, [model, defaultEffort]);

  const setEffort = useCallback(
    (nextEffort: ReasoningEffort) => {
      setEffortState(nextEffort);
      saveReasoningEffort(model, nextEffort);
    },
    [model],
  );

  return {
    reasoningEffort: effort,
    setReasoningEffort: setEffort,
  };
}
