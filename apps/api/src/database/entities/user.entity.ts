import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { AccountStatus, NotificationType, UserRole } from '../../common/constants/domain';
import { FileAsset } from './platform.entity';

@Entity('users')
@Index('idx_users_email', ['email'], { unique: true })
@Index('idx_users_role_status', ['role', 'status'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  /** Argon2id hash. Never selected by default. */
  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 100 })
  firstName!: string;

  @Column({ type: 'varchar', length: 100 })
  lastName!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role!: UserRole;

  @Column({ type: 'enum', enum: AccountStatus, default: AccountStatus.ACTIVE })
  status!: AccountStatus;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ type: 'varchar', length: 80, default: 'fr' })
  locale!: string;

  @Column({ type: 'varchar', length: 170, nullable: true })
  timezone!: string | null;

  /** 'light' | 'dark' | 'system' — mirrors the design-system theme preference. */
  @Column({ type: 'varchar', length: 16, default: 'system' })
  themePreference!: 'light' | 'dark' | 'system';

  @Column({ type: 'boolean', default: true })
  emailNotifications!: boolean;

  @Column({ type: 'varchar', length: 36, nullable: true })
  avatarFileId!: string | null;

  @ManyToOne(() => FileAsset, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'avatarFileId' })
  avatar?: FileAsset | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastLoginAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  failedLoginAttempts!: number;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lockedUntil!: Date | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  lastLoginIp!: string | null;

  /** Admin-only free-form note (support context). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  internalNote!: string | null;

  /** When true, the user must change password at next login. */
  @Column({ type: 'boolean', default: false })
  mustResetPassword!: boolean;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'datetime', precision: 6, nullable: true })
  deletedAt!: Date | null;

  @OneToOne(() => ProfessionalProfileLazy, (p: any) => p.user)
  profile?: any;
}

// Late-bound import to avoid a circular module graph at decorator-eval time.
import { ProfessionalProfile as ProfessionalProfileLazy } from './profile.entity';

@Entity('user_sessions')
@Index('idx_sessions_user', ['userId'])
@Index('idx_sessions_token', ['tokenHash'], { unique: true })
@Index('idx_sessions_family', ['familyId'])
export class UserSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  /** SHA-256 of the refresh token — the raw token is never stored. */
  @Column({ type: 'char', length: 64 })
  tokenHash!: string;

  /** Rotation family: revoking a family kills every descendant token. */
  @Column({ type: 'varchar', length: 36 })
  familyId!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  deviceLabel!: string | null;

  @Column({ type: 'datetime', precision: 6 })
  expiresAt!: Date;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastUsedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}

export enum EmailTokenType {
  VERIFY_EMAIL = 'verify_email',
  RESET_PASSWORD = 'reset_password',
  CHANGE_EMAIL = 'change_email',
}

@Entity('email_tokens')
@Index('idx_email_tokens_hash', ['tokenHash'], { unique: true })
@Index('idx_email_tokens_user', ['userId'])
export class EmailToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'char', length: 64 })
  tokenHash!: string;

  @Column({ type: 'enum', enum: EmailTokenType })
  type!: EmailTokenType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  payload!: string | null;

  @Column({ type: 'datetime', precision: 6 })
  expiresAt!: Date;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}

@Entity('notifications')
@Index('idx_notifications_user_read', ['userId', 'isRead'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'enum', enum: NotificationType })
  type!: NotificationType;

  @Column({ type: 'varchar', length: 180 })
  title!: string;

  @Column({ type: 'varchar', length: 600 })
  body!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  link!: string | null;

  @Column({ type: 'boolean', default: false })
  isRead!: boolean;

  @Column({ type: 'json', nullable: true })
  meta!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}
