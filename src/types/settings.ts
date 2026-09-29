import type { ReasoningEffort } from './misc';

export interface ModelRolesConfig {
  parametricModel: string;
  creativeModel: string;
  inspectionModel: string;
  auxiliaryModel: string;
  defaultReasoningEffort: ReasoningEffort;
}

export interface SystemSettingRecord<T = unknown> {
  key: string;
  category: string;
  value: T;
  description?: string;
  updated_at: string;
  updated_by?: string;
}
