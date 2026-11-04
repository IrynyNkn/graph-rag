import { Module, type DynamicModule } from '@nestjs/common';
import { FileStore } from './file-store.js';
import { LocalFileStore } from './local-file-store.js';

export interface FileStoreOptions {
  directory: string;
}

@Module({})
export class FileStoreModule {
  static forRoot(options: FileStoreOptions): DynamicModule {
    return {
      module: FileStoreModule,
      providers: [{ provide: FileStore, useFactory: () => new LocalFileStore(options.directory) }],
      exports: [FileStore],
    };
  }
}
