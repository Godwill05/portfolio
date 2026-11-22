import { Routes } from '@angular/router';

import { adminGuard, authGuard, guestGuard } from './core/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app/dashboard' },

  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/auth-layout').then((m) => m.AuthLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'login' },
      {
        path: 'login',
        loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
        title: 'Connexion — FolioForge',
      },
      {
        path: 'register',
        loadComponent: () => import('./features/auth/register-page').then((m) => m.RegisterPage),
        title: 'Créer un compte — FolioForge',
      },
      {
        path: 'forgot-password',
        loadComponent: () =>
          import('./features/auth/forgot-password-page').then((m) => m.ForgotPasswordPage),
        title: 'Mot de passe oublié — FolioForge',
      },
      {
        path: 'reset-password',
        loadComponent: () =>
          import('./features/auth/reset-password-page').then((m) => m.ResetPasswordPage),
        title: 'Réinitialiser le mot de passe — FolioForge',
      },
      {
        path: 'verify-email',
        loadComponent: () =>
          import('./features/auth/verify-email-page').then((m) => m.VerifyEmailPage),
        title: 'Vérification de l’email — FolioForge',
      },
    ],
  },

  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/app-shell').then((m) => m.AppShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
        title: 'Tableau de bord — FolioForge',
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile-page').then((m) => m.ProfilePage),
        title: 'Profil professionnel — FolioForge',
      },
      {
        path: 'profile/preview',
        loadComponent: () =>
          import('./features/profile/portfolio-preview-page').then(
            (m) => m.PortfolioPreviewPage,
          ),
        title: 'Aperçu du portfolio — FolioForge',
      },
      {
        path: 'cvs',
        loadComponent: () => import('./features/cv/cv-library-page').then((m) => m.CvLibraryPage),
        title: 'Mes CV — FolioForge',
      },
      {
        path: 'cvs/:id',
        loadComponent: () => import('./features/cv/cv-editor-page').then((m) => m.CvEditorPage),
        title: 'Éditeur de CV — FolioForge',
      },
      {
        path: 'ai',
        loadComponent: () => import('./features/ai/ai-hub-page').then((m) => m.AiHubPage),
        title: 'Assistant IA — FolioForge',
      },
      {
        path: 'opportunities',
        loadComponent: () =>
          import('./features/ai/opportunities-page').then((m) => m.OpportunitiesPage),
        title: 'Offres suivies — FolioForge',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings-page').then((m) => m.SettingsPage),
        title: 'Paramètres — FolioForge',
      },
      {
        path: 'admin',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/admin/admin-layout').then((m) => m.AdminLayout),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'analytics' },
          {
            path: 'analytics',
            loadComponent: () =>
              import('./features/admin/admin-analytics-page').then((m) => m.AdminAnalyticsPage),
            title: 'Analytique — Administration',
          },
          {
            path: 'users',
            loadComponent: () =>
              import('./features/admin/admin-users-page').then((m) => m.AdminUsersPage),
            title: 'Utilisateurs — Administration',
          },
          {
            path: 'audit',
            loadComponent: () =>
              import('./features/admin/admin-audit-page').then((m) => m.AdminAuditPage),
            title: 'Journal d’audit — Administration',
          },
        ],
      },
    ],
  },

  /** Portfolio public, accessible sans compte. */
  {
    path: 'p/:slug',
    loadComponent: () =>
      import('./features/public/public-portfolio-page').then((m) => m.PublicPortfolioPage),
  },

  {
    path: 'forbidden',
    loadComponent: () => import('./features/errors/forbidden-page').then((m) => m.ForbiddenPage),
    title: 'Accès refusé — FolioForge',
  },
  {
    path: '**',
    loadComponent: () => import('./features/errors/not-found-page').then((m) => m.NotFoundPage),
    title: 'Page introuvable — FolioForge',
  },
];
