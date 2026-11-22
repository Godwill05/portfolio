import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnv } from './config/env.validation';
import { AppConfig } from './config/app-config';
import { ConfigAppModule } from './config/config.module';
import { buildDataSourceOptions } from './database/data-source';
import { JwtAuthGuard, PermissionsGuard, RolesGuard } from './common/guards';
import { MaintenanceGuard } from './common/guards/maintenance.guard';
import { MailModule } from './modules/mail/mail.module';
import { AuditModule } from './modules/audit/audit.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProfileModule } from './modules/profile/profile.module';
import { CvModule } from './modules/cv/cv.module';
import { AiModule } from './modules/ai/ai.module';
import { AdminModule } from './modules/admin/admin.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HealthController } from './modules/health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
      expandVariables: false,
    }),
    ConfigAppModule,
    TypeOrmModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        ...buildDataSourceOptions({
          host: config.db.host,
          port: config.db.port,
          username: config.db.username,
          password: config.db.password,
          database: config.db.database,
          logging: config.db.logging ? ['error', 'warn', 'migration'] : ['error'],
        }),
        autoLoadEntities: true,
        retryAttempts: 10,
        retryDelay: 3000,
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => [
        { name: 'default', ttl: config.throttle.ttl * 1000, limit: config.throttle.limit },
      ],
    }),
    ScheduleModule.forRoot(),
    MailModule,
    AuditModule,
    SettingsModule,
    AuthModule,
    ProfileModule,
    CvModule,
    AiModule,
    AdminModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: MaintenanceGuard },
  ],
})
export class AppModule {}
