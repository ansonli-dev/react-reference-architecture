// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { CatalogFilters } from '@/features/catalog/client';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const labels = {
  category: '分类',
  allCategories: '全部分类',
  search: '搜索书籍',
  searchHint: '书名或作者',
  apply: '应用筛选',
};
const base = '/zh-CN/books';
const categories = ['Architecture', 'Web & design'];

afterEach(() => {
  cleanup();
  push.mockClear();
});

test('applies edits as a URL with encoded filters and the default page', () => {
  render(
    <CatalogFilters
      base={base}
      query={{ category: 'Architecture', q: 'React', page: 2 }}
      categories={categories}
      labels={labels}
    />,
  );

  const category = screen.getByRole('combobox', { name: labels.category });
  const search = screen.getByRole('searchbox', { name: labels.search });
  expect(category).toHaveProperty('value', 'Architecture');
  expect(search).toHaveProperty('value', 'React');

  fireEvent.change(category, { target: { value: 'Web & design' } });
  fireEvent.change(search, { target: { value: '  路由 & 缓存  ' } });
  expect(push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: labels.apply }));

  const filters = new URLSearchParams({
    category: 'Web & design',
    q: '路由 & 缓存',
  });
  expect(push).toHaveBeenCalledExactlyOnceWith(base + '?' + filters);
});

test('omits cleared filters from the submitted URL', () => {
  render(
    <CatalogFilters
      base={base}
      query={{ category: 'Architecture', q: 'React', page: 2 }}
      categories={categories}
      labels={labels}
    />,
  );

  fireEvent.change(screen.getByRole('combobox', { name: labels.category }), {
    target: { value: '' },
  });
  fireEvent.change(screen.getByRole('searchbox', { name: labels.search }), {
    target: { value: '   ' },
  });
  fireEvent.click(screen.getByRole('button', { name: labels.apply }));

  expect(push).toHaveBeenCalledExactlyOnceWith(base);
});

test('keeps the selected category from an existing URL when it is absent from the options', () => {
  render(
    <CatalogFilters
      base={base}
      query={{ category: 'Archived category', page: 1 }}
      categories={categories}
      labels={labels}
    />,
  );

  expect(
    screen.getByRole('combobox', { name: labels.category }),
  ).toHaveProperty('value', 'Archived category');
});
