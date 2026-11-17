// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeSwitch } from '@/shared/ui/theme-switch';

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

test('exposes the theme as a pressed state and remembers the choice after remount', () => {
  const { unmount } = render(<ThemeSwitch label="Dark theme" />);
  const button = screen.getByRole('button', { name: 'Dark theme' });
  expect(button.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(button);
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(document.documentElement.dataset.theme).toBe('dark');

  unmount();
  render(<ThemeSwitch label="Dark theme" />);
  expect(
    screen
      .getByRole('button', { name: 'Dark theme' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
});
