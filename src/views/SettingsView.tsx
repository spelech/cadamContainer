import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlertTriangle,
  Brain,
  Cpu,
  ExternalLink,
  Loader2,
  RefreshCw,
  Save,
  Shield,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import * as Sentry from '@sentry/react';
import { useProfile, useUpdateProfile } from '@/services/profileService';
import { useAvailableModels } from '@/hooks/useAvailableModels';
import { UserAvatar } from '@/components/chat/UserAvatar';
import { accountUrl, ssoManaged } from '@/lib/supabase';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useSystemSettings,
  useUpdateModelRoles,
  useAutoDetectModelRoles,
} from '@/hooks/useSystemSettings';
import type { ModelRolesConfig } from '@/types/settings';
import type { ReasoningEffort } from '@/types/misc';

const DEFAULT_SSO_PROVIDER_URL = 'https://sso.wileyriley.com';

export default function SettingsView() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { mutate: updateProfile, isPending: isUpdateLoading } =
    useUpdateProfile();
  const { models, isLoading: isModelsLoading } = useAvailableModels();
  const { modelRoles, isLoading: isSettingsLoading } = useSystemSettings();
  const { mutate: updateModelRoles, isPending: isUpdatingRoles } =
    useUpdateModelRoles();
  const { mutate: autoDetectRoles, isPending: isAutoDetecting } =
    useAutoDetectModelRoles();

  const [rolesForm, setRolesForm] = useState<Partial<ModelRolesConfig>>({});

  useEffect(() => {
    if (modelRoles) {
      setRolesForm(modelRoles);
    }
  }, [modelRoles]);

  const handleSaveRoles = () => {
    updateModelRoles(rolesForm, {
      onSuccess: () => {
        toast({
          title: 'Settings Saved',
          description: 'Default AI model roles updated successfully.',
        });
      },
      onError: (err) => {
        toast({
          title: 'Save Failed',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      },
    });
  };

  const handleAutoDetect = () => {
    autoDetectRoles(undefined, {
      onSuccess: (detected) => {
        setRolesForm(detected);
        toast({
          title: 'Auto-Detected',
          description:
            'Assigned best matching models from live LiteLLM catalog.',
        });
      },
      onError: (err) => {
        toast({
          title: 'Detection Failed',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      },
    });
  };

  const selectedParametric = models.find(
    (m) => m.id === rolesForm.parametricModel,
  );
  const selectedInspection = models.find(
    (m) => m.id === rolesForm.inspectionModel,
  );

  const { toast } = useToast();
  const [newName, setNewName] = useState(profile?.full_name || '');
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const ssoAccountUrl = accountUrl || DEFAULT_SSO_PROVIDER_URL;

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
    }
  }, [editingName]);

  useEffect(() => {
    setNewName(profile?.full_name || '');
  }, [profile?.full_name]);

  const handleUpdateName = () => {
    updateProfile(
      { full_name: newName },
      {
        onSuccess: () => {
          setEditingName(false);
          setNewName(profile?.full_name || '');
          toast({
            title: 'Success',
            description: 'Your name has been updated',
          });
        },
        onError: (e) => {
          Sentry.captureException(e);
          toast({
            title: 'Error',
            description: 'Failed to update name',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleUpdateNotifications = async (notificationsEnabled: boolean) => {
    updateProfile(
      {
        notifications_enabled: notificationsEnabled,
      },
      {
        onSuccess: () => {
          toast({
            title: 'Success',
            description: 'Your notifications have been updated',
          });
        },
        onError: (e) => {
          Sentry.captureException(e);
          toast({
            title: 'Error',
            description: 'Failed to update notifications',
            variant: 'destructive',
          });
        },
      },
    );
  };

  return (
    <div className="flex min-h-full w-full items-center justify-center bg-adam-background-1 px-6 py-10">
      <div className="w-full max-w-xl">
        <header className="mb-8">
          <h1 className="text-2xl font-medium tracking-tight text-adam-neutral-50">
            Settings
          </h1>
          <p className="mt-1 text-sm text-adam-neutral-200">
            Manage your user profile, AI gateway, and system configuration.
          </p>
        </header>

        <div className="flex flex-col gap-4">
          {/* User Profile Card */}
          <section className="rounded-xl border border-adam-neutral-800 bg-adam-background-2 p-6">
            <h2 className="mb-5 text-sm font-medium text-adam-neutral-50">
              User Profile
            </h2>

            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <UserAvatar className="h-12 w-12 text-base" />
                  {editingName && !ssoManaged ? (
                    <Input
                      ref={nameInputRef}
                      value={newName}
                      className="h-9 w-full max-w-xs"
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleUpdateName();
                        }
                      }}
                    />
                  ) : (
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-adam-neutral-50">
                        {profile?.full_name ||
                          user?.user_metadata?.full_name ||
                          user?.email ||
                          'User'}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-adam-neutral-200">
                        {user?.email || 'No email configured'}
                      </div>
                    </div>
                  )}
                </div>

                {!ssoManaged &&
                  (editingName ? (
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <Button
                        onClick={() => handleUpdateName()}
                        variant="light"
                        disabled={isUpdateLoading}
                        className="rounded-full font-light"
                      >
                        {isUpdateLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Save'
                        )}
                      </Button>
                      <Button
                        onClick={() => {
                          setEditingName(false);
                          setNewName(profile?.full_name || '');
                        }}
                        variant="dark"
                        className="rounded-full font-light"
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setEditingName(true)}
                      variant="dark"
                      className="flex-shrink-0 rounded-full text-xs font-light"
                    >
                      Edit
                    </Button>
                  ))}
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-adam-neutral-800 pt-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-adam-neutral-50">
                      Authentication Provider
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-adam-neutral-800 px-2 py-0.5 text-[11px] font-medium text-adam-neutral-300">
                      <Shield className="h-3 w-3 text-emerald-400" />
                      PocketID SSO
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-adam-neutral-200">
                    {ssoAccountUrl}
                  </div>
                </div>
                <a
                  href={ssoAccountUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0"
                >
                  <Button
                    variant="dark"
                    className="rounded-full text-xs font-light"
                  >
                    Manage Account
                    <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </a>
              </div>
            </div>
          </section>

          {/* AI Gateway Card */}
          <section className="rounded-xl border border-adam-neutral-800 bg-adam-background-2 p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium text-adam-neutral-50">
                <Cpu className="h-4 w-4 text-adam-neutral-200" />
                AI Gateway
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                Connected / Healthy
              </span>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between text-xs text-adam-neutral-200">
                <div>
                  <span className="font-medium text-adam-neutral-50">
                    LiteLLM Proxy
                  </span>
                  <span className="ml-1.5 text-adam-neutral-300">
                    orchestration
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {isModelsLoading && (
                    <Loader2 className="h-3 w-3 animate-spin text-adam-neutral-300" />
                  )}
                  <span className="font-medium tabular-nums text-adam-neutral-50">
                    {models.length}
                  </span>
                  <span>
                    {models.length === 1 ? 'model loaded' : 'models loaded'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col divide-y divide-adam-neutral-800/70 overflow-hidden rounded-lg border border-adam-neutral-800 bg-adam-background-1">
                {models.map((model) => (
                  <div
                    key={model.id}
                    className="flex items-center justify-between p-3 transition-colors hover:bg-adam-neutral-800/30"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-medium text-adam-neutral-50">
                          {model.name}
                        </span>
                        {model.provider && (
                          <span className="rounded bg-adam-neutral-800 px-1.5 py-0.5 text-[10px] text-adam-neutral-300">
                            {model.provider}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-adam-neutral-300">
                        {model.id}
                        {model.description ? ` • ${model.description}` : ''}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      {model.supportsVision && (
                        <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">
                          Vision
                        </span>
                      )}
                      {model.supportsTools && (
                        <span className="rounded-full border border-purple-500/20 bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-400">
                          Tools
                        </span>
                      )}
                      {model.supportsThinking && (
                        <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                          Thinking
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {models.length === 0 && !isModelsLoading && (
                  <div className="p-4 text-center text-xs text-adam-neutral-300">
                    No models discovered from LiteLLM gateway.
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Default AI Models & Roles Card */}
          <section className="rounded-xl border border-adam-neutral-800 bg-adam-background-2 p-6">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-medium text-adam-neutral-50">
                  <Wrench className="h-4 w-4 text-adam-blue" />
                  Default AI Models & Roles
                </h2>
                <p className="mt-1 text-xs text-adam-neutral-300">
                  Configure default models and reasoning for each pipeline based
                  on your LiteLLM gateway capabilities.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleAutoDetect}
                  variant="dark"
                  disabled={isAutoDetecting || isModelsLoading}
                  className="rounded-full text-xs font-light"
                  title="Auto-assign roles based on model capability tags"
                >
                  {isAutoDetecting ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Auto-Detect
                </Button>
                <Button
                  onClick={handleSaveRoles}
                  variant="light"
                  disabled={isUpdatingRoles || isSettingsLoading}
                  className="rounded-full text-xs font-light"
                >
                  {isUpdatingRoles ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Save Defaults
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-5 divide-y divide-adam-neutral-800/60">
              {/* Parametric CAD Model */}
              <div className="flex flex-col gap-1.5 pt-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-adam-neutral-50">
                    Parametric (OpenSCAD) Model
                    <span className="rounded border border-purple-500/20 bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-400">
                      Tool-Calling Recommended
                    </span>
                  </label>
                  {selectedParametric && !selectedParametric.supportsTools && (
                    <span className="flex items-center gap-1 text-[11px] text-amber-400">
                      <AlertTriangle className="h-3 w-3" />
                      Lacks Tool Calling
                    </span>
                  )}
                </div>
                <Select
                  value={rolesForm.parametricModel || ''}
                  onValueChange={(val) =>
                    setRolesForm((prev) => ({ ...prev, parametricModel: val }))
                  }
                >
                  <SelectTrigger className="h-9 border-adam-neutral-800 bg-adam-background-1 text-xs text-adam-neutral-50">
                    <SelectValue placeholder="Select Parametric Model" />
                  </SelectTrigger>
                  <SelectContent className="border-adam-neutral-800 bg-adam-background-2 text-adam-neutral-50">
                    {models.map((m) => (
                      <SelectItem
                        key={m.id}
                        value={m.id}
                        className="text-xs focus:bg-adam-neutral-800"
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="truncate">{m.name || m.id}</span>
                          <span className="text-[10px] text-adam-neutral-300">
                            {m.supportsTools ? '🛠️ Tools' : ''}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-adam-neutral-300">
                  Primary model used to generate and modify parametric OpenSCAD
                  scripts.
                </p>
              </div>

              {/* Creative Mesh Model */}
              <div className="flex flex-col gap-1.5 pt-4">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-adam-neutral-50">
                    Creative (Mesh Mode) Model
                    <span className="rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">
                      3D Generation
                    </span>
                  </label>
                </div>
                <Select
                  value={rolesForm.creativeModel || ''}
                  onValueChange={(val) =>
                    setRolesForm((prev) => ({ ...prev, creativeModel: val }))
                  }
                >
                  <SelectTrigger className="h-9 border-adam-neutral-800 bg-adam-background-1 text-xs text-adam-neutral-50">
                    <SelectValue placeholder="Select Creative Model" />
                  </SelectTrigger>
                  <SelectContent className="border-adam-neutral-800 bg-adam-background-2 text-adam-neutral-50">
                    {models.map((m) => (
                      <SelectItem
                        key={m.id}
                        value={m.id}
                        className="text-xs focus:bg-adam-neutral-800"
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="truncate">{m.name || m.id}</span>
                          <span className="text-[10px] text-adam-neutral-300">
                            {m.provider || ''}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-adam-neutral-300">
                  Model for multi-angle projection and texturing in Mesh mode
                  turns.
                </p>
              </div>

              {/* Visual Inspection Model */}
              <div className="flex flex-col gap-1.5 pt-4">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-adam-neutral-50">
                    Visual Inspection Model
                    <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400">
                      Vision Required
                    </span>
                  </label>
                  {selectedInspection && !selectedInspection.supportsVision && (
                    <span className="flex items-center gap-1 text-[11px] text-amber-400">
                      <AlertTriangle className="h-3 w-3" />
                      Lacks Vision Capability
                    </span>
                  )}
                </div>
                <Select
                  value={rolesForm.inspectionModel || ''}
                  onValueChange={(val) =>
                    setRolesForm((prev) => ({ ...prev, inspectionModel: val }))
                  }
                >
                  <SelectTrigger className="h-9 border-adam-neutral-800 bg-adam-background-1 text-xs text-adam-neutral-50">
                    <SelectValue placeholder="Select Visual Inspection Model" />
                  </SelectTrigger>
                  <SelectContent className="border-adam-neutral-800 bg-adam-background-2 text-adam-neutral-50">
                    {models.map((m) => (
                      <SelectItem
                        key={m.id}
                        value={m.id}
                        className="text-xs focus:bg-adam-neutral-800"
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="truncate">{m.name || m.id}</span>
                          <span className="text-[10px] text-adam-neutral-300">
                            {m.supportsVision ? '👁️ Vision' : ''}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-adam-neutral-300">
                  Model used for multi-view critique of rendered 3D geometry.
                </p>
              </div>

              {/* Auxiliary Model */}
              <div className="flex flex-col gap-1.5 pt-4">
                <label className="text-xs font-medium text-adam-neutral-50">
                  Auxiliary (Titles & Prompts) Model
                </label>
                <Select
                  value={rolesForm.auxiliaryModel || ''}
                  onValueChange={(val) =>
                    setRolesForm((prev) => ({ ...prev, auxiliaryModel: val }))
                  }
                >
                  <SelectTrigger className="h-9 border-adam-neutral-800 bg-adam-background-1 text-xs text-adam-neutral-50">
                    <SelectValue placeholder="Select Auxiliary Model" />
                  </SelectTrigger>
                  <SelectContent className="border-adam-neutral-800 bg-adam-background-2 text-adam-neutral-50">
                    {models.map((m) => (
                      <SelectItem
                        key={m.id}
                        value={m.id}
                        className="text-xs focus:bg-adam-neutral-800"
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="truncate">{m.name || m.id}</span>
                          <span className="text-[10px] text-adam-neutral-300">
                            {m.provider || ''}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-adam-neutral-300">
                  Fast/economical model for chat titling and prompt expansion.
                </p>
              </div>

              {/* Default Reasoning Effort */}
              <div className="flex flex-col gap-2 pt-4">
                <label className="flex items-center gap-1.5 text-xs font-medium text-adam-neutral-50">
                  <Brain className="h-3.5 w-3.5 text-adam-blue" />
                  Default Reasoning Effort Level
                </label>
                <div className="flex flex-wrap gap-2">
                  {(
                    ['off', 'low', 'medium', 'high', 'max'] as ReasoningEffort[]
                  ).map((effort) => {
                    const isSelected =
                      (rolesForm.defaultReasoningEffort || 'low') === effort;
                    return (
                      <button
                        key={effort}
                        type="button"
                        onClick={() =>
                          setRolesForm((prev) => ({
                            ...prev,
                            defaultReasoningEffort: effort,
                          }))
                        }
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-adam-blue text-white shadow-sm ring-1 ring-adam-blue'
                            : 'border border-adam-neutral-800 bg-adam-background-1 text-adam-neutral-300 hover:text-adam-neutral-50'
                        }`}
                      >
                        {effort.charAt(0).toUpperCase() + effort.slice(1)}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-adam-neutral-300">
                  Initial reasoning effort applied to new chat sessions. Can be
                  adjusted per-turn in the prompt bar.
                </p>
              </div>
            </div>
          </section>

          {/* Plan / System Status */}
          <section className="rounded-xl border border-adam-neutral-800 bg-adam-background-2 p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium text-adam-neutral-50">
                <Zap className="h-4 w-4 text-adam-neutral-200" />
                Plan & System Status
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-adam-blue/30 bg-gradient-to-r from-adam-blue/20 to-fuchsia-500/20 px-3 py-1 text-xs font-medium text-adam-neutral-50">
                <Sparkles className="h-3 w-3 text-adam-blue" />
                Self-Hosted / Unlimited
              </span>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-adam-neutral-200">Subscription Tier</span>
                <span className="font-medium text-adam-neutral-50">
                  Max Tier Unlocked
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-adam-neutral-200">Token Quota</span>
                <span className="font-medium text-adam-neutral-50">
                  Unlimited
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-adam-neutral-200">
                  Generation Metering
                </span>
                <span className="font-medium text-adam-neutral-50">
                  Disabled (Bypassed)
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-adam-neutral-200">Deployment Type</span>
                <span className="font-medium text-adam-neutral-50">
                  Self-Hosted Container
                </span>
              </div>
              <div className="mt-2 border-t border-adam-neutral-800 pt-3 text-xs leading-relaxed text-adam-neutral-300">
                All commercial SaaS billing, Stripe checkout gates, and token
                purchase limits are disabled for this instance.
              </div>
            </div>
          </section>

          {/* Preferences (Notifications) */}
          <section className="rounded-xl border border-adam-neutral-800 bg-adam-background-2 p-6">
            <h2 className="mb-5 text-sm font-medium text-adam-neutral-50">
              Preferences
            </h2>

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-adam-neutral-50">Responses</div>
                <div className="mt-0.5 text-xs leading-relaxed text-adam-neutral-200">
                  Get notified when CADAM finishes a long-running request.
                </div>
              </div>
              <Switch
                className="mt-0.5"
                checked={profile?.notifications_enabled ?? false}
                onCheckedChange={handleUpdateNotifications}
              />
            </div>
          </section>

          <div className="mt-2 flex items-center justify-center gap-3 text-xs text-adam-neutral-300">
            <Link
              to="/terms-of-service"
              className="transition-colors hover:text-adam-neutral-50"
            >
              Terms of Service
            </Link>
            <span aria-hidden className="text-adam-neutral-700">
              •
            </span>
            <Link
              to="/privacy-policy"
              className="transition-colors hover:text-adam-neutral-50"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
