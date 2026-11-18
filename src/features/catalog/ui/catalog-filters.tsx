'use client';

import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
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
  labels,
}: {
  base: string;
  query: CatalogQuery;
  categories: string[];
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
      className="border-line bg-surface grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 rounded-xl border p-3 sm:flex sm:p-4"
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
      <div className="col-span-2 min-w-0 grow">
        <label
          htmlFor="catalog-query"
          className="mb-1.5 block text-sm font-semibold"
        >
          {labels.search}
        </label>
        <div className="relative">
          <Search
            size={17}
            aria-hidden
            className="text-muted pointer-events-none absolute top-3.5 left-3"
          />
          <Input
            key={query.q}
            id="catalog-query"
            type="search"
            name="q"
            placeholder={labels.searchHint}
            maxLength={64}
            defaultValue={query.q}
            className="h-11 pl-9"
          />
        </div>
      </div>
      <div className="min-w-0 sm:w-48">
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
          className="border-input bg-surface focus-visible:outline-ring h-11 w-full max-w-full rounded-md border px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 sm:text-sm"
        >
          <option value="">{labels.allCategories}</option>
          {options.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" className="h-11">
        {labels.apply}
      </Button>
    </form>
  );
}
