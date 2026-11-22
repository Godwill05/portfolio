import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from './auth.service';
import { TokenStore } from './token.store';

/**
 * Requêtes qui ne doivent jamais déclencher de refresh : elles servent
 * justement à établir la session.
 */
const AUTH_ENDPOINTS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh'];

/**
 * Refresh en cours, partagé entre tous les appels concurrents.
 *
 * Sans ce verrou, cinq requêtes qui échouent en 401 simultanément
 * lanceraient cinq refresh avec le même cookie de refresh-rotation : le
 * premier réussit, les quatre autres présentent un jeton déjà consommé et
 * l'API révoque toute la famille de sessions. L'utilisateur est déconnecté
 * pour une raison purement concurrentielle.
 */
let refreshInFlight: Observable<unknown> | null = null;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokens = inject(TokenStore);
  const auth = inject(AuthService);

  const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => req.url.includes(path));
  const token = tokens.get();

  const authorized =
    token && !isAuthEndpoint && !tokens.isExpired() ? withBearer(req, token) : req;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      // Un 401 sur un endpoint d'auth est une vraie erreur : on la laisse
      // remonter pour que le formulaire affiche « identifiants invalides ».
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        isAuthEndpoint ||
        req.url.includes('/api/auth/refresh')
      ) {
        return throwError(() => error);
      }

      refreshInFlight ??= auth.refreshSession().pipe(
        // Réinitialisé quoi qu'il arrive, sinon une seule erreur de refresh
        // bloquerait définitivement tous les suivants.
        finalizeRefresh(),
      );

      return refreshInFlight.pipe(
        switchMap((user) => {
          if (!user) return throwError(() => error);

          const fresh = tokens.get();
          if (!fresh) return throwError(() => error);

          return next(withBearer(req, fresh));
        }),
        catchError((refreshError: unknown) => throwError(() => refreshError)),
      );
    }),
  );
};

function withBearer(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

function finalizeRefresh<T>(): (source: Observable<T>) => Observable<T> {
  return (source) =>
    new Observable<T>((subscriber) => {
      const sub = source.subscribe(subscriber);
      return () => {
        refreshInFlight = null;
        sub.unsubscribe();
      };
    });
}

/**
 * Le refresh renvoie `{data:{user,tokens}}`; on ne se sert ici que de la
 * présence de l'utilisateur comme signal de succès.
 */
export function isSuccess<T>(event: HttpEvent<T>): event is HttpResponse<T> {
  return event instanceof HttpResponse;
}
