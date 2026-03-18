// src/config.js — single source of truth untuk semua konstanta dan env vars
// Semua nilai hardcoded dari seluruh codebase dipusatkan di sini

import 'dotenv/config';

// ============================================================
// DISCORD
// ============================================================
export const DISCORD = {
    BOT_TOKEN:    process.env.DISCORD_BOT_TOKEN,
    CHANNEL_ID:   process.env.DISCORD_CHANNEL_ID,
    CHUNK_SIZE:   1900,   // max chars per Discord message
    CONFIRM_TIMEOUT_MS: 30000, // timeout Y/N confirmation
    ALLOWED_BOT_IDS: (process.env.ALLOWED_BOT_IDS || '1472994726847451177').split(',').map(s => s.trim()),
};

// ============================================================
// LLM — GROQ
// ============================================================
export const GROQ = {
    API_URL:        'https://api.groq.com/openai/v1/chat/completions',
    MODEL:          process.env.GROQ_MODEL || 'moonshotai/kimi-k2-instruct',
    MAX_TOKENS:     1024,
    TIMEOUT_MS:     30000,
    TEMPERATURE:    0.7,
};

// ============================================================
// LLM — GEMINI
// ============================================================
export const GEMINI = {
    MODEL:          process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    COOLDOWN_MS:    5 * 60 * 1000,  // 5 menit setelah rate limit
    MAX_RETRIES:    2,
    RETRY_DELAY_MS: 2000,
    EMBEDDING_MODEL: 'models/gemini-embedding-001',
};

// ============================================================
// LLM — NVIDIA (DeepSeek & Qwen)
// ============================================================
export const NVIDIA = {
    API_URL:            'https://integrate.api.nvidia.com/v1/chat/completions',
    DEEPSEEK_MODEL:     process.env.DEEPSEEK_MODEL || 'deepseek-ai/deepseek-v3.2',
    QWEN_MODEL:         process.env.QWEN_MODEL     || 'qwen/qwen3.5-122b-a10b',
    MAX_INPUT_CHARS:    4000,
    MAX_OUTPUT_TOKENS:  1024,
    DEEPSEEK_TIMEOUT_MS: 30000,
    QWEN_TIMEOUT_MS:     30000,
    TEMPERATURE:        0.6,
    TOP_P:              0.95,
};

// ============================================================
// TOKEN BUDGET (Gemini free tier)
// ============================================================
export const TOKEN_BUDGET = {
    CHARS_PER_TOKEN:  4,
    WINDOW_MS:        60 * 1000,
    RPM_LIMIT:        10,
    INPUT_LIMIT:      10000,
    SAFETY_FACTOR:    0.8,   // pakai 80% dari limit
};

// ============================================================
// PARSER & MEMORY
// ============================================================
export const PARSER = {
    MAX_CONTEXT_CHARS: 12000,
    CACHE_TTL_MS:      5 * 60 * 1000,
    RECENT_LINES:      10,   // jumlah baris history terbaru yang diload
    SEMANTIC_TOP_K:    5,    // jumlah hasil semantic search
};

// ============================================================
// SKILLS
// ============================================================
export const SKILLS = {
    TERMINAL: {
        MAX_OUTPUT_CHARS: 3000,
        BLACKLIST: ['rm -rf', 'mkfs', 'chmod 777', 'dd', 'su', 'sudo'],
        SCAN_BLACKLIST: ['find /', 'find ~', 'ls -la /', 'ls -R /', 'cat /etc', 'cat /proc'],
    },
    BROWSER: {
        MAX_WEB_CHARS: 4000,
        TIMEOUT_MS:    15000,
    },
    FILEMANAGER: {
        WRITE_PREVIEW_CHARS: 50,
    },
};

// ============================================================
// QUEUE
// ============================================================
export const QUEUE = {
    GEMINI_DELAY_MS: 500,
    NVIDIA_DELAY_MS: 500,
};

// ============================================================
// STARTUP VALIDATION
// ============================================================
export function validateConfig() {
    const required = [
        'DISCORD_BOT_TOKEN',
        'DISCORD_CHANNEL_ID',
        'GEMINI_API_KEY',
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
        process.exit(1);
    }

    // Warn kalau optional keys tidak ada
    const optional = ['GROQ_API_KEY', 'NVIDIA_API_KEY_DEEPSEEK', 'NVIDIA_API_KEY_QWEN', 'ANTHROPIC_API_KEY'];
    const missingOptional = optional.filter(key => !process.env[key]);
    if (missingOptional.length > 0) {
        console.warn(`⚠️  Optional env vars tidak ditemukan (fallback terbatas): ${missingOptional.join(', ')}`);
    }

    console.log('✅ Config validated.');
}

