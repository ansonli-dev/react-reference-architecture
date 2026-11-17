'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from './button';

const key = 'bookstore-theme';
const eventName = 'bookstore:theme';

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(eventName, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(eventName, callback);
  };
}

function currentTheme() {
  try {
    return (
      (localStorage.getItem(key) ?? document.documentElement.dataset.theme) ===
      'dark'
    );
  } catch {
    return document.documentElement.dataset.theme === 'dark';
  }
}

export function ThemeSwitch({ label }: { label: string }) {
  const dark = useSyncExternalStore(subscribe, currentTheme, () => false);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  const Icon = dark ? Sun : Moon;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={dark}
      onClick={() => {
        const next = dark ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(key, next);
        } catch {
          /* Session still has the chosen theme. */
        }
        window.dispatchEvent(new Event(eventName));
      }}
    >
      <Icon aria-hidden />
    </Button>
  );
}
