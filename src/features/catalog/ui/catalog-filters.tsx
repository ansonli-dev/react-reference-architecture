'use client';

import { useRouter } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import type { CatalogQuery } from '../model';
import { catalogHref } from './links';

type Labels = {
  category: string;
  allCategories: string;
  search: string;
  searchHint: string;
  apply: string;
};

export function CatalogFilters({
  base,
  query,
  categories,
  search,
  labels,
}: {
  base: string;
  query: CatalogQuery;
  categories: string[];
  search: boolean;
  labels: Labels;
}) {
  const router = useRouter();
  const options =
    query.category && !categories.includes(query.category)
      ? [...categories, query.category]
      : categories;

  return (
    <form
      action={base}
      method="get"
      className="border-line bg-surface flex flex-wrap items-end gap-4 rounded-lg border p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        router.push(
          catalogHref(base, {
            category: String(form.get('category') ?? '').trim() || undefined,
            q: String(form.get('q') ?? '').trim() || undefined,
            page: 1,
          }),
        );
      }}
    >
      {search && (
        <div className="min-w-40 grow">
          <label
            htmlFor="catalog-query"
            className="mb-1.5 block text-sm font-semibold"
          >
            {labels.search}
          </label>
          <Input
            key={query.q}
            id="catalog-query"
            type="search"
            name="q"
            placeholder={labels.searchHint}
            maxLength={64}
            defaultValue={query.q}
          />
        </div>
      )}
      <div className="min-w-36 grow sm:grow-0">
        <label
          htmlFor="catalog-category"
          className="mb-1.5 block text-sm font-semibold"
        >
          {labels.category}
        </label>
        <select
          key={query.category}
          id="catalog-category"
          name="category"
          defaultValue={query.category ?? ''}
          className="border-input bg-surface focus-visible:outline-ring h-10 w-full max-w-full rounded-md border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <option value="">{labels.allCategories}</option>
          {options.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit">
        <SlidersHorizontal aria-hidden />
        {labels.apply}
      </Button>
    </form>
  );
}
