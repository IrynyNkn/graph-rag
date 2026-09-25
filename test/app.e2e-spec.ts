import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module.js';

describe('AppModule (e2e)', () => {
  it('compiles the dependency graph', async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleFixture).toBeDefined();
    await moduleFixture.close();
  });
});
