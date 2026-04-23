import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const databaseUrl = process.env['NODE_ENV'] === 'test'
    ? process.env['DATABASE_URL_TEST']
    : process.env['DATABASE_URL']

if (!databaseUrl) {
    throw new Error('Database URL is not set')
}

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        url: databaseUrl,
    },
})
