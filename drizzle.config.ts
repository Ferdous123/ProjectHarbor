import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './data/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/projectharbor.db',
  },
  verbose: true,
  strict: true,
});
