import 'dotenv/config'
import { z } from 'zod'

const EnvSchema = z.object({
    // Instagram / Meta
    INSTAGRAM_ACCESS_TOKEN: z.string().min(1),
    INSTAGRAM_BUSINESS_ACCOUNT_ID: z.string().min(1),

    // AI Model switching
    USE_LOCAL_LLM: z.string().transform(v => v === 'true').default(false),
    ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),
    CLAUDE_MODELS: z.enum([
        'claude-opus-4-6',
        'claude-sonnet-4-6',
        'claude-haiku-4-5-20251001',
    ]).default('claude-sonnet-4-6'),
    OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434/api'),
    OLLAMA_MODEL: z.string().default('llama3.2'),

    // Database
    DATABASE_URL: z.string().url(),

    // Redis
    REDIS_URL: z.string().url().default('redis://localhost:6379'),

    // App
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),

    // Telegram Bot - Optional - required only in production
    TELEGRAM_BOT_TOKEN: z.string().optional(),
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
    console.error('❌ Invalid environment variables:')
    console.error(parsed.error.flatten().fieldErrors)
    process.exit(1)
}

export const env = parsed.data
