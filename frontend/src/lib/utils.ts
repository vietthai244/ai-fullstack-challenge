// frontend/src/lib/utils.ts
//
// Phase 8 (UI-01): shadcn cn() utility.
// Combines clsx conditional class logic with tailwind-merge conflict resolution.
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
