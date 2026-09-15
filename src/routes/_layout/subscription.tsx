import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_layout/subscription')({
  beforeLoad: () => {
    throw redirect({ to: '/settings' });
  },
});

