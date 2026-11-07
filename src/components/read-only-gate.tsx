import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { getAccessState } from '@/lib/payments.functions';
import { useServerFn } from '@/hooks/use-server-fn';

// Buttons whose label means "change something". Navigation, filters and dialogs stay usable.
const WRITE_WORDS = /\b(save|post|add|create|new|delete|remove|submit|import|upload|send|update|assign|invite|approve|edit|sync|archive|confirm)\b/i;
const ALLOWED_PATHS = ['/settings/billing', '/settings/nova-pro', '/onboarding', '/setup'];

export function useAccessState() {
  const fn = useServerFn(getAccessState);
  return useQuery({ queryKey: ['access'], queryFn: () => fn(), staleTime: 30_000, refetchInterval: 60_000 });
}

/** Read-only mode for workspaces without an active plan: banner + blocks write actions. */
export function ReadOnlyGate() {
  const { data } = useAccessState();
  const { pathname } = useLocation();
  const readOnly = data?.mode === 'read_only' && !ALLOWED_PATHS.some(p => pathname.startsWith(p));

  useEffect(() => {
    if (!readOnly) return;
    const blocked = (target: EventTarget | null) => {
      const el = target instanceof Element ? target : null;
      if (!el || el.closest('[data-billing-allowed]')) return false;
      const btn = el.closest('button, [role="button"], input[type="submit"]');
      if (!btn) return false;
      const label = `${btn.textContent ?? ''} ${btn.getAttribute('aria-label') ?? ''} ${(btn as HTMLInputElement).value ?? ''}`;
      return (btn as HTMLButtonElement).type === 'submit' || WRITE_WORDS.test(label);
    };
    const notify = () => toast.error('Read-only: your workspace needs an active plan to make changes.', { id: 'read-only' });
    const onClick = (e: MouseEvent) => { if (blocked(e.target)) { e.preventDefault(); e.stopPropagation(); notify(); } };
    const onSubmit = (e: Event) => { const f = e.target as Element; if (!f.closest?.('[data-billing-allowed]')) { e.preventDefault(); e.stopPropagation(); notify(); } };
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    return () => { document.removeEventListener('click', onClick, true); document.removeEventListener('submit', onSubmit, true); };
  }, [readOnly]);

  if (data?.reason === 'past_due') {
    return (
      <div role="status" className="w-full border-b border-border bg-muted px-4 py-2 text-sm text-foreground flex items-center justify-center gap-2" data-billing-allowed>
        <Lock className="h-4 w-4 text-primary" aria-hidden />
        <span>Your last payment didn't go through. We'll keep retrying for about two weeks.</span>
        {data.isOwner
          ? <Link to="/settings/billing" className="font-medium underline">Update your card</Link>
          : <span className="text-muted-foreground">Let your agency owner know.</span>}
      </div>
    );
  }
  if (data?.mode !== 'read_only') return null;
  return (
    <div role="status" className="w-full border-b border-border bg-muted px-4 py-2 text-sm text-foreground flex items-center justify-center gap-2" data-billing-allowed>
      <Lock className="h-4 w-4 text-primary" aria-hidden />
      <span>Your plan has ended, so your workspace is view-only.</span>
      {data.isOwner
        ? <Link to="/settings/billing" className="font-medium underline">Renew your plan</Link>
        : <span className="text-muted-foreground">Ask your agency owner to renew.</span>}
    </div>
  );
}
