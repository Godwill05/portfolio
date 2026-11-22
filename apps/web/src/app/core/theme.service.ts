import { Injectable, effect, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'ff.theme';

/**
 * Gestion du thème clair / sombre / système.
 *
 * On écrit l'attribut `data-theme` sur `<html>` : les tokens SCSS sont
 * déclarés sous `[data-theme='dark']`, donc aucun composant n'a besoin de
 * connaître le thème courant.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  private readonly _mode = signal<ThemeMode>(this.readStored());
  readonly mode = this._mode.asReadonly();

  constructor() {
    effect(() => {
      const mode = this._mode();
      this.apply(mode);
    });

    // Suit les changements du système uniquement si l'utilisateur a choisi
    // « système ».
    this.media.addEventListener('change', () => {
      if (this._mode() === 'system') this.apply('system');
    });
  }

  set(mode: ThemeMode): void {
    this._mode.set(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* stockage indisponible */
    }
  }

  toggle(): void {
    const resolved = this.resolved();
    this.set(resolved === 'dark' ? 'light' : 'dark');
  }

  /** Thème effectivement appliqué, une fois « système » résolu. */
  resolved(): 'light' | 'dark' {
    const mode = this._mode();
    if (mode === 'system') return this.media.matches ? 'dark' : 'light';
    return mode;
  }

  private apply(mode: ThemeMode): void {
    const effective = mode === 'system' ? (this.media.matches ? 'dark' : 'light') : mode;
    document.documentElement.setAttribute('data-theme', effective);
    document.documentElement.style.colorScheme = effective;
  }

  private readStored(): ThemeMode {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    } catch {
      /* rien */
    }
    return 'system';
  }
}
