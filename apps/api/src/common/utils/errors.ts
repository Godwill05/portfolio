import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain-level error carrying a stable machine code so the Angular client can
 * branch on it (and translate it) without parsing messages.
 */
export class AppError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export const Errors = {
  unauthorized: (message = 'Authentification requise') =>
    new AppError('AUTH_REQUIRED', message, HttpStatus.UNAUTHORIZED),
  invalidCredentials: () =>
    new AppError('AUTH_INVALID_CREDENTIALS', 'Email ou mot de passe incorrect', HttpStatus.UNAUTHORIZED),
  forbidden: (message = 'Accès refusé') => new AppError('FORBIDDEN', message, HttpStatus.FORBIDDEN),
  notFound: (entity = 'Ressource') =>
    new AppError('NOT_FOUND', `${entity} introuvable`, HttpStatus.NOT_FOUND),
  conflict: (message: string, code = 'CONFLICT') => new AppError(code, message, HttpStatus.CONFLICT),
  validation: (message: string, details?: unknown) =>
    new AppError('VALIDATION_ERROR', message, HttpStatus.UNPROCESSABLE_ENTITY, details),
  quotaExceeded: (details?: unknown) =>
    new AppError(
      'QUOTA_EXCEEDED',
      'Vous avez atteint votre limite d’utilisation. Réessayez plus tard ou débloquez des utilisations supplémentaires.',
      HttpStatus.TOO_MANY_REQUESTS,
      details,
    ),
  rateLimited: (message = 'Trop de requêtes. Réessayez dans un instant.') =>
    new AppError('RATE_LIMITED', message, HttpStatus.TOO_MANY_REQUESTS),
  accountLocked: () =>
    new AppError(
      'ACCOUNT_LOCKED',
      'Compte temporairement verrouillé après plusieurs tentatives. Réessayez plus tard.',
      HttpStatus.TOO_MANY_REQUESTS,
    ),
  accountDisabled: () =>
    new AppError('ACCOUNT_DISABLED', 'Ce compte est désactivé. Contactez le support.', HttpStatus.FORBIDDEN),
  aiUnavailable: (message = 'Aucun fournisseur IA disponible pour le moment.') =>
    new AppError('AI_UNAVAILABLE', message, HttpStatus.SERVICE_UNAVAILABLE),
  externalService: (service: string) =>
    new AppError('EXTERNAL_SERVICE_ERROR', `Service ${service} indisponible`, HttpStatus.BAD_GATEWAY),
};
