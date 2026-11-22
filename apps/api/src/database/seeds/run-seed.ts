/**
 * Reproducible, idempotent seeding.
 *
 *   npm run seed          → settings, CV templates, admin account, demo admin
 *   npm run seed:demo     → also creates a demo user with realistic content
 *
 * Never writes real API keys. The admin password comes from ADMIN_PASSWORD
 * (or a generated one printed once in the console in production).
 */
import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../data-source';
import { User, UserSession, EmailToken } from '../entities/user.entity';
import { ProfessionalProfile } from '../entities/profile.entity';
import { Setting } from '../entities/platform.entity';
import { AccountStatus, SettingKey, UserRole } from '../../common/constants/domain';
import { DEFAULT_SETTINGS, type AllSettings } from '../../modules/settings/settings.defaults';
import { seedCvTemplates } from './cv-templates.seed';
import { seedDemoUser } from './demo.seed';

const log = (message: string) => console.log(`  ${message}`);

async function seedSettings(ds: DataSource): Promise<number> {
  const repo = ds.getRepository(Setting);
  let count = 0;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AllSettings)[]) {
    const existing = await repo.findOne({ where: { key } });
    if (!existing) {
      await repo.insert({
        key,
        value: DEFAULT_SETTINGS[key] as unknown as Record<string, unknown>,
        description: `Groupe de paramètres « ${key} »`,
      });
      count += 1;
    }
  }
  return count;
}

async function seedAdmin(ds: DataSource): Promise<void> {
  const users = ds.getRepository(User);
  const email = (process.env['ADMIN_EMAIL'] ?? 'admin@folioforge.local').toLowerCase();
  const existing = await users.findOne({ where: { email }, withDeleted: true });

  if (existing) {
    // Never silently reset a password that an operator already set.
    if (existing.role !== UserRole.SUPER_ADMIN) {
      await users.update(existing.id, { role: UserRole.SUPER_ADMIN });
      log(`Compte ${email} promu super administrateur.`);
    } else {
      log(`Compte administrateur déjà présent : ${email}`);
    }
    await ensureProfile(ds, existing.id, 'Administrateur Plateforme');
    return;
  }

  let password = process.env['ADMIN_PASSWORD'];
  let generated = false;
  if (!password) {
    password = randomBytes(12).toString('base64url');
    generated = true;
  }
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const admin = await users.save(
    users.create({
      email,
      passwordHash,
      firstName: (process.env['ADMIN_NAME'] ?? 'Platform Administrator').split(' ')[0] ?? 'Admin',
      lastName:
        (process.env['ADMIN_NAME'] ?? 'Platform Administrator').split(' ').slice(1).join(' ') ||
        'FolioForge',
      role: UserRole.SUPER_ADMIN,
      status: AccountStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    }),
  );
  await ensureProfile(ds, admin.id, 'Administrateur Plateforme');

  log(`Compte super administrateur créé : ${email}`);
  if (generated) {
    log('────────────────────────────────────────────────────────');
    log(` MOT DE PASSE GÉNÉRÉ (affiché une seule fois) : ${password}`);
    log(' Définissez ADMIN_PASSWORD pour éviter cette étape.');
    log('────────────────────────────────────────────────────────');
  }
}

async function ensureProfile(ds: DataSource, userId: string, displayName: string): Promise<void> {
  const profiles = ds.getRepository(ProfessionalProfile);
  if (await profiles.exists({ where: { userId } })) return;
  await profiles.insert({
    userId,
    displayName,
    slug: `admin-${userId.slice(0, 8)}`,
  });
}

async function main(): Promise<void> {
  const withDemo = process.argv.includes('--demo');
  console.log('\n▶ FolioForge — seed de la base de données\n');

  const ds = await new DataSource(buildDataSourceOptions()).initialize();
  try {
    const settingsCount = await seedSettings(ds);
    log(`Paramètres créés : ${settingsCount}`);

    const templates = await seedCvTemplates(ds);
    log(`Modèles de CV synchronisés : ${templates}`);

    await seedAdmin(ds);

    if (withDemo) {
      await seedDemoUser(ds, log);
    }

    // Safety net: never leave expired sessions lying around.
    const cleaned = await ds
      .getRepository(UserSession)
      .createQueryBuilder()
      .delete()
      .where('expiresAt < NOW()')
      .execute();
    log(`Sessions expirées nettoyées : ${cleaned.affected ?? 0}`);

    const tokens = await ds.getRepository(EmailToken).count();
    log(`Jetons email en attente : ${tokens}`);

    console.log('\n✅ Seed terminé.\n');
  } finally {
    await ds.destroy();
  }
}

main().catch((error) => {
  console.error('\n❌ Seed échoué :', (error as Error).message);
  console.error((error as Error).stack);
  process.exit(1);
});
