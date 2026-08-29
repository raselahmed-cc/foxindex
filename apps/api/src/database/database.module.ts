import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDbClient } from '@foxindex/database';

export const DATABASE_CLIENT = Symbol('DATABASE_CLIENT');
export const DATABASE = Symbol('DATABASE');

type DbClient = ReturnType<typeof createDbClient>;

/**
 * Global so every feature module can @Inject(DATABASE) without re-importing
 * this module. A single pg Pool is created once (DATABASE_CLIENT) and the
 * plain drizzle handle (DATABASE) is derived from it via DI, not a second
 * createDbClient() call — otherwise we'd open two pools by accident.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): DbClient =>
        createDbClient({ connectionString: config.getOrThrow<string>('DATABASE_URL') }),
    },
    {
      provide: DATABASE,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DbClient) => client.db,
    },
  ],
  exports: [DATABASE, DATABASE_CLIENT],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(DATABASE_CLIENT) private readonly client: DbClient) {}

  async onModuleDestroy(): Promise<void> {
    await this.client.pool.end();
  }
}
