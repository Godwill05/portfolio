import type { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import { User } from '../entities/user.entity';
import {
  Education,
  Experience,
  Language_,
  ProfessionalProfile,
  Project,
  ProjectSkill,
  Skill,
} from '../entities/profile.entity';
import { Cv } from '../entities/cv.entity';
import {
  AccountStatus,
  CvSectionType,
  CvStatus,
  EducationKind,
  ExperienceType,
  PortfolioVisibility,
  ProjectStatus,
  SkillLevel,
  UserRole,
} from '../../common/constants/domain';

const DEMO_EMAIL = 'demo@folioforge.local';
const DEMO_PASSWORD = 'DemoFolio2026';

/**
 * Demo account with realistic, coherent content so the app can be evaluated
 * end-to-end (portfolio, CV editor, AI prompts) without manual data entry.
 * Idempotent: re-running never duplicates rows.
 */
export async function seedDemoUser(ds: DataSource, log: (m: string) => void): Promise<void> {
  const users = ds.getRepository(User);
  const existing = await users.findOne({ where: { email: DEMO_EMAIL } });

  if (existing) {
    log(`Compte démo déjà présent : ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    return;
  }

  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const user = await users.save(
    users.create({
      email: DEMO_EMAIL,
      passwordHash,
      firstName: 'Awa',
      lastName: 'Dossou',
      role: UserRole.USER,
      status: AccountStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      locale: 'fr',
      avatarFileId: null,
    }),
  );

  const profile = await ds.getRepository(ProfessionalProfile).save({
    userId: user.id,
    displayName: 'Awa Dossou',
    headline: 'Développeuse fullstack — produits web à fort impact',
    professionalTitle: 'Développeuse Fullstack Senior',
    summary:
      'Développeuse fullstack passionnée par les produits qui résolvent de vrais problèmes. Six ans d’expérience sur des applications web à fort trafic, avec une expertise particulière sur les architectures TypeScript, les API performantes et les interfaces accessibles.',
    bio: 'Je conçois et construis des applications web de bout en bout. J’aime particulièrement le moment où un problème métier complexe devient une interface simple à utiliser.',
    location: 'Cotonou, Bénin',
    countryCode: 'BJ',
    publicEmail: 'awa.dossou@example.com',
    phone: '+229 97 00 00 00',
    websiteUrl: 'https://awa-dossou.example.com',
    linkedinUrl: 'https://linkedin.com/in/awa-dossou-demo',
    githubUrl: 'https://github.com/awa-dossou-demo',
    slug: 'awa-dossou',
    visibility: PortfolioVisibility.PUBLIC,
    publishedAt: new Date(),
    accentColor: '#035c80',
    portfolioTemplate: 'atlas',
    metaTitle: 'Awa Dossou — Développeuse Fullstack Senior',
    metaDescription:
      'Portfolio d’Awa Dossou, développeuse fullstack : projets, expériences et compétences en TypeScript, Node.js et Angular.',
  });

  const skills = await ds.getRepository(Skill).save([
    { profileId: profile.id, name: 'TypeScript', category: 'Langages', level: SkillLevel.EXPERT, rating: 5, featured: true, yearsOfExperience: 6, sortOrder: 1, description: 'Typage avancé, generics, design de types partagés front/back.' },
    { profileId: profile.id, name: 'Angular', category: 'Frontend', level: SkillLevel.EXPERT, rating: 5, featured: true, yearsOfExperience: 5, sortOrder: 2, description: 'Architecture standalone, signals, performance de rendu.' },
    { profileId: profile.id, name: 'Node.js', category: 'Backend', level: SkillLevel.ADVANCED, rating: 4, featured: true, yearsOfExperience: 6, sortOrder: 3, description: 'API REST, NestJS, streaming, files d’attente.' },
    { profileId: profile.id, name: 'PostgreSQL', category: 'Données', level: SkillLevel.ADVANCED, rating: 4, featured: false, yearsOfExperience: 5, sortOrder: 4 },
    { profileId: profile.id, name: 'Docker', category: 'Infrastructure', level: SkillLevel.INTERMEDIATE, rating: 3, featured: false, yearsOfExperience: 3, sortOrder: 5 },
    { profileId: profile.id, name: 'UX / Accessibilité', category: 'Design', level: SkillLevel.ADVANCED, rating: 4, featured: true, yearsOfExperience: 4, sortOrder: 6, description: 'WCAG 2.2, navigation clavier, lecteurs d’écran.' },
  ]);

  const project = await ds.getRepository(Project).save({
    profileId: profile.id,
    title: 'Kpèdo — plateforme logistique',
    subtitle: 'Suivi de livraisons temps réel pour PME béninoises',
    description:
      'Application de suivi de livraisons utilisée par une dizaine de PME à Cotonou et Porto-Novo. Les commerçants suivent leurs colis en temps réel et les livreurs reçoivent leurs tournées optimisées.',
    problem:
      'Les PME géraient leurs livraisons sur WhatsApp, sans traçabilité ni preuve de livraison exploitable.',
    solution:
      'Application web progressive avec suivi temps réel par websockets, génération de bons de livraison PDF et tableau de bord de performance.',
    outcome:
      'Temps moyen de confirmation de livraison réduit de 40 %, et zéro litige client non documenté depuis la mise en production.',
    technologies: ['Angular', 'NestJS', 'PostgreSQL', 'Redis', 'Docker'],
    category: 'Produit SaaS',
    status: ProjectStatus.COMPLETED,
    startDate: '2024-02-01',
    endDate: '2024-09-30',
    isHighlighted: true,
    sortOrder: 1,
    metrics: [
      { label: 'PME actives', value: '12' },
      { label: 'Livraisons / mois', value: '1 800+' },
      { label: 'Temps de confirmation', value: '−40 %' },
    ],
  });

  await ds.getRepository(ProjectSkill).save([
    { projectId: project.id, skillId: skills[0]!.id },
    { projectId: project.id, skillId: skills[1]!.id },
    { projectId: project.id, skillId: skills[2]!.id },
  ]);

  await ds.getRepository(Project).save({
    profileId: profile.id,
    title: 'Atlas Design System',
    subtitle: 'Bibliothèque de composants accessible et thémable',
    description:
      'Design system open source construit pour une fintech, avec theming par tokens CSS et couverture de tests d’accessibilité.',
    problem: 'Trois équipes produisaient des interfaces incohérentes et non accessibles.',
    solution:
      'Bibliothèque de 40 composants documentés, tokens de design centralisés, tests d’accessibilité automatisés en CI.',
    outcome: 'Temps de développement d’un nouvel écran divisé par deux.',
    technologies: ['TypeScript', 'Angular', 'Storybook'],
    category: 'Open source',
    status: ProjectStatus.COMPLETED,
    startDate: '2023-05-01',
    endDate: '2023-12-15',
    sortOrder: 2,
    metrics: [{ label: 'Composants', value: '40' }],
  });

  await ds.getRepository(Experience).save([
    {
      profileId: profile.id,
      role: 'Développeuse Fullstack Senior',
      company: 'Nexa Digital',
      companyUrl: 'https://example.com',
      location: 'Cotonou, Bénin',
      type: ExperienceType.FULL_TIME,
      startDate: '2023-01-01',
      endDate: null,
      isCurrent: true,
      description:
        'Responsable technique de deux produits SaaS et référente frontend de l’équipe produit.',
      achievements: [
        'Refonte de l’application principale en Angular standalone, temps de chargement initial réduit de 55 %.',
        'Mise en place d’une API NestJS modulaire servant 200 000 requêtes par jour.',
        'Accompagnement de trois développeurs juniors, avec un plan de mentorat structuré.',
      ],
      technologies: ['Angular', 'NestJS', 'PostgreSQL', 'Docker'],
      sortOrder: 1,
    },
    {
      profileId: profile.id,
      role: 'Développeuse Fullstack',
      company: 'Studio Kora',
      location: 'Cotonou, Bénin',
      type: ExperienceType.FULL_TIME,
      startDate: '2020-03-01',
      endDate: '2022-12-31',
      description: 'Développement d’applications web pour des clients en Afrique de l’Ouest.',
      achievements: [
        'Livraison de 9 projets client dans les délais, dont 3 applications à fort trafic.',
        'Industrialisation du pipeline de déploiement, réduisant les mises en production manuelles de 80 %.',
      ],
      technologies: ['Angular', 'Node.js', 'MySQL'],
      sortOrder: 2,
    },
  ]);

  await ds.getRepository(Education).save([
    {
      profileId: profile.id,
      kind: EducationKind.DEGREE,
      degree: "Master en Génie Logiciel",
      institution: 'Université d’Abomey-Calavi',
      location: 'Abomey-Calavi, Bénin',
      fieldOfStudy: 'Génie logiciel',
      startDate: '2018-09-01',
      endDate: '2020-07-31',
      grade: 'Mention Bien',
      sortOrder: 1,
    },
    {
      profileId: profile.id,
      kind: EducationKind.DEGREE,
      degree: 'Licence Informatique',
      institution: 'Université d’Abomey-Calavi',
      fieldOfStudy: 'Informatique',
      startDate: '2015-09-01',
      endDate: '2018-07-31',
      sortOrder: 2,
    },
    {
      profileId: profile.id,
      kind: EducationKind.CERTIFICATION,
      title: 'AWS Certified Cloud Practitioner',
      institution: 'Amazon Web Services',
      endDate: '2023-06-15',
      credentialId: 'AWS-DEMO-0001',
      sortOrder: 3,
    },
  ]);

  await ds.getRepository(Language_).save([
    { profileId: profile.id, name: 'Français', proficiency: 'Langue maternelle', sortOrder: 1 },
    { profileId: profile.id, name: 'Anglais', proficiency: 'C1 — professionnel', sortOrder: 2 },
    { profileId: profile.id, name: 'Fon', proficiency: 'Courant', sortOrder: 3 },
  ]);

  // One ready-to-use CV so the editor and PDF export can be tested immediately.
  await ds.getRepository(Cv).save({
    userId: user.id,
    title: 'CV — Développeuse Fullstack Senior',
    templateKey: 'atlas',
    status: CvStatus.DRAFT,
    targetRole: 'Développeuse Fullstack Senior',
    document: {
      header: {
        fullName: 'Awa Dossou',
        headline: 'Développeuse Fullstack Senior',
        email: 'awa.dossou@example.com',
        phone: '+229 97 00 00 00',
        location: 'Cotonou, Bénin',
        website: 'https://awa-dossou.example.com',
        linkedin: 'https://linkedin.com/in/awa-dossou-demo',
        github: 'https://github.com/awa-dossou-demo',
      },
      sections: [
        {
          id: 'summary',
          type: CvSectionType.SUMMARY,
          title: 'Profil',
          visible: true,
          items: [],
          body:
            'Développeuse fullstack avec six ans d’expérience sur des applications web à fort trafic. Spécialisée en TypeScript, Angular et NestJS, avec une attention constante portée à la performance et à l’accessibilité.',
        },
        {
          id: 'experience',
          type: CvSectionType.EXPERIENCE,
          title: 'Expérience professionnelle',
          visible: true,
          items: [
            {
              id: 'exp-1',
              title: 'Développeuse Fullstack Senior',
              subtitle: 'Nexa Digital',
              meta: 'CDI',
              location: 'Cotonou, Bénin',
              startDate: '2023-01-01',
              endDate: undefined,
              bullets: [
                'Refonte de l’application principale en Angular standalone : −55 % de temps de chargement initial.',
                'Conception d’une API NestJS modulaire servant 200 000 requêtes par jour.',
                'Mentorat de trois développeurs juniors.',
              ],
            },
            {
              id: 'exp-2',
              title: 'Développeuse Fullstack',
              subtitle: 'Studio Kora',
              location: 'Cotonou, Bénin',
              startDate: '2020-03-01',
              endDate: '2022-12-31',
              bullets: [
                'Livraison de neuf projets client, dont trois applications à fort trafic.',
                'Automatisation du déploiement : −80 % d’interventions manuelles.',
              ],
            },
          ],
        },
        {
          id: 'education',
          type: CvSectionType.EDUCATION,
          title: 'Formation',
          visible: true,
          items: [
            {
              id: 'edu-1',
              title: 'Master en Génie Logiciel',
              subtitle: 'Université d’Abomey-Calavi',
              meta: 'Mention Bien',
              startDate: '2018-09-01',
              endDate: '2020-07-31',
            },
          ],
        },
        {
          id: 'skills',
          type: CvSectionType.SKILLS,
          title: 'Compétences',
          visible: true,
          items: [
            { id: 's-1', title: 'TypeScript', level: 5 },
            { id: 's-2', title: 'Angular', level: 5 },
            { id: 's-3', title: 'Node.js / NestJS', level: 4 },
            { id: 's-4', title: 'PostgreSQL', level: 4 },
            { id: 's-5', title: 'Docker', level: 3 },
          ],
        },
        {
          id: 'projects',
          type: CvSectionType.PROJECTS,
          title: 'Projets',
          visible: true,
          items: [
            {
              id: 'p-1',
              title: 'Kpèdo — plateforme logistique',
              description: 'Suivi de livraisons temps réel pour 12 PME béninoises.',
              tags: ['Angular', 'NestJS', 'PostgreSQL'],
            },
          ],
        },
        {
          id: 'languages',
          type: CvSectionType.LANGUAGES,
          title: 'Langues',
          visible: true,
          items: [
            { id: 'l-1', title: 'Français', subtitle: 'Langue maternelle' },
            { id: 'l-2', title: 'Anglais', subtitle: 'C1 — professionnel' },
          ],
        },
      ],
    },
    style: {
      accentColor: '#035c80',
      fontFamily: 'Inter Variable',
      fontScale: 1,
      headingCase: 'upper',
      showPhoto: false,
      density: 'normal',
    },
  });

  log(`Compte démo créé : ${DEMO_EMAIL} / ${DEMO_PASSWORD} (portfolio public : /p/awa-dossou)`);
}
