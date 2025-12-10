#!/usr/bin/env node

import { queueAdapter } from '../database/index.js';
import { config } from '../config/index.js';

async function runMigrations(): Promise<void> {
  console.log('Running database migrations...');
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Database: ${config.databaseUrl.replace(/:[^:@]+@/, ':***@')}`);

  try {
    await queueAdapter.migrate();
    console.log('Migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
