import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  CvTemplateCategory,
  EducationKind,
  ExperienceType,
  PortfolioVisibility,
  ProjectStatus,
  SkillLevel,
} from '../../common/constants/domain';
import { User } from './user.entity';
import { FileAsset } from './platform.entity';

@Entity('professional_profiles')
@Index('idx_profiles_slug', ['slug'], { unique: true })
export class ProfessionalProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @OneToOne(() => User, (u) => u.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  // ── Identity ──────────────────────────────────────────────
  @Column({ type: 'varchar', length: 120 })
  displayName!: string;

  @Column({ type: 'varchar', length: 180, nullable: true })
  headline!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  professionalTitle!: string | null;

  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  @Column({ type: 'text', nullable: true })
  bio!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  location!: string | null;

  @Column({ type: 'varchar', length: 2, default: 'BJ' })
  countryCode!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  publicEmail!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  websiteUrl!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  linkedinUrl!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  githubUrl!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  twitterUrl!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  dribbbleUrl!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  gitlabUrl!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stackoverflowUrl!: string | null;

  @Column({ type: 'json', nullable: true })
  extraLinks!: { label: string; url: string }[] | null;

  // ── Public portfolio ─────────────────────────────────────
  @Column({ type: 'varchar', length: 80 })
  slug!: string;

  @Column({ type: 'enum', enum: PortfolioVisibility, default: PortfolioVisibility.PRIVATE })
  visibility!: PortfolioVisibility;

  @Column({ type: 'boolean', default: true })
  showEmail!: boolean;

  @Column({ type: 'boolean', default: true })
  showPhone!: boolean;

  @Column({ type: 'boolean', default: true })
  showProjects!: boolean;

  @Column({ type: 'boolean', default: true })
  showExperience!: boolean;

  @Column({ type: 'boolean', default: true })
  showEducation!: boolean;

  @Column({ type: 'boolean', default: true })
  showSkills!: boolean;

  @Column({ type: 'boolean', default: true })
  showCvDownload!: boolean;

  @Column({ type: 'boolean', default: true })
  contactEnabled!: boolean;

  @Column({ type: 'boolean', default: true })
  indexable!: boolean;

  @Column({ type: 'varchar', length: 180, nullable: true })
  metaTitle!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  metaDescription!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  coverFileId!: string | null;

  @ManyToOne(() => FileAsset, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'coverFileId' })
  coverFile?: FileAsset | null;

  /** Theme accent for the public portfolio, independent of platform branding. */
  @Column({ type: 'varchar', length: 9, nullable: true })
  accentColor!: string | null;

  /** Template id used to render the public portfolio. */
  @Column({ type: 'varchar', length: 40, default: 'atlas' })
  portfolioTemplate!: string;

  @Column({ type: 'int', default: 0 })
  profileViews!: number;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @OneToMany(() => Skill, (s) => s.profile)
  skills?: Skill[];

  @OneToMany(() => Project, (p) => p.profile)
  projects?: Project[];

  @OneToMany(() => Experience, (e) => e.profile)
  experiences?: Experience[];

  @OneToMany(() => Education, (e) => e.profile)
  educations?: Education[];

  @OneToMany(() => Language_, (l) => l.profile)
  languages?: Language_[];
}

@Entity('skills')
@Index('idx_skills_profile', ['profileId'])
@Index('idx_skills_name', ['profileId', 'name'], { unique: true })
export class Skill {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  profileId!: string;

  @ManyToOne(() => ProfessionalProfile, (p) => p.skills, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profileId' })
  profile?: ProfessionalProfile;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 80, default: 'Général' })
  category!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'enum', enum: SkillLevel, default: SkillLevel.INTERMEDIATE })
  level!: SkillLevel;

  @Column({ type: 'tinyint', unsigned: true, default: 3 })
  rating!: number;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', default: false })
  featured!: boolean;

  @Column({ type: 'boolean', default: true })
  visible!: boolean;

  @Column({ type: 'int', default: 0 })
  yearsOfExperience!: number;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}

@Entity('projects')
@Index('idx_projects_profile', ['profileId'])
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  profileId!: string;

  @ManyToOne(() => ProfessionalProfile, (p) => p.projects, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profileId' })
  profile?: ProfessionalProfile;

  @Column({ type: 'varchar', length: 180 })
  title!: string;

  @Column({ type: 'varchar', length: 220, nullable: true })
  subtitle!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', nullable: true })
  problem!: string | null;

  @Column({ type: 'text', nullable: true })
  solution!: string | null;

  @Column({ type: 'text', nullable: true })
  outcome!: string | null;

  @Column({ type: 'json', nullable: true })
  technologies!: string[] | null;

  @Column({ type: 'json', nullable: true })
  imageFileIds!: string[] | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  demoUrl!: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  repositoryUrl!: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  videoUrl!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  category!: string | null;

  @Column({ type: 'enum', enum: ProjectStatus, default: ProjectStatus.COMPLETED })
  status!: ProjectStatus;

  @Column({ type: 'date', nullable: true })
  startDate!: string | null;

  @Column({ type: 'date', nullable: true })
  endDate!: string | null;

  @Column({ type: 'boolean', default: false })
  isHighlighted!: boolean;

  @Column({ type: 'boolean', default: true })
  visible!: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'json', nullable: true })
  metrics!: { label: string; value: string }[] | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @OneToMany(() => ProjectSkill, (ps) => ps.project, { cascade: ['insert', 'update'] })
  projectSkills?: ProjectSkill[];
}

@Entity('project_skills')
@Index('idx_project_skills', ['projectId', 'skillId'], { unique: true })
export class ProjectSkill {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  projectId!: string;

  @ManyToOne(() => Project, (p) => p.projectSkills, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project?: Project;

  @Column({ type: 'varchar', length: 36 })
  skillId!: string;

  @ManyToOne(() => Skill, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skillId' })
  skill?: Skill;
}

@Entity('experiences')
@Index('idx_experiences_profile', ['profileId'])
export class Experience {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  profileId!: string;

  @ManyToOne(() => ProfessionalProfile, (p) => p.experiences, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profileId' })
  profile?: ProfessionalProfile;

  @Column({ type: 'varchar', length: 180 })
  role!: string;

  @Column({ type: 'varchar', length: 180 })
  company!: string;

  @Column({ type: 'varchar', length: 180, nullable: true })
  companyUrl!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  location!: string | null;

  @Column({ type: 'enum', enum: ExperienceType, default: ExperienceType.FULL_TIME })
  type!: ExperienceType;

  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date', nullable: true })
  endDate!: string | null;

  @Column({ type: 'boolean', default: false })
  isCurrent!: boolean;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'json', nullable: true })
  achievements!: string[] | null;

  @Column({ type: 'json', nullable: true })
  technologies!: string[] | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  logoFileId!: string | null;

  @Column({ type: 'boolean', default: true })
  visible!: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @OneToMany(() => ExperienceSkill, (es) => es.experience)
  experienceSkills?: ExperienceSkill[];
}

@Entity('experience_skills')
@Index('idx_experience_skills', ['experienceId', 'skillId'], { unique: true })
export class ExperienceSkill {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  experienceId!: string;

  @ManyToOne(() => Experience, (e) => e.experienceSkills, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'experienceId' })
  experience?: Experience;

  @Column({ type: 'varchar', length: 36 })
  skillId!: string;

  @ManyToOne(() => Skill, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skillId' })
  skill?: Skill;
}

@Entity('educations')
@Index('idx_educations_profile', ['profileId'])
export class Education {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  profileId!: string;

  @ManyToOne(() => ProfessionalProfile, (p) => p.educations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profileId' })
  profile?: ProfessionalProfile;

  @Column({ type: 'enum', enum: EducationKind, default: EducationKind.DEGREE })
  kind!: EducationKind;

  @Column({ type: 'varchar', length: 200, nullable: true })
  degree!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  title!: string | null;

  @Column({ type: 'varchar', length: 220 })
  institution!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  location!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  fieldOfStudy!: string | null;

  @Column({ type: 'date', nullable: true })
  startDate!: string | null;

  @Column({ type: 'date', nullable: true })
  endDate!: string | null;

  @Column({ type: 'boolean', default: false })
  isCurrent!: boolean;

  @Column({ type: 'varchar', length: 120, nullable: true })
  grade!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  credentialUrl!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  credentialId!: string | null;

  @Column({ type: 'boolean', default: true })
  visible!: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}

@Entity('profile_languages')
@Index('idx_profile_languages', ['profileId'])
export class Language_ {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  profileId!: string;

  @ManyToOne(() => ProfessionalProfile, (p) => p.languages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profileId' })
  profile?: ProfessionalProfile;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  /** e.g. A1..C2 or "Native" */
  @Column({ type: 'varchar', length: 40, default: 'B2' })
  proficiency!: string;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;
}

/** A published-portfolio daily view counter, kept aggregate to stay privacy-friendly. */
@Entity('portfolio_daily_views')
@Index('idx_portfolio_views_unique', ['profileId', 'day'], { unique: true })
export class PortfolioDailyView {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  profileId!: string;

  @Column({ type: 'date' })
  day!: string;

  @Column({ type: 'int', default: 0 })
  views!: number;
}

/** Admin-authored portfolio template metadata (beyond the built-in renderers). */
@Entity('portfolio_templates')
export class PortfolioTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  key!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 400, nullable: true })
  description!: string | null;

  @Column({ type: 'enum', enum: CvTemplateCategory, default: CvTemplateCategory.MODERN })
  category!: CvTemplateCategory;

  @Column({ type: 'varchar', length: 9, default: '#035c80' })
  accentColor!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;
}
