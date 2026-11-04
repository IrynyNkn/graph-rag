import { Module, type DynamicModule } from '@nestjs/common';
import { RelationalStore, type RelationalStoreOptions } from './relational-store.js';

@Module({})
export class RelationalStoreModule {
  static forRoot(options: RelationalStoreOptions): DynamicModule {
    return {
      module: RelationalStoreModule,
      providers: [{ provide: RelationalStore, useFactory: () => new RelationalStore(options) }],
      exports: [RelationalStore],
    };
  }
}
