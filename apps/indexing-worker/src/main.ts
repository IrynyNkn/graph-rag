import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppConfig } from './config.js';

const config = AppConfig.fromEnv(process.env);
const app = await NestFactory.createApplicationContext(AppModule.forRoot(config));
app.enableShutdownHooks();
