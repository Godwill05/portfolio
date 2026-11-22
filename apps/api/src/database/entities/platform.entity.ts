import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  AiFeature,
  AiMessageRole,
  AiProviderKind,
  AiTaskType,
  FilePurpose,
  QuotaLedgerReason,
  QuotaPeriod,
  UserRole,
} from '../../common/constants/domain';
import { User } from './user.entity';

// ───────────────────────────── Files ─────────────────────────────

@Entity('file_assets')
@Index('idx_files_owner', ['ownerId'])
@Index('idx_files_storage_key', ['storageKey'], { unique: true })
export class FileAsset {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  ownerId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner?: User | null;

  @Column({ type: 'enum', enum: FilePurpose })
  purpose!: FilePurpose;

  @Column({ type: 'varchar', length: 255 })
  originalName!: string;

  @Column({ type: 'varchar', length: 255 })
  storageKey!: string;

  @Column({ type: 'varchar', length: 30 })
  driver!: string;

  @Column({ type: 'varchar', length: 120 })
  mimeType!: string;

  @Column({ type: 'bigint', unsigned: true })
  size!: number;

  @Column({ type: 'char', length: 64 })
  checksum!: string;

  @Column({ type: 'int', nullable: true })
  width!: number | null;

  @Column({ type: 'int', nullable: true })
  height!: number | null;

  /** Detached files are garbage-collected after a grace period. */
  @Column({ type: 'boolean', default: false })
  orphaned!: boolean;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}

// ─────────────────────────── Settings ────────────────────────────

@Entity('settings')
@Index('idx_settings_key', ['key'], { unique: true })
export class Setting {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  key!: string;

  @Column({ type: 'json' })
  value!: unknown;

  @Column({ type: 'varchar', length: 400, nullable: true })
  description!: string | null;

  @Column({ type: 'boolean', default: false })
  isSecret!: boolean;

  @Column({ type: 'varchar', length: 36, nullable: true })
  updatedById!: string | null;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}

// ────────────────────────── AI providers ─────────────────────────

@Entity('ai_providers')
@Index('idx_ai_providers_slug', ['slug'], { unique: true })
export class AiProvider {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 60 })
  slug!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'enum', enum: AiProviderKind })
  kind!: AiProviderKind;

  /** Optional override (self-hosted, proxies, regional endpoints). */
  @Column({ type: 'varchar', length: 400, nullable: true })
  baseUrl!: string | null;

  /** AES-256-GCM ciphertext. Never returned to any client. */
  @Column({ type: 'text', nullable: true, select: false })
  apiKeyEncrypted!: string | null;

  /** Non-secret hint of the configured key, e.g. `sk-…a91f`. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  apiKeyHint!: string | null;

  @Column({ type: 'json', nullable: true })
  extraHeaders!: Record<string, string> | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ type: 'int', default: 0 })
  priority!: number;

  @Column({ type: 'int', default: 60000 })
  timeoutMs!: number;

  @Column({ type: 'int', default: 2 })
  maxRetries!: number;

  @Column({ type: 'int', default: 0 })
  requestsPerMinute!: number;

  @Column({ type: 'int', default: 0 })
  dailyRequestLimit!: number;

  @Column({ type: 'int', default: 0 })
  monthlyBudgetCents!: number;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastHealthCheckAt!: Date | null;

  @Column({ type: 'boolean', nullable: true })
  lastHealthCheckOk!: boolean | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  lastHealthCheckMessage!: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}

@Entity('ai_models')
@Index('idx_ai_models_provider', ['providerId'])
@Index('idx_ai_models_ref', ['providerId', 'modelId'], { unique: true })
export class AiModel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  providerId!: string;

  @ManyToOne(() => AiProvider, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'providerId' })
  provider?: AiProvider;

  /** Provider-native identifier, e.g. `gpt-4.1-mini`. */
  @Column({ type: 'varchar', length: 160 })
  modelId!: string;

  @Column({ type: 'varchar', length: 160 })
  displayName!: string;

  @Column({ type: 'varchar', length: 400, nullable: true })
  description!: string | null;

  @Column({ type: 'int', default: 8192 })
  contextWindow!: number;

  @Column({ type: 'int', default: 4096 })
  maxOutputTokens!: number;

  /** USD cents per 1M input tokens — admin-editable, drives cost estimates. */
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  inputPricePerMTok!: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  outputPricePerMTok!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ type: 'json', nullable: true })
  capabilities!: string[] | null;

  @Column({ type: 'json', nullable: true })
  params!: Record<string, unknown> | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}

/** Admin mapping of semantic routing slots onto concrete models. */
@Entity('ai_task_routes')
@Index('idx_ai_routes_task', ['task'], { unique: true })
export class AiTaskRoute {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: AiTaskType })
  task!: AiTaskType;

  @Column({ type: 'varchar', length: 36, nullable: true })
  primaryModelId!: string | null;

  @ManyToOne(() => AiModel, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'primaryModelId' })
  primaryModel?: AiModel | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  fallbackModelId!: string | null;

  @ManyToOne(() => AiModel, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'fallbackModelId' })
  fallbackModel?: AiModel | null;

  @Column({ type: 'decimal', precision: 4, scale: 2, default: 0.7 })
  temperature!: string;

  @Column({ type: 'int', default: 0 })
  maxOutputTokens!: number;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}

@Entity('ai_conversations')
@Index('idx_ai_conv_user_updated', ['userId', 'updatedAt'])
export class AiConversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'enum', enum: AiFeature, default: AiFeature.CHAT })
  feature!: AiFeature;

  @Column({ type: 'varchar', length: 36, nullable: true })
  modelId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  opportunityId!: string | null;

  @Column({ type: 'boolean', default: false })
  pinned!: boolean;

  @Column({ type: 'int', default: 0 })
  messageCount!: number;

  @Column({ type: 'int', default: 0 })
  totalTokens!: number;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}

@Entity('ai_messages')
@Index('idx_ai_msg_conversation', ['conversationId', 'createdAt'])
export class AiMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  conversationId!: string;

  @ManyToOne(() => AiConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation?: AiConversation;

  @Column({ type: 'enum', enum: AiMessageRole })
  role!: AiMessageRole;

  @Column({ type: 'longtext' })
  content!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  modelId!: string | null;

  @Column({ type: 'int', default: 0 })
  promptTokens!: number;

  @Column({ type: 'int', default: 0 })
  completionTokens!: number;

  @Column({ type: 'int', default: 0 })
  latencyMs!: number;

  @Column({ type: 'json', nullable: true })
  meta!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}

/** One row per AI request — the backbone of usage, cost and abuse analytics. */
@Entity('ai_usage_logs')
@Index('idx_ai_usage_user_created', ['userId', 'createdAt'])
@Index('idx_ai_usage_created', ['createdAt'])
@Index('idx_ai_usage_feature', ['feature', 'createdAt'])
export class AiUsageLog {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  userId!: string | null;

  @Column({ type: 'enum', enum: AiFeature })
  feature!: AiFeature;

  @Column({ type: 'varchar', length: 36, nullable: true })
  providerId!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  modelRef!: string | null;

  @Column({ type: 'int', default: 0 })
  promptTokens!: number;

  @Column({ type: 'int', default: 0 })
  completionTokens!: number;

  @Column({ type: 'int', default: 0 })
  latencyMs!: number;

  @Column({ type: 'decimal', precision: 12, scale: 6, default: 0 })
  estimatedCostUsd!: string;

  @Column({ type: 'boolean', default: true })
  success!: boolean;

  @Column({ type: 'varchar', length: 60, nullable: true })
  errorCode!: string | null;

  @Column({ type: 'boolean', default: false })
  countedAgainstQuota!: boolean;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}

// ──────────────────────────── Quotas ─────────────────────────────

@Entity('quota_policies')
@Index('idx_quota_policy_scope', ['scope', 'role', 'feature'], { unique: true })
export class QuotaPolicy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 'global' | 'role' | 'user' */
  @Column({ type: 'varchar', length: 20, default: 'global' })
  scope!: 'global' | 'role' | 'user';

  @Column({ type: 'enum', enum: UserRole, nullable: true })
  role!: UserRole | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  userId!: string | null;

  /** '*' applies to every quota-consuming feature. */
  @Column({ type: 'varchar', length: 40, default: '*' })
  feature!: string;

  @Column({ type: 'int', default: 3 })
  limit!: number;

  @Column({ type: 'enum', enum: QuotaPeriod, default: QuotaPeriod.DAILY })
  period!: QuotaPeriod;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}

@Entity('quota_ledger')
@Index('idx_quota_ledger_user_day', ['userId', 'feature', 'day'])
export class QuotaLedger {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @Column({ type: 'varchar', length: 40 })
  feature!: string;

  /** Day bucket (UTC) used for daily period accounting. */
  @Column({ type: 'date' })
  day!: string;

  @Column({ type: 'enum', enum: QuotaLedgerReason })
  reason!: QuotaLedgerReason;

  @Column({ type: 'int', default: 1 })
  delta!: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}

// ─────────────────────────── Contacts ────────────────────────────

@Entity('contact_messages')
@Index('idx_contact_profile_created', ['profileId', 'createdAt'])
@Index('idx_contact_ip_created', ['senderIp', 'createdAt'])
export class ContactMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  profileId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profileId' })
  owner?: User;

  @Column({ type: 'varchar', length: 120 })
  senderName!: string;

  @Column({ type: 'varchar', length: 255 })
  senderEmail!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  subject!: string | null;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'varchar', length: 20, default: 'new' })
  status!: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  senderIp!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'boolean', default: false })
  isSpam!: boolean;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  readAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  replyBody!: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  repliedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}

@Entity('job_opportunities')
@Index('idx_opportunities_user', ['userId', 'status'])
export class JobOpportunity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  company!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  location!: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  sourceUrl!: string | null;

  @Column({ type: 'longtext', nullable: true })
  rawText!: string | null;

  @Column({ type: 'varchar', length: 40, default: 'saved' })
  status!: string;

  @Column({ type: 'json', nullable: true })
  analysis!: {
    summary?: string;
    requiredSkills?: string[];
    matchScore?: number;
    strengths?: string[];
    gaps?: string[];
    recommendations?: string[];
    keywords?: string[];
    interviewQuestions?: string[];
  } | null;

  @Column({ type: 'int', nullable: true })
  matchScore!: number | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  analyzedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}

// ─────────────────────────── Billing ─────────────────────────────

@Entity('transactions')
@Index('idx_tx_provider_ref', ['provider', 'providerRef'], { unique: true })
@Index('idx_tx_user_created', ['userId', 'createdAt'])
@Index('idx_tx_status', ['status'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user?: User | null;

  @Column({ type: 'varchar', length: 20 })
  provider!: string;

  @Column({ type: 'varchar', length: 120 })
  providerRef!: string;

  @Column({ type: 'varchar', length: 30 })
  kind!: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: string;

  @Column({ type: 'int', unsigned: true })
  amountMinor!: number;

  @Column({ type: 'char', length: 3, default: 'XOF' })
  currency!: string;

  @Column({ type: 'int', default: 0 })
  creditsGranted!: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  donorName!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  donorEmail!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  message!: string | null;

  @Column({ type: 'json', nullable: true })
  rawPayload!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  failureReason!: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  paidAt!: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}

/** Idempotency guard for webhook deliveries. */
@Entity('processed_webhooks')
@Index('idx_webhook_key', ['provider', 'eventId'], { unique: true })
export class ProcessedWebhook {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  provider!: string;

  @Column({ type: 'varchar', length: 160 })
  eventId!: string;

  @Column({ type: 'varchar', length: 60 })
  eventType!: string;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}

// ────────────────────────── Audit trail ──────────────────────────

@Entity('audit_logs')
@Index('idx_audit_actor_created', ['actorId', 'createdAt'])
@Index('idx_audit_action', ['action', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  actorId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  actorEmail!: string | null;

  @Column({ type: 'varchar', length: 80 })
  action!: string;

  @Column({ type: 'varchar', length: 60 })
  entity!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  entityId!: string | null;

  @Column({ type: 'json', nullable: true })
  changes!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}

// ─────────────────────── Reward ads (anti-abuse) ─────────────────

@Entity('rewarded_ad_claims')
@Index('idx_ad_claim_token', ['token'], { unique: true })
@Index('idx_ad_claim_user_day', ['userId', 'day'])
export class RewardedAdClaim {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @Column({ type: 'char', length: 64 })
  token!: string;

  @Column({ type: 'date' })
  day!: string;

  @Column({ type: 'int', default: 0 })
  creditsGranted!: number;

  @Column({ type: 'varchar', length: 60, default: 'pending' })
  status!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  providerSignature!: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  verifiedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}
