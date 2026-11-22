import { Injectable, signal } from '@angular/core';

const ACCESS_KEY = 'ff.access';
const EXPIRY_KEY = 'ff.access.exp';

/**
 * Ne conserve que l'access token, en mémoire + sessionStorage.
 *
 * Le refresh token vit dans un cookie httpOnly posé par l'API : il est
 * invisible depuis le JS, ce qui le met hors de portée d'une XSS. On ne
 * stocke donc jamais rien de sensible ici — seulement le jeton d'accès
 * court (15 min) pour survivre à un rechargement de page.
 *
 * sessionStorage plutôt que localStorage : la session meurt avec l'onglet.
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  private readonly _token = signal<string | null>(this.read(ACCESS_KEY));
  private readonly _expiresAt = signal<number | null>(this.readNumber(EXPIRY_KEY));

  readonly token = this._token.asReadonly();

  set(accessToken: string, expiresInSeconds: number): void {
    // Marge de 30 s : on considère le jeton expiré un peu avant l'heure
    // pour éviter une course entre l'envoi et la validation côté serveur.
    const expiresAt = Date.now() + Math.max(0, expiresInSeconds - 30) * 1000;

    this._token.set(accessToken);
    this._expiresAt.set(expiresAt);
    this.write(ACCESS_KEY, accessToken);
    this.write(EXPIRY_KEY, String(expiresAt));
  }

  get(): string | null {
    return this._token();
  }

  /** Vrai si aucun jeton, ou s'il est sur le point d'expirer. */
  isExpired(): boolean {
    const expiresAt = this._expiresAt();
    if (!expiresAt) return true;
    return Date.now() >= expiresAt;
  }

  clear(): void {
    this._token.set(null);
    this._expiresAt.set(null);
    this.remove(ACCESS_KEY);
    this.remove(EXPIRY_KEY);
  }

  private read(key: string): string | null {
    try {
      return globalThis.sessionStorage?.getItem(key) ?? null;
    } catch {
      // Navigation privée stricte : on retombe sur la mémoire seule.
      return null;
    }
  }

  private readNumber(key: string): number | null {
    const raw = this.read(key);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private write(key: string, value: string): void {
    try {
      globalThis.sessionStorage?.setItem(key, value);
    } catch {
      /* stockage indisponible — la session reste en mémoire */
    }
  }

  private remove(key: string): void {
    try {
      globalThis.sessionStorage?.removeItem(key);
    } catch {
      /* rien à faire */
    }
  }
}
