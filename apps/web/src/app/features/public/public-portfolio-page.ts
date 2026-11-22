import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ThemeService } from '../../core/theme.service';
import { formatPeriod, initials } from '../../core/format';
import type { PublicPortfolio, Skill, Project, Experience, Education, Language } from '../../core/models';

/** Contenu de repli : la page reste présentable même sans backend. */
const FALLBACK: PublicPortfolio = {
  profile: {
    id: 'demo',
    userId: 'demo',
    slug: 'awa-dossou',
    displayName: 'Awa Dossou',
    headline: 'Développeuse full-stack — je construis des produits web qui tiennent en production',
    professionalTitle: 'Développeuse full-stack',
    summary:
      "Six ans à concevoir et livrer des applications web pour des équipes produit. Je travaille principalement avec TypeScript, Angular et NestJS, avec une attention particulière à la performance et à l'accessibilité. J'aime les problèmes où la contrainte technique est réelle : budgets de latence, données sensibles, équipes réduites.",
    bio: null,
    location: 'Cotonou, Bénin',
    countryCode: 'BJ',
    publicEmail: 'contact@exemple.com',
    phone: null,
    websiteUrl: null,
    linkedinUrl: 'https://linkedin.com',
    githubUrl: 'https://github.com',
    twitterUrl: null,
    dribbbleUrl: null,
    gitlabUrl: null,
    stackoverflowUrl: null,
    extraLinks: null,
    metaTitle: null,
    metaDescription: null,
    accentColor: '#035c80',
    portfolioTemplate: 'modern',
    visibility: 'public',
    indexable: true,
    showEmail: true,
    showPhone: false,
    showProjects: true,
    showExperience: true,
    showEducation: true,
    showSkills: true,
    showCvDownload: true,
    contactEnabled: true,
    createdAt: '',
    updatedAt: '',
  },
  skills: [
    { id: 's1', profileId: 'demo', name: 'TypeScript', category: 'Langages', description: null, level: 'expert', rating: 5, sortOrder: 0, featured: true, visible: true, yearsOfExperience: 6 },
    { id: 's2', profileId: 'demo', name: 'Angular', category: 'Frontend', description: null, level: 'expert', rating: 5, sortOrder: 1, featured: true, visible: true, yearsOfExperience: 5 },
    { id: 's3', profileId: 'demo', name: 'NestJS', category: 'Backend', description: null, level: 'advanced', rating: 4, sortOrder: 2, featured: true, visible: true, yearsOfExperience: 4 },
    { id: 's4', profileId: 'demo', name: 'PostgreSQL', category: 'Données', description: null, level: 'advanced', rating: 4, sortOrder: 3, featured: false, visible: true, yearsOfExperience: 5 },
    { id: 's5', profileId: 'demo', name: 'Docker', category: 'Infrastructure', description: null, level: 'intermediate', rating: 3, sortOrder: 4, featured: false, visible: true, yearsOfExperience: 3 },
    { id: 's6', profileId: 'demo', name: 'Accessibilité', category: 'Pratiques', description: null, level: 'advanced', rating: 4, sortOrder: 5, featured: true, visible: true, yearsOfExperience: 4 },
  ],
  projects: [
    {
      id: 'p1', profileId: 'demo', title: 'FolioForge',
      subtitle: 'Plateforme de portfolio et de génération de CV',
      description: "Application complète : éditeur de portfolio, moteur de rendu PDF pour 12 modèles de CV, assistant IA avec quotas et facturation.",
      problem: 'Les outils existants imposent un modèle unique et exportent des PDF mal structurés.',
      solution: 'Un moteur de rendu maison, un routeur de modèles IA par tâche, et une API entièrement typée.',
      outcome: '12 modèles de CV, rendu PDF sous 200 ms, texte sélectionnable.',
      technologies: ['Angular', 'NestJS', 'TypeORM', 'MySQL', 'PDFKit'],
      imageFileIds: null, demoUrl: null, repositoryUrl: 'https://github.com',
      videoUrl: null, category: 'Produit', status: 'in_progress',
      startDate: '2025-01-01', endDate: null, isHighlighted: true, visible: true, sortOrder: 0,
      metrics: [{ label: 'Modèles', value: '12' }, { label: 'Temps de rendu', value: '< 200 ms' }],
    },
    {
      id: 'p2', profileId: 'demo', title: 'Suivi de flotte',
      subtitle: 'Tableau de bord temps réel pour 400 véhicules',
      description: "Ingestion de signaux GPS, détection d'anomalies et alertes. Interface cartographique avec regroupement de marqueurs.",
      problem: null, solution: null, outcome: "Latence de bout en bout ramenée de 40 s à 1,2 s.",
      technologies: ['TypeScript', 'Node.js', 'PostgreSQL', 'PostGIS'],
      imageFileIds: null, demoUrl: null, repositoryUrl: null,
      videoUrl: null, category: 'Temps réel', status: 'completed',
      startDate: '2023-03-01', endDate: '2024-06-30', isHighlighted: true, visible: true, sortOrder: 1,
      metrics: [{ label: 'Véhicules', value: '400' }, { label: 'Latence', value: '1,2 s' }],
    },
  ],
  experiences: [
    {
      id: 'e1', profileId: 'demo', role: 'Développeuse full-stack senior',
      company: 'Atelier Numérique', companyUrl: null, location: 'Cotonou, Bénin',
      type: 'full_time', startDate: '2023-01-01', endDate: null, isCurrent: true,
      description: "Conception et livraison de produits web pour des clients en Afrique de l'Ouest. Référente technique sur trois projets simultanés.",
      highlights: ['Réduction de 60 % du temps de chargement initial sur le produit principal', 'Mise en place de la CI/CD et des tests automatisés (couverture 78 %)', 'Encadrement de deux développeurs juniors'],
      technologies: ['Angular', 'NestJS', 'MySQL', 'Docker'],
      sortOrder: 0,
    },
    {
      id: 'e2', profileId: 'demo', role: 'Développeuse frontend',
      company: 'Studio Kora', companyUrl: null, location: 'Abidjan, Côte d’Ivoire',
      type: 'contract', startDate: '2020-09-01', endDate: '2022-12-31', isCurrent: false,
      description: "Développement d'interfaces pour des marques e-commerce. Migration d'une base AngularJS vers Angular moderne.",
      highlights: ['Migration de 47 composants sans interruption de service', 'Score Lighthouse porté de 52 à 94'],
      technologies: ['Angular', 'SCSS', 'RxJS'],
      sortOrder: 1,
    },
  ],
  educations: [
    { id: 'ed1', profileId: 'demo', kind: 'degree', institution: 'Université d’Abomey-Calavi', institutionUrl: null, title: 'Master en informatique', field: 'Génie logiciel', location: 'Cotonou', startDate: '2016-09-01', endDate: '2018-07-31', isCurrent: false, description: null, grade: 'Mention bien', sortOrder: 0 },
    { id: 'ed2', profileId: 'demo', kind: 'certification', institution: 'Google', institutionUrl: null, title: 'Web Performance Fundamentals', field: null, location: null, startDate: '2023-04-01', endDate: '2023-06-30', isCurrent: false, description: null, grade: null, sortOrder: 1 },
  ],
  languages: [
    { id: 'l1', profileId: 'demo', name: 'Français', level: 'native', proficiency: 5, isNative: true, sortOrder: 0 },
    { id: 'l2', profileId: 'demo', name: 'Anglais', level: 'fluent', proficiency: 4, isNative: false, sortOrder: 1 },
    { id: 'l3', profileId: 'demo', name: 'Fon', level: 'native', proficiency: 5, isNative: true, sortOrder: 2 },
  ],
  cv: null,
};

@Component({
  selector: 'app-public-portfolio-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './public-portfolio-page.html',
  styleUrl: './public-portfolio-page.scss',
})
export class PublicPortfolioPage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  protected readonly theme = inject(ThemeService);

  protected readonly data = signal<PublicPortfolio | null>(null);
  protected readonly loading = signal(true);
  protected readonly usingFallback = signal(false);

  protected readonly profile = computed(() => this.data()?.profile ?? null);

  protected readonly featuredSkills = computed(
    () => (this.data()?.skills ?? []).filter((s) => s.featured).slice(0, 8),
  );

  protected readonly otherSkills = computed(
    () => (this.data()?.skills ?? []).filter((s) => !s.featured),
  );

  protected readonly projects = computed(() =>
    (this.data()?.projects ?? []).filter((p) => p.visible).slice(0, 6),
  );

  protected readonly experiences = computed(() => this.data()?.experiences ?? []);
  protected readonly educations = computed(() => this.data()?.educations ?? []);
  protected readonly languages = computed(() => this.data()?.languages ?? []);

  protected readonly skillGroups = computed(() => {
    const groups = new Map<string, Skill[]>();
    for (const skill of this.data()?.skills ?? []) {
      const key = skill.category ?? 'Autres';
      const list = groups.get(key) ?? [];
      list.push(skill);
      groups.set(key, list);
    }
    return [...groups.entries()].map(([category, items]) => ({ category, items }));
  });

  protected readonly year = new Date().getFullYear();
  protected readonly currentYear = new Date().getFullYear();

  constructor() {
    const slug = this.route.snapshot.paramMap.get('slug');
    if (slug) {
      this.fetch(`/api/portfolio/${slug}`);
    } else {
      // Pas de slug : on résout le premier portfolio publié.
      this.http.get<{ data: string[] | { items: string[] } }>('/api/portfolio/slugs/list').subscribe({
        next: (res) => {
          const list = Array.isArray(res.data) ? res.data : (res.data.items ?? []);
          const first = list[0];
          if (first) this.fetch(`/api/portfolio/${first}`);
          else this.useFallback();
        },
        error: () => this.useFallback(),
      });
    }
  }

  private fetch(url: string): void {
    this.http.get<{ data: PublicPortfolio }>(url).subscribe({
      next: (res) => {
        this.data.set(res.data);
        this.loading.set(false);
      },
      error: () => this.useFallback(),
    });
  }

  private useFallback(): void {
    this.data.set(FALLBACK);
    this.usingFallback.set(true);
    this.loading.set(false);
  }

  protected initialsOf(first?: string | null, last?: string | null): string {
    if (first || last) return initials(first, last);
    const name = this.profile()?.displayName ?? '';
    const parts = name.trim().split(/\s+/);
    return initials(parts[0], parts[1]);
  }

  protected period(start: string | null, end: string | null): string {
    return formatPeriod(start, end);
  }

  protected skillPercent(skill: Skill): number {
    if (skill.rating) return (skill.rating / 5) * 100;
    const map: Record<string, number> = { beginner: 35, intermediate: 60, advanced: 82, expert: 100 };
    return map[skill.level] ?? 60;
  }

  protected levelLabel(level: string): string {
    const map: Record<string, string> = {
      beginner: 'Débutant',
      intermediate: 'Intermédiaire',
      advanced: 'Avancé',
      expert: 'Expert',
      native: 'Langue maternelle',
      fluent: 'Courant',
      basic: 'Notions',
    };
    return map[level] ?? level;
  }

  protected trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  protected readonly asSkill = (x: Skill): Skill => x;
  protected readonly asProject = (x: Project): Project => x;
  protected readonly asExperience = (x: Experience): Experience => x;
  protected readonly asEducation = (x: Education): Education => x;
  protected readonly asLanguage = (x: Language): Language => x;
}
