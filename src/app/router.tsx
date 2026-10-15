import type { ComponentType, JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { nextStep } from '../domain';
import type { StoredRound } from '../storage';
import { InlineStatus } from '../ui/kit';
import { useContainer } from './container';
import type { Container } from './container';

export interface RouteDef { path: string; view: ComponentType<{ params: Record<string, string> }> }

/** Recover the persisted editor before deriving the next lifecycle action. */
export function resumePath(round: StoredRound): string {
  if (round.status === 'finished') return Object.keys(round.drafts).length
    ? `/log/${encodeURIComponent(round.id)}` : `/round/${encodeURIComponent(round.id)}/summary`;
  if (round.activeHole !== null && Object.hasOwn(round.drafts, round.activeHole)) return `/round/hole/${round.activeHole}`;
  const step = nextStep(round);
  if (step === 'turn') return '/round/turn';
  if (step === 'finish') return '/round/finish';
  return `/round/hole/${round.holes.length + 1}`;
}

/** Respect explicit bookmarks; a fresh launch resumes the active round. */
export async function startupPath(c: Container): Promise<string> {
  const explicit = window.location.hash.slice(1);
  if (explicit) return explicit;
  const active = await c.repository.getInProgress();
  return window.location.hash.slice(1) || (active ? resumePath(active) : '/log');
}

let requestNavigation: ((path: string) => Promise<void>) | undefined;

/** Flush registered editors before a route transition; errors preserve the visible editor. */
export async function navigate(path: string): Promise<void> {
  if (!path.startsWith('/') || path.includes('#')) throw new Error('Choose a scorecard route.');
  if (!requestNavigation) throw new Error('Navigation is not ready. Try again.');
  await requestNavigation(path);
}

function match(path: string, route: string): Record<string, string> | null {
  const expected = route.split('/');
  const actual = path.split('/');
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < expected.length; index += 1) {
    const pattern = expected[index] ?? '';
    const value = actual[index] ?? '';
    if (pattern.startsWith(':')) {
      if (!value) return null;
      try { params[pattern.slice(1)] = decodeURIComponent(value); } catch { return null; }
    } else if (pattern !== value) return null;
  }
  return params;
}

/** Hash router with injected views and guarded native back/forward navigation. */
export function Router({ routes }: { routes: RouteDef[] }): JSX.Element {
  const c = useContainer();
  const [path, setPath] = useState(window.location.hash.slice(1) || '/log');
  const [error, setError] = useState<string | null>(null);
  const visible = useRef(path);
  const generation = useRef(0);
  const content = useRef<HTMLDivElement>(null);
  const initial = useRef(true);
  useEffect(() => {
    if (initial.current) { initial.current = false; return; }
    const heading = content.current?.querySelector<HTMLElement>('h2');
    if (heading) { heading.tabIndex = -1; heading.focus(); }
    else content.current?.focus();
  }, [path]);
  useLayoutEffect(() => {
    async function transition(target: string): Promise<void> {
      const current = ++generation.current;
      try {
        await c.flush();
        if (current !== generation.current) return;
        visible.current = target;
        if (window.location.hash.slice(1) !== target) window.history.pushState(null, '', `#${target}`);
        setPath(target); setError(null);
      } catch (failure) {
        if (current === generation.current) {
          window.history.replaceState(null, '', `#${visible.current}`);
          setError(failure instanceof Error ? failure.message : 'Your changes are not saved. Retry before leaving.');
        }
        throw failure;
      }
    }
    requestNavigation = transition;
    const changed = (): void => { void transition(window.location.hash.slice(1) || '/log').catch(() => undefined); };
    window.addEventListener('hashchange', changed);
    // Reconcile changes made between rendering and installing the listener.
    if ((window.location.hash.slice(1) || '/log') !== visible.current) changed();
    return () => {
      generation.current += 1;
      if (requestNavigation === transition) requestNavigation = undefined;
      window.removeEventListener('hashchange', changed);
    };
  }, [c]);
  const found = routes.map((route) => ({ route, params: match(path, route.path) })).find((item) => item.params !== null);
  const View = found?.route.view;
  return <>
    {error && <InlineStatus tone="error" message={error} fixHint="Resolve the save error here, then try navigation again." />}
    <div ref={content} tabIndex={-1}>{View && found?.params ? <View key={path} params={found.params} /> : <section>
      <h2>Not found</h2><p>This scorecard address is unavailable.</p>
      <button onClick={() => { void navigate('/log').catch(() => undefined); }}>Open round log</button>
    </section>}</div>
  </>;
}
