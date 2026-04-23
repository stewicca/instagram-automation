import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        setupFiles: ['./tests/setup.ts'],
        env: {
            LOG_LEVEL: 'silent',
            NODE_ENV: 'test',
            DATABASE_URL_TEST: 'postgresql://postgres:postgres@localhost:5432/instagram_automation_test',
            INSTAGRAM_ACCESS_TOKEN: 'test-token',
            INSTAGRAM_BUSINESS_ACCOUNT_ID: '123456',
            ANTHROPIC_API_KEY: 'sk-ant-test',
            DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/instagram_automation_test',
        },
    },
})
