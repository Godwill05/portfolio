import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';

import { AuthService } from './auth.service';

/**
 * Exige une session valide.
 *
 * Attend la résolution du bootstrap : sans ça, un rechargement de page
 * renverrait l'utilisateur vers /auth/login pendant que le refresh est
 * encore en vol.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const decide = (authenticated: boolean) => {
    if (authenticated) return true;
    return router.createUrlTree(['/auth/login'], { queryParams: { next: state.url } });
  };

  if (auth.bootstrapped()) return decide(auth.isAuthenticated());

  return auth.bootstrap().pipe(map(() => decide(auth.isAuthenticated())));
};

/** Exige une session et redirige si la permission manque. */
export const permissionGuard = (permission: Parameters<AuthService['can']>[0]): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (auth.can(permission)) return true;
    return router.createUrlTree(['/forbidden']);
  };
};

/** Exige le rôle admin (admin ou super_admin). */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAdmin()) return true;
  return router.createUrlTree(['/forbidden']);
};

/** Empêche un utilisateur déjà connecté de revoir login/register. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return router.createUrlTree(['/app/dashboard']);
  return true;
};
