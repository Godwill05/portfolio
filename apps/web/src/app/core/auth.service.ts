import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';

import type {
  AuthResult,
  LoginPayload,
  MeResult,
  Permission,
  PublicUser,
  RegisterPayload,
  SessionInfo,
} from './models';
import { TokenStore } from './token.store';
import { toApiFailure } from './api-error';

/**
 * État d'authentification de l'application.
 *
 * Source de vérité : ce service. Les composants lisent les signals,
 * jamais le TokenStore directement.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStore);
  private readonly router = inject(Router);

  private readonly _user = signal<PublicUser | null>(null);
  private readonly _loading = signal(false);
  /** Vrai tant que la session initiale n'a pas été résolue au démarrage. */
  private readonly _bootstrapped = signal(false);

  readonly user = this._user.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly bootstrapped = this._bootstrapped.asReadonly();

  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly isAdmin = computed(() => {
    const role = this._user()?.role;
    return role === 'admin' || role === 'super_admin';
  });

  /** Vérifie une permission précise, telle que fournie par l'API. */
  can(permission: Permission): boolean {
    return this._user()?.permissions.includes(permission) ?? false;
  }

  canAny(permissions: Permission[]): boolean {
    const owned = this._user()?.permissions ?? [];
    return permissions.some((p) => owned.includes(p));
  }

  login(payload: LoginPayload): Observable<PublicUser> {
    this._loading.set(true);
    return this.http.post<{ data: AuthResult }>('/api/auth/login', payload).pipe(
      tap((res) => this.applySession(res.data)),
      map((res) => res.data.user),
      catchError((error) => {
        this._loading.set(false);
        return throwError(() => toApiFailure(error));
      }),
      tap({
        next: () => this._loading.set(false),
        error: () => this._loading.set(false),
      }),
    );
  }

  register(payload: RegisterPayload): Observable<PublicUser> {
    this._loading.set(true);
    return this.http.post<{ data: AuthResult }>('/api/auth/register', payload).pipe(
      tap((res) => this.applySession(res.data)),
      map((res) => res.data.user),
      catchError((error) => {
        this._loading.set(false);
        return throwError(() => toApiFailure(error));
      }),
      tap({
        next: () => this._loading.set(false),
        error: () => this._loading.set(false),
      }),
    );
  }

  /**
   * Résout la session au démarrage, en deux temps :
   *  1. un access token encore valide en sessionStorage → `GET /auth/me`
   *  2. sinon, tentative de refresh via le cookie httpOnly
   *
   * Un échec n'est pas une erreur : l'utilisateur est simplement anonyme.
   */
  bootstrap(): Observable<PublicUser | null> {
    if (this.tokens.get() && !this.tokens.isExpired()) {
      return this.http.get<{ data: MeResult }>('/api/auth/me').pipe(
        tap((res) => this._user.set(res.data)),
        map((res) => res.data),
        tap(() => {
          this._bootstrapped.set(true);
          this._loading.set(false);
        }),
        catchError(() => this.refreshSession().pipe(tap(() => this._bootstrapped.set(true)))),
      );
    }

    return this.refreshSession().pipe(tap(() => this._bootstrapped.set(true)));
  }

  /** Échange le cookie de refresh contre un nouvel access token. */
  refreshSession(): Observable<PublicUser | null> {
    return this.http.post<{ data: AuthResult }>('/api/auth/refresh', {}).pipe(
      tap((res) => this.applySession(res.data)),
      map((res) => res.data.user as PublicUser | null),
      catchError(() => {
        this.clearSession();
        return of(null);
      }),
    );
  }

  /** Met à jour l'utilisateur en mémoire après une modification de profil. */
  patchUser(partial: Partial<PublicUser>): void {
    const current = this._user();
    if (!current) return;
    this._user.set({ ...current, ...partial });
  }

  logout(): void {
    // On ne bloque pas la navigation sur l'appel réseau : si le serveur
    // est injoignable, la session locale doit quand même être purgée.
    this.http.post('/api/auth/logout', {}).subscribe({
      next: () => this.finishLogout(),
      error: () => this.finishLogout(),
    });
  }

  logoutEverywhere(): Observable<void> {
    return this.http.post<void>('/api/auth/logout-all', {}).pipe(
      tap(() => this.finishLogout()),
      catchError((error) => {
        this.finishLogout();
        return throwError(() => toApiFailure(error));
      }),
    );
  }

  sessions(): Observable<SessionInfo[]> {
    return this.http
      .get<{ data: { items: SessionInfo[] } | SessionInfo[] }>('/api/auth/sessions')
      .pipe(
        map((res) => (Array.isArray(res.data) ? res.data : (res.data.items ?? []))),
        catchError((error) => throwError(() => toApiFailure(error))),
      );
  }

  revokeSession(id: string): Observable<void> {
    return this.http
      .delete<void>(`/api/auth/sessions/${id}`)
      .pipe(catchError((error) => throwError(() => toApiFailure(error))));
  }

  /** Purge l'état local sans appel réseau (utilisé par l'intercepteur). */
  clearSession(): void {
    this.tokens.clear();
    this._user.set(null);
  }

  private finishLogout(): void {
    this.clearSession();
    void this.router.navigate(['/auth/login']);
  }

  private applySession(result: AuthResult): void {
    this.tokens.set(result.tokens.accessToken, result.tokens.expiresIn);
    this._user.set(result.user);
  }
}
