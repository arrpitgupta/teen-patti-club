// Starts one in-memory MongoDB for the whole test run. Tests never touch the real database.
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer | undefined;

interface ProvideContext {
  provide(key: 'mongoUri', value: string): void;
}

export async function setup(ctx: ProvideContext): Promise<void> {
  // Make sure nothing can accidentally pick up a real connection string.
  delete process.env.MONGODB_URI;
  mongod = await MongoMemoryServer.create();
  ctx.provide('mongoUri', mongod.getUri());
}

export async function teardown(): Promise<void> {
  await mongod?.stop();
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
