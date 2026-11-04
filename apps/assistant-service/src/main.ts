import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppConfig } from './config.js';

const config = AppConfig.fromEnv(process.env);
const app = await NestFactory.create(AppModule.forRoot(config));
app.enableShutdownHooks();
await app.listen(config.port);
