import { createFileRoute } from '@tanstack/react-router';
import { PromptView } from '@/views/PromptView';
import { AuthGuard } from '@/components/auth/AuthGuard';

export const Route = createFileRoute('/_layout/')({
  component: () => (
    <AuthGuard>
      <PromptView />
    </AuthGuard>
  ),
});
