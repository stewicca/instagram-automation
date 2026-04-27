import { db } from './db.js'
import { logger } from './logger.js'
import { env } from '../config/env.js'
import { Prisma } from '../generated/prisma/client.js'

export type KnowledgeCategory =
    | 'brand_voice'
    | 'product'
    | 'rejection_lesson'
    | 'performance_insight'

export interface KnowledgeChunk {
    content: string
    category: KnowledgeCategory
    metadata: Prisma.InputJsonValue
}

export interface RetrievedChunk extends KnowledgeChunk {
    id: string
    similarity: number
}

export async function embedText(text: string): Promise<number[]> {
    logger.debug({ model: env.OLLAMA_EMBED_MODEL }, '🔢 Embedding via Ollama')

    const response = await fetch(`${env.OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: env.OLLAMA_EMBED_MODEL,
            prompt: text,
        }),
    })

    if (!response.ok) {
        throw new Error(
            `Ollama embedding failed: ${response.status} ${response.statusText}`
        )
    }

    const data = await response.json() as { embedding: number[] }

    if (!data.embedding || data.embedding.length === 0) {
        throw new Error('Ollama returned empty embedding')
    }

    return data.embedding
}

export async function indexChunk(chunk: KnowledgeChunk): Promise<string> {
    const embedding = await embedText(chunk.content)
    const embeddingJson = JSON.stringify(embedding)
    const embeddingVector = `[${embedding.join(',')}]`

    const result = await db.brandKnowledgeChunk.create({
        data: {
            content: chunk.content,
            category: chunk.category,
            metadata: chunk.metadata,
            embedding: embeddingJson,
        },
    })

    await db.$executeRaw`
        UPDATE "BrandKnowledgeChunk"
        SET "embeddingVector" = ${embeddingVector}::vector
        WHERE id = ${result.id}
    `

    logger.info({ id: result.id, category: chunk.category }, '📚 Chunk indexed')
    return result.id
}

export async function indexChunks(chunks: KnowledgeChunk[]): Promise<void> {
    logger.info({ count: chunks.length }, '📚 Indexing chunks...')

    for (const chunk of chunks) {
        await indexChunk(chunk)
    }

    logger.info({ count: chunks.length }, '✅ All chunks indexed')
}

export async function retrieveRelevant(
    query: string,
    options: {
        topK?: number
        category?: KnowledgeCategory
        similarityThreshold?: number
    } = {}
): Promise<RetrievedChunk[]> {
    const { topK = 3, category, similarityThreshold = 0.7 } = options

    const queryEmbedding = await embedText(query)
    const queryVector = `[${queryEmbedding.join(',')}]`

    type RawResult = {
        id: string
        content: string
        category: string
        metadata: unknown
        similarity: number
    }

    const results = category
        ? await db.$queryRaw<RawResult[]>`
            SELECT
                id,
                content,
                category,
                metadata,
                1 - ("embeddingVector" <=> ${queryVector}::vector) AS similarity
            FROM "BrandKnowledgeChunk"
            WHERE
                "embeddingVector" IS NOT NULL
                AND category = ${category}
                AND 1 - ("embeddingVector" <=> ${queryVector}::vector) > ${similarityThreshold}
            ORDER BY "embeddingVector" <=> ${queryVector}::vector
            LIMIT ${topK}
        `
        : await db.$queryRaw<RawResult[]>`
            SELECT
                id,
                content,
                category,
                metadata,
                1 - ("embeddingVector" <=> ${queryVector}::vector) AS similarity
            FROM "BrandKnowledgeChunk"
            WHERE
                "embeddingVector" IS NOT NULL
                AND 1 - ("embeddingVector" <=> ${queryVector}::vector) > ${similarityThreshold}
            ORDER BY "embeddingVector" <=> ${queryVector}::vector
            LIMIT ${topK}
        `

    return results.map(r => ({
        id: r.id,
        content: r.content,
        category: r.category as KnowledgeCategory,
        metadata: r.metadata as Prisma.InputJsonValue,
        similarity: Number(r.similarity),
    }))
}
