import { Module, type DynamicModule } from '@nestjs/common';
import { GraphStore, type GraphStoreOptions } from './graph-store.js';

@Module({})
export class GraphStoreModule {
  static forRoot(options: GraphStoreOptions): DynamicModule {
    return {
      module: GraphStoreModule,
      providers: [{ provide: GraphStore, useFactory: () => new GraphStore(options) }],
      exports: [GraphStore],
    };
  }
}
