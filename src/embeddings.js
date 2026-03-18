// embeddings.js — Semantic search untuk chat history Freyana
// Pakai Gemini Embedding 001 (stable)

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { llmQueue } from './queue.js';

// Hitung path sendiri — hindari circular import dengan parser.js
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_DIR = path.resolve(__dirname, '..', 'workspace');

const EMBEDDING_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';
const MEMORY_DIR = path.join(WORKSPACE_DIR, 'memory');
const VECTOR_DIR = path.join(WORKSPACE_DIR, 'vectors');

// Generate embedding dari teks — lewat queue biar tidak spam
async function _generateEmbedding(text) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY tidak ditemukan');

    const truncated = text.slice(0, 2000);

    const response = await fetch(`${EMBEDDING_API}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'models/gemini-embedding-001',
            content: { parts: [{ text: truncated }] }
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(`Embedding error ${response.status}: ${err?.error?.message}`);
    }

    const data = await response.json();
    return data.embedding.values;
}

export async function generateEmbedding(text) {
    return llmQueue.add(() => _generateEmbedding(text));
}

// Hitung cosine similarity antara dua vector
function cosineSimilarity(vecA, vecB) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] ** 2;
        normB += vecB[i] ** 2;
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Simpan pesan + embedding ke .jsonl
export async function saveMessageWithEmbedding(role, text, timestamp, discordMessageId = null) {
    await fs.mkdir(VECTOR_DIR, { recursive: true });

    const today = getTodayDate();
    const vectorFile = path.join(VECTOR_DIR, `${today}.jsonl`);

    let embedding = null;
    try {
        embedding = await generateEmbedding(`${role}: ${text}`);
    } catch (e) {
        console.error('[Embedding] Gagal generate embedding:', e.message);
    }

    const entry = JSON.stringify({
        timestamp,
        role,
        text,
        discordMessageId,
        embedding
    });

    await fs.appendFile(vectorFile, entry + '\n', 'utf-8');
}

// Cari pesan paling relevan berdasarkan query
export async function searchRelevantHistory(query, topK = 5) {
    try {
        const queryEmbedding = await generateEmbedding(query);
        const today = getTodayDate();
        const vectorFile = path.join(VECTOR_DIR, `${today}.jsonl`);

        let content;
        try {
            content = await fs.readFile(vectorFile, 'utf-8');
        } catch {
            return '';
        }

        const entries = content
            .split('\n')
            .filter(Boolean)
            .map(line => {
                try { return JSON.parse(line); } catch { return null; }
            })
            .filter(e => e && e.embedding);

        if (entries.length === 0) return '';

        const scored = entries.map(entry => ({
            ...entry,
            score: cosineSimilarity(queryEmbedding, entry.embedding)
        }));

        const topRelevant = scored
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
      console.log(`[Semantic] Query: "${query.slice(0, 50)}" → Top match score: ${topRelevant[0]?.score?.toFixed(3)}`);

        topRelevant.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        return topRelevant
            .map(e => `**[${e.timestamp}] ${e.role}:** ${e.text}`)
            .join('\n');

    } catch (error) {
        console.error('[Embedding] Search error:', error.message);
        return '';
    }
}

// Fetch pesan spesifik berdasarkan Discord message ID
export async function findMessageById(discordMessageId) {
    try {
        const today = getTodayDate();
        const vectorFile = path.join(VECTOR_DIR, `${today}.jsonl`);

        let content;
        try {
            content = await fs.readFile(vectorFile, 'utf-8');
        } catch {
            return null;
        }

        const entries = content
            .split('\n')
            .filter(Boolean)
            .map(line => {
                try { return JSON.parse(line); } catch { return null; }
            })
            .filter(Boolean);

        return entries.find(e => e.discordMessageId === discordMessageId) || null;

    } catch {
        return null;
    }
}

function getTodayDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


