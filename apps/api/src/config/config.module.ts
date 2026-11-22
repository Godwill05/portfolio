import { Global, Module } from '@nestjs/common';
import { AppConfig } from './app-config';

/** Makes the typed AppConfig injectable everywhere (including TypeORM factory). */
@Global()
@Module({
  providers: [AppConfig],
  exports: [AppConfig],
})
export class ConfigAppModule {}
