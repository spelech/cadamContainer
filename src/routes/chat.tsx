import { createFileRoute } from '@tanstack/react-router';
import { PromptView } from '@/views/PromptView';
import {
  CadReferenceProvider,
  useOptionalCadReference,
} from '@/context/CadReferenceContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = (createFileRoute as any)('/chat')({
  component: ChatRoute,
});

function ChatRoute() {
  const existing = useOptionalCadReference();
  if (existing) {
    return <PromptView />;
  }
  return (
    <CadReferenceProvider>
      <PromptView />
    </CadReferenceProvider>
  );
}
