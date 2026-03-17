import fs from 'fs/promises';
import path from 'path';
import { saveMessageWithEmbedding, searchRelevantHistory } from './embeddings.js';

const WORKSPACE_DIR = path.resolve('workspace');
const MEMORY_DIR = path.join(WORKSPACE_DIR, 'memory');
const MAX_CONTEXT_CHARS = 12000;
const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedPrompt = null;
let cacheTimestamp = 0;

const FILE_DIRECTIVES = {
    'SOUL.md': 'Berikut adalah SOUL.md — ini adalah IDENTITAS dan PERSONA-mu. Kamu WAJIB mewujudkan karakter ini sepenuhnya dalam setiap responmu. Ini bukan pilihan.',
    'AGENTS.md': 'Berikut adalah AGENTS.md — ini adalah ATURAN MUTLAK yang WAJIB kamu ikuti tanpa pengecualian. Pelanggaran aturan ini tidak diizinkan.',
    'USER.md': 'Berikut adalah USER.md — ini adalah informasi tentang Dafana, orang yang sedang berinteraksi denganmu. Gunakan ini untuk memahami konteks dan menyesuaikan responmu.',
    'TOOLS.md': 'Berikut adalah TOOLS.md — ini adalah daftar tools dan kemampuan yang tersedia untukmu. Gunakan sesuai kebutuhan.',
};

const SKILL_DIRECTIVES = {
    'TERMINAL': 'Berikut adalah dokumentasi SKILL TERMINAL — ini menjelaskan cara menggunakan tag <RUN_BASH> untuk eksekusi perintah terminal.',
    'BROWSER': 'Berikut adalah dokumentasi SKILL BROWSER — ini menjelaskan cara menggunakan tag <FETCH_URL> untuk mengambil konten dari web.',
    'FILEMANAGER': 'Berikut adalah dokumentasi SKILL FILEMANAGER — ini menjelaskan cara menggunakan tag <READ_FILE> dan <WRITE_FILE> untuk operasi file.',
};

export async function getSystemPrompt(forceRefresh = false, query = null) {
    const now = Date.now();

    if (!forceRefresh && cachedPrompt && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return cachedPrompt;
    }

    let prompt = 'Kamu adalah Freyana, sebuah AI agent. Baca dan ikuti semua instruksi di bawah ini dengan seksama:\n\n';

    const files = ['SOUL.md', 'AGENTS.md', 'USER.md', 'TOOLS.md'];
    for (const file of files) {
        try {
            const content = await fs.readFile(path.join(WORKSPACE_DIR, file), 'utf-8');
            const directive = FILE_DIRECTIVES[file] || `Berikut adalah ${file}:`;
            prompt += `${directive}\n--- [BEGIN ${file}] ---\n${content}\n--- [END ${file}] ---\n\n`;
        } catch (e) {}
    }

    const skills = [
        { name: 'TERMINAL', path: 'src/skills/terminal/SKILL.md' },
        { name: 'BROWSER', path: 'src/skills/browser/SKILL.md' },
        { name: 'FILEMANAGER', path: 'src/skills/filemanager/SKILL.md' },
    ];

    // Lazy load skill — hanya load yang relevan berdasarkan query
    const queryLower = (query || '').toLowerCase();
    const loadAll = !query;
    const skillKeywords = {
        'TERMINAL': ['bash', 'terminal', 'command', 'run', 'execute', 'jalanin', 'install', 'npm', 'node', 'git', 'ls', 'cd', 'script'],
        'BROWSER': ['fetch', 'url', 'website', 'web', 'http', 'browse', 'buka', 'scrape'],
        'FILEMANAGER': ['file', 'baca', 'tulis', 'read', 'write', 'folder', 'direktori', 'save', 'simpan'],
    };

    for (const skill of skills) {
        const keywords = skillKeywords[skill.name] || [];
        const isRelevant = loadAll || keywords.some(k => queryLower.includes(k));
        if (!isRelevant) continue;
        try {
            const content = await fs.readFile(path.resolve(skill.path), 'utf-8');
            const directive = SKILL_DIRECTIVES[skill.name] || `Berikut adalah SKILL ${skill.name}:`;
            prompt += `${directive}\n--- [BEGIN SKILL: ${skill.name}] ---\n${content}\n--- [END SKILL: ${skill.name}] ---\n\n`;
        } catch (e) {}
    }
    prompt += 'Sekarang kamu siap. Respond sebagai Freyana sesuai persona dan aturan di atas.';

    if (prompt.length > MAX_CONTEXT_CHARS) {
        prompt = prompt.slice(0, MAX_CONTEXT_CHARS) + '\n...[DIPOTONG]...';
    }

    cachedPrompt = prompt;
    cacheTimestamp = now;
    return prompt;
}

export function invalidatePromptCache() {
    cachedPrompt = null;
    cacheTimestamp = 0;
}

function getTodayDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Baca history — kombinasi semantic search + 5 terbaru
export async function readChatHistory(query = null) {
    const file = path.join(MEMORY_DIR, `${getTodayDate()}.md`);

    // Selalu ambil 5 baris terbaru untuk recency
    let recentHistory = '';
    try {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n').filter(Boolean);
        recentHistory = lines.slice(-10).join('\n');
    } catch (e) {}

    // Kalau ada query, tambah semantic search
    if (query) {
        try {
            const relevantHistory = await searchRelevantHistory(query, 5);
            if (relevantHistory) {
                return `--- [KONTEKS RELEVAN] ---\n${relevantHistory}\n\n--- [PERCAKAPAN TERBARU] ---\n${recentHistory}`;
            }
        } catch (e) {
            console.error('[Parser] Semantic search gagal:', e.message);
        }
    }

    return recentHistory;
}

// Tulis history + simpan embedding
export async function writeChatHistory(role, text, discordMessageId = null) {
    await fs.mkdir(MEMORY_DIR, { recursive: true }).catch(() => ({}));

    const file = path.join(MEMORY_DIR, `${getTodayDate()}.md`);
    const time = new Date().toLocaleTimeString('id-ID');
    const timestamp = new Date().toISOString();
    const logEntry = `\n**[${time}] ${role}:**\n${text}\n`;

    await fs.appendFile(file, logEntry, 'utf-8');

    // Simpan embedding di background — tidak block response
    saveMessageWithEmbedding(role, text, timestamp, discordMessageId).catch(e =>
        console.error('[Parser] Embedding save error:', e.message)
    );
}

