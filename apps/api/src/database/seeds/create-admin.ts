/**
 * Creates (or promotes) a super administrator.
 *
 *   npm run create:admin -- --email=you@example.com
 *
 * Password resolution order:
 *   1. --password=… argument
 *   2. ADMIN_PASSWORD env var
 *   3. generated (printed once)
 */
import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../data-source';
import { User } from '../entities/user.entity';
import { ProfessionalProfile } from '../entities/profile.entity';
import { AccountStatus, UserRole } from '../../common/constants/domain';
import { slugify } from '../../common/utils/slug.util';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const email = (arg('email') ?? process.env['ADMIN_EMAIL'] ?? '').toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Email invalide. Usage : npm run create:admin -- --email=admin@example.com');
  }
  const name = arg('name') ?? process.env['ADMIN_NAME'] ?? 'Platform Administrator';
  let password = arg('password') ?? process.env['ADMIN_PASSWORD'];
  let generated = false;
  if (!password) {
    password = randomBytes(12).toString('base64url');
    generated = true;
  }
  if (password.length < 10) {
    throw new Error('Le mot de passe doit contenir au moins 10 caractères.');
  }

  const ds = await new DataSource(buildDataSourceOptions()).initialize();
  try {
    const users = ds.getRepository(User);
    const profiles = ds.getRepository(ProfessionalProfile);
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    let user = await users.findOne({ where: { email }, withDeleted: true });
    if (user) {
      await users.update(user.id, {
        role: UserRole.SUPER_ADMIN,
        status: AccountStatus.ACTIVE,
        passwordHash,
        emailVerifiedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
      console.log(`✔ Compte existant mis à jour et promu : ${email}`);
    } else {
      const [firstName, ...rest] = name.split(' ');
      user = await users.save(
        users.create({
          email,
          passwordHash,
          firstName: firstName ?? 'Admin',
          lastName: rest.join(' ') || 'FolioForge',
          role: UserRole.SUPER_ADMIN,
          status: AccountStatus.ACTIVE,
          emailVerifiedAt: new Date(),
        }),
      );
      console.log(`✔ Super administrateur créé : ${email}`);
    }

    if (!(await profiles.exists({ where: { userId: user.id } }))) {
      await profiles.insert({
        userId: user.id,
        displayName: name,
        slug: slugify(name) || `admin-${user.id.slice(0, 8)}`,
      });
    }

    if (generated) {
      console.log('────────────────────────────────────────────────────────');
      console.log(` MOT DE PASSE GÉNÉRÉ : ${password}`);
      console.log('────────────────────────────────────────────────────────');
    }
  } finally {
    await ds.destroy();
  }
}

main().catch((error) => {
  console.error('❌', (error as Error).message);
  process.exit(1);
});
