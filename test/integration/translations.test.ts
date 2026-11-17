import { createTranslator, type AbstractIntlMessages } from 'next-intl';
import { expect, test } from 'vitest';
import en from '../../messages/en.json';
import zhCN from '../../messages/zh-CN.json';

function messagePaths(messages: AbstractIntlMessages, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix + key;
    return typeof value === 'string' ? [path] : messagePaths(value, path + '.');
  });
}

test('both locales define the same message keys, including nested messages', () => {
  expect(messagePaths(zhCN).sort()).toEqual(messagePaths(en).sort());
});

test.each([
  ['en', en],
  ['zh-CN', zhCN],
] as const)(
  'formats catalog numbers with the expected input names in %s',
  (locale, messages) => {
    const t = createTranslator({
      locale,
      messages,
      namespace: 'Catalog',
      onError(error) {
        throw error;
      },
    });

    expect(t('page', { page: 17 })).toContain('17');
    expect(t('stock', { count: 7 })).toContain('7');
  },
);
