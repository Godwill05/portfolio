import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { CvSectionType, CvStatus, CvTemplateCategory } from '../../common/constants/domain';
import { User } from './user.entity';

/**
 * A CV template is data-driven: it declares layout family, typography and
 * which renderer to use. 12 templates ship via seed; admins may add more.
 */
@Entity('cv_templates')
@Index('idx_cv_templates_key', ['key'], { unique: true })
export class CvTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 48 })
  key!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 320 })
  description!: string;

  @Column({ type: 'enum', enum: CvTemplateCategory })
  category!: CvTemplateCategory;

  /** Renderer family understood by both the Angular preview and the PDF engine. */
  @Column({ type: 'varchar', length: 40 })
  layout!: string;

  @Column({ type: 'boolean', default: true })
  atsFriendly!: boolean;

  @Column({ type: 'boolean', default: true })
  supportsSidebar!: boolean;

  @Column({ type: 'json' })
  defaults!: {
    accentColor: string;
    fontFamily: string;
    fontScale: number;
    headingCase: 'none' | 'upper';
    showPhoto: boolean;
    columns: 1 | 2;
    dividerStyle: 'line' | 'none' | 'dotted';
    sectionOrder: CvSectionType[];
  };

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', default: false })
  isPremium!: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}

/** Fully materialised CV content, decoupled from live profile data once saved. */
export interface CvDocument {
  header: {
    fullName: string;
    headline?: string;
    email?: string;
    phone?: string;
    location?: string;
    website?: string;
    linkedin?: string;
    github?: string;
    photoFileId?: string | null;
    extraLinks?: { label: string; url: string }[];
  };
  sections: CvSection[];
  footerNote?: string;
}

export interface CvSection {
  id: string;
  type: CvSectionType;
  title: string;
  visible: boolean;
  /** Type-specific, already-rendered content blocks. */
  items: CvSectionItem[];
  /** Free markdown for CUSTOM sections. */
  body?: string;
}

export interface CvSectionItem {
  id: string;
  title?: string;
  subtitle?: string;
  meta?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  bullets?: string[];
  tags?: string[];
  level?: number;
  url?: string;
}

@Entity('cvs')
@Index('idx_cvs_user_updated', ['userId', 'updatedAt'])
@Index('idx_cvs_user_status', ['userId', 'status'])
export class Cv {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  @Column({ type: 'varchar', length: 48 })
  templateKey!: string;

  @Column({ type: 'enum', enum: CvStatus, default: CvStatus.DRAFT })
  status!: CvStatus;

  @Column({ type: 'json' })
  document!: CvDocument;

  @Column({ type: 'json', nullable: true })
  style!: {
    accentColor?: string;
    fontFamily?: string;
    fontScale?: number;
    headingCase?: 'none' | 'upper';
    showPhoto?: boolean;
    sectionOrder?: CvSectionType[];
    density?: 'compact' | 'normal' | 'relaxed';
  } | null;

  /** Set when the CV was tailored to a saved job opportunity. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  opportunityId!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  targetRole!: string | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ type: 'int', default: 0 })
  downloadCount!: number;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastExportedAt!: Date | null;

  @Column({ type: 'boolean', default: false })
  aiAssisted!: boolean;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'datetime', precision: 6, nullable: true })
  deletedAt!: Date | null;
}
