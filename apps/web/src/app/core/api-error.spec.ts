import { ApiFailure, defaultMessageFor, groupFieldErrors, toApiFailure } from './api-error';

describe('toApiFailure', () => {
  it('ne retraite pas une ApiFailure déjà normalisée', () => {
    const original = new ApiFailure(403, 'FORBIDDEN', 'nope');
    expect(toApiFailure(original)).toBe(original);
  });

  it('convertit une Error standard en ApiFailure', () => {
    const failure = toApiFailure(new Error('coupure'));

    expect(failure.status).toBe(0);
    expect(failure.code).toBe('UNKNOWN');
    expect(failure.message).toBe('coupure');
  });

  it('gère une valeur qui n’est ni Error ni HTTP', () => {
    expect(toApiFailure('boom').code).toBe('UNKNOWN');
    expect(toApiFailure(null).message).toContain('inattendue');
  });
});

describe('groupFieldErrors', () => {
  it('rattache chaque message à son champ', () => {
    const errors = groupFieldErrors([
      'email doit être une adresse email',
      'password doit contenir au moins 10 caractères',
    ]);

    expect(errors['email']).toBe('email doit être une adresse email');
    expect(errors['password']).toContain('10 caractères');
  });

  it('neutralise les indices de tableau', () => {
    const errors = groupFieldErrors(['extraLinks.0.url doit être une URL']);

    expect(errors['extraLinks']).toBeDefined();
  });

  it('conserve le premier message si un champ apparaît deux fois', () => {
    const errors = groupFieldErrors(['email invalide', 'email déjà utilisé']);

    expect(errors['email']).toBe('email invalide');
  });

  it('ignore les entrées qui ne sont pas des chaînes', () => {
    expect(groupFieldErrors([null, 42, { msg: 'x' }])).toEqual({});
  });

  it('retourne un objet vide sans détails', () => {
    expect(groupFieldErrors(undefined)).toEqual({});
    expect(groupFieldErrors('texte')).toEqual({});
  });
});

describe('defaultMessageFor', () => {
  it('couvre les statuts courants', () => {
    expect(defaultMessageFor(0)).toContain('Impossible de joindre');
    expect(defaultMessageFor(401)).toContain('session a expiré');
    expect(defaultMessageFor(403)).toContain('droits');
    expect(defaultMessageFor(404)).toContain('introuvable');
    expect(defaultMessageFor(429)).toContain('Trop de requêtes');
  });

  it('distingue les erreurs serveur des erreurs client', () => {
    expect(defaultMessageFor(500)).toContain('serveur a rencontré');
    expect(defaultMessageFor(418)).toBe('La requête a échoué.');
  });
});

describe('ApiFailure', () => {
  it('expose les messages par champ', () => {
    const failure = new ApiFailure(422, 'VALIDATION_ERROR', 'invalide', ['email invalide']);
    expect(failure.fieldErrors['email']).toBe('email invalide');
  });

  it('identifie un dépassement de quota par statut ou par code', () => {
    expect(new ApiFailure(429, 'OTHER', 'x').isQuotaExceeded).toBe(true);
    expect(new ApiFailure(422, 'QUOTA_EXCEEDED', 'x').isQuotaExceeded).toBe(true);
    expect(new ApiFailure(422, 'VALIDATION_ERROR', 'x').isQuotaExceeded).toBe(false);
  });

  it('identifie les erreurs d’authentification et d’autorisation', () => {
    expect(new ApiFailure(401, 'X', 'x').isUnauthorized).toBe(true);
    expect(new ApiFailure(403, 'X', 'x').isForbidden).toBe(true);
  });
});
