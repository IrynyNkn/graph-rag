import type { TestProject } from 'vitest/node';
import { startTestStores, type TestStores } from './containers.js';

declare module 'vitest' {
  export interface ProvidedContext {
    stores: TestStores;
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const { stores, stop } = await startTestStores();
  project.provide('stores', stores);
  return stop;
}
