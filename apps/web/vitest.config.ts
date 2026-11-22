import { defineConfig } from 'vitest/config';

/**
 * Tests unitaires du front.
 *
 * Environnement `node` volontairement : les fichiers testés ici sont des
 * fonctions pures (normalisation d'erreur, formatage). Les tests de
 * composants nécessiteraient jsdom et ne sont pas couverts à ce stade —
 * cela vaut mieux qu'un test qui ne vérifie que le squelette généré.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globals: true,
  },
});
