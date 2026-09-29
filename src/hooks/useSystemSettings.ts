import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ModelRolesConfig } from '@/types/settings';

const SYSTEM_SETTINGS_QUERY_KEY = ['system_settings', 'model_roles'];

function getApiUrl(path: string): string {
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

export function useSystemSettings(): {
  modelRoles: ModelRolesConfig | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const { data, isLoading, error } = useQuery<{
    model_roles: ModelRolesConfig;
  }>({
    queryKey: SYSTEM_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const response = await fetch(
        getApiUrl('/api/system-settings?key=model_roles'),
        {
          credentials: 'include',
        },
      );
      if (!response.ok) {
        throw new Error(
          `Failed to fetch system settings: ${response.status} ${response.statusText}`,
        );
      }
      const json = await response.json();
      return json.settings;
    },
    staleTime: 60 * 1000,
  });

  return {
    modelRoles: data?.model_roles,
    isLoading,
    error,
  };
}

export function useUpdateModelRoles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (roles: Partial<ModelRolesConfig>) => {
      const response = await fetch(getApiUrl('/api/system-settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key: 'model_roles', value: roles }),
      });
      if (!response.ok) {
        throw new Error(
          `Failed to update model roles: ${response.status} ${response.statusText}`,
        );
      }
      const json = await response.json();
      return json.settings.model_roles as ModelRolesConfig;
    },
    onSuccess: (updatedRoles) => {
      queryClient.setQueryData(SYSTEM_SETTINGS_QUERY_KEY, {
        model_roles: updatedRoles,
      });
      queryClient.invalidateQueries({ queryKey: SYSTEM_SETTINGS_QUERY_KEY });
    },
  });
}

export function useAutoDetectModelRoles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(getApiUrl('/api/system-settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'auto_detect_model_roles' }),
      });
      if (!response.ok) {
        throw new Error(
          `Failed to auto-detect model roles: ${response.status} ${response.statusText}`,
        );
      }
      const json = await response.json();
      return json.settings.model_roles as ModelRolesConfig;
    },
    onSuccess: (updatedRoles) => {
      queryClient.setQueryData(SYSTEM_SETTINGS_QUERY_KEY, {
        model_roles: updatedRoles,
      });
      queryClient.invalidateQueries({ queryKey: SYSTEM_SETTINGS_QUERY_KEY });
    },
  });
}
