export function routeKey(origin: string, pathname: string): string {
  const normalized = pathname
    .split('/')
    .map((seg) => {
      if (seg === '') return seg;
      if (/^\d+$/.test(seg)) return ':id';
      if (/^[0-9a-f-]{30,}$/i.test(seg)) return ':uuid';
      if (/^[0-9a-f]{12,}$/i.test(seg)) return ':hash';
      if (/^[A-Z0-9]{10,}$/.test(seg)) return ':token';
      return seg;
    })
    .join('/');
  return `${origin}${normalized || '/'}`;
}

export function routeKeyFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return routeKey(u.origin, u.pathname);
  } catch {
    return '';
  }
}
