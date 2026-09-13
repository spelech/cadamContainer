import { Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export function CreditsButton() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full',
        'bg-adam-neutral-950 px-3 py-1.5 text-sm font-medium',
        'text-adam-neutral-10 shadow-sm',
        'border border-white/5 select-none',
      )}
      aria-label="Self-Hosted"
    >
      <Zap className="h-3.5 w-3.5 text-adam-blue" fill="currentColor" />
      <span>Self-Hosted</span>
    </div>
  );
}
