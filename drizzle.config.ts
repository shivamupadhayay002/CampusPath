import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // Where your table definitions live (the file imported by src/db/index.ts)
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    // Your Neon connection string from .env
    url: process.env.DATABASE_URL!,
  },
});