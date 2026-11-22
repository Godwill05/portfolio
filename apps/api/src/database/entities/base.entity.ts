import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** UUID primary key + audit timestamps for every aggregate root. */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}

/** Adds soft-delete semantics (`deletedAt`). */
export abstract class SoftDeletableEntity extends BaseEntity {
  @DeleteDateColumn({ type: 'datetime', precision: 6, nullable: true })
  deletedAt!: Date | null;
}
