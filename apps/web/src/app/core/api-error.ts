/** Erreur applicative normalisée, quelle que soit son origine. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiFailure';
  }

  /** Messages de validation par champ, quand l'API en renvoie. */
  get fieldErrors(): Record<string, string> {
    return groupFieldErrors(this.details);
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isQuotaExceeded(): boolean {
    return this.code === 'QUOTA_EXCEEDED' || this.status === 429;
  }
}

/**
 * Rattache chaque message de validation à son champ.
 *
 * class-validator renvoie des phrases du type « email doit être une adresse
 * email » : le nom du champ est systématiquement le premier mot.
 */
export function groupFieldErrors(details: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(details)) return out;

  for (const entry of details) {
    if (typeof entry !== 'string') continue;
    const [first] = entry.split(/\s+/);
    if (!first) continue;
    // Neutralise les indices de tableau : `extraLinks.0.url` → `extraLinks`.
    const key = first.split(/[[\].]/)[0];
    if (key) out[key] ??= entry;
  }
  return out;
}

export function defaultMessageFor(status: number): string {
  switch (status) {
    case 0:
      return 'Impossible de joindre le serveur. Vérifiez votre connexion.';
    case 400:
      return 'La requête est invalide.';
    case 401:
      return 'Votre session a expiré. Reconnectez-vous.';
    case 403:
      return "Vous n'avez pas les droits nécessaires.";
    case 404:
      return 'Ressource introuvable.';
    case 409:
      return 'Cette ressource existe déjà.';
    case 422:
      return 'Certaines informations sont invalides.';
    case 429:
      return 'Trop de requêtes. Patientez un instant.';
    case 503:
      return 'Le service est momentanément indisponible.';
    default:
      return status >= 500
        ? 'Le serveur a rencontré une erreur. Réessayez plus tard.'
        : 'La requête a échoué.';
  }
}

/**
 * Traduit n'importe quel échec HTTP en `ApiFailure`.
 *
 * L'API renvoie toujours `{statusCode, code, message, details, requestId}`;
 * mais un proxy, un timeout ou une coupure réseau ne produisent pas ce
 * format — d'où les replis ci-dessous.
 */
export function toApiFailure(error: unknown): ApiFailure {
  if (error instanceof ApiFailure) return error;

  if (isHttpError(error)) {
    if (error.status === 0) {
      return new ApiFailure(0, 'NETWORK_ERROR', defaultMessageFor(0));
    }

    const body = error.error as Partial<{
      code: string;
      message: string | string[];
      details: unknown;
      requestId: string;
    }> | null;

    const rawMessage = body?.message;
    const message = Array.isArray(rawMessage)
      ? 'Les données fournies sont invalides.'
      : (rawMessage ?? defaultMessageFor(error.status));

    return new ApiFailure(
      error.status,
      body?.code ?? 'ERROR',
      message,
      body?.details ?? (Array.isArray(rawMessage) ? rawMessage : undefined),
      body?.requestId,
    );
  }

  if (error instanceof Error) {
    return new ApiFailure(0, 'UNKNOWN', error.message);
  }

  return new ApiFailure(0, 'UNKNOWN', 'Une erreur inattendue est survenue.');
}

/**
 * Détection structurelle d'une `HttpErrorResponse`.
 *
 * On évite `instanceof` pour que ce module reste testable sans charger
 * Angular : importer `@angular/common/http` suffit à déclencher le
 * compilateur JIT hors build, ce qui casse un test unitaire isolé.
 * La forme testée — `status` numérique et propriété `error` — est stable
 * dans toutes les versions d'Angular et absente des objets Error natifs.
 */
function isHttpError(value: unknown): value is {
  status: number;
  error: unknown;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    typeof (value as { status: unknown }).status === 'number' &&
    'error' in value
  );
}
