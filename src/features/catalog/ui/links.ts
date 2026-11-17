import type { CatalogQuery } from '../model';

export function catalogHref(base: string, query: CatalogQuery) {
  const params = new URLSearchParams();
  if (query.category) params.set('category', query.category);
  if (query.q) params.set('q', query.q);
  if (query.page > 1) params.set('page', String(query.page));
  return params.size ? base + '?' + params : base;
}
