import { useQuery } from '@tanstack/react-query';
import { PARAMETRIC_MODELS } from '@/lib/utils';
import type { ModelConfig } from '@/types/misc';

export function useAvailableModels(): {
  models: ModelConfig[];
  isLoading: boolean;
  error: unknown;
} {
  const { data, isLoading, error } = useQuery<ModelConfig[]>({
    queryKey: ['available-models'],
    queryFn: async () => {
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/api/models`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(
          `Failed to fetch models: ${response.status} ${response.statusText}`,
        );
      }
      return (await response.json()) as ModelConfig[];
    },
    initialData: PARAMETRIC_MODELS,
  });

  return {
    models: Array.isArray(data) && data.length > 0 ? data : PARAMETRIC_MODELS,
    isLoading,
    error,
  };
}
