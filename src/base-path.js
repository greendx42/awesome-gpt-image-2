const PASSTHROUGH_PROTOCOL = /^(?:https?:|blob:|data:)/i;

function normalizeBase(baseUrl) {
  const base = `/${String(baseUrl || '/').replace(/^\/+|\/+$/g, '')}`;
  return base === '/' ? '/' : `${base}/`;
}

export function withBasePath(path, baseUrl = import.meta.env.BASE_URL) {
  if (!path || PASSTHROUGH_PROTOCOL.test(path)) return path;
  const base = normalizeBase(baseUrl);
  return base === '/' ? `/${path.replace(/^\/+/, '')}` : `${base}${path.replace(/^\/+/, '')}`;
}

export function stripBasePath(pathname, baseUrl = import.meta.env.BASE_URL) {
  const base = normalizeBase(baseUrl);
  if (base === '/') return pathname || '/';
  const prefix = base.slice(0, -1);
  if (pathname === prefix) return '/';
  return pathname?.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : pathname;
}
