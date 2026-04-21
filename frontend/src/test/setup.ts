// frontend/src/test/setup.ts
//
// Phase 8 (UI-01): jsdom polyfill stubs + testing-library setup.
// jsdom 29 omits several browser globals — stub all before any src/ import.
// C18 guard: ensures component tests in Phase 9 do not break on missing globals.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom 29 ships without TextEncoder/TextDecoder — required by axios + react internals
if (typeof TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = await import('node:util');
  Object.assign(global, { TextEncoder, TextDecoder });
}

// structuredClone missing in some jsdom versions
if (typeof structuredClone === 'undefined') {
  global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}

// ResizeObserver not in jsdom — shadcn components use it via Radix
if (typeof ResizeObserver === 'undefined') {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// matchMedia not in jsdom — Tailwind responsive utilities query it
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

afterEach(() => {
  cleanup();
});
