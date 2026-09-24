import { useEffect, useState } from 'react';

export type Route = 'today' | 'path' | 'progress' | 'practice' | 'settings';
const ROUTES: readonly Route[] = ['today', 'path', 'progress', 'practice', 'settings'];

function parse(hash: string): Route {
  const h = hash.replace(/^#/, '');
  return (ROUTES as readonly string[]).includes(h) ? (h as Route) : 'today';
}

export function navigate(route: Route): void {
  if (parse(window.location.hash) === route && window.location.hash) return;
  window.location.hash = route;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
