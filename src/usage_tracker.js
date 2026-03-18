// src/usage_tracker.js
// Track request count + token usage per model, simpan ke workspace/usage.json
// Reset otomatis tiap hari baru

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getGroqStats } from './llm_groq.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USAGE_FILE = path.resolve(__dirname, '..', 'workspace', 'usage.json');

const MODELS = ['groq', 'gemini', 'qwen', 'deepseek', 'claude'];

function getTodayDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyDay(date) {
    const data = { date, models: {} };
    for (const m of MODELS) {
        data.models[m] = { requests: 0, tokens: 0 };
    }
    return data;
}

async function loadUsage() {
    try {
        const raw = await fs.readFile(USAGE_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return emptyDay(getTodayDate());
    }
}

async function saveUsage(data) {
    await fs.mkdir(path.dirname(USAGE_FILE), { recursive: true });
    await fs.writeFile(USAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Panggil ini setiap kali model berhasil return response
export async function trackUsage(model, tokens = 0) {
    const today = getTodayDate();
    let data = await loadUsage();

    // Reset kalau hari baru
    if (data.date !== today) {
        data = emptyDay(today);
    }

    const key = model.toLowerCase();
    if (!data.models[key]) {
        data.models[key] = { requests: 0, tokens: 0 };
    }

    data.models[key].requests += 1;
    data.models[key].tokens   += tokens;

    await saveUsage(data);
}


export async function getUsageSummary() {
    const today = getTodayDate();
    let data = await loadUsage();

    const lines = [`📊 **Usage ${today}**`];
    lines.push(`━━━━━━━━━━━━━━━━━━`);

    // Groq RPD sisa — hanya tampil kalau sudah ada request (headers tersedia)
    try {
        const { remainingRPD } = getGroqStats();
        if (remainingRPD < 1000) {
            lines.push(`🟢 **Groq RPD sisa** ${remainingRPD} req`);
            lines.push(`━━━━━━━━━━━━━━━━━━`);
        }
    } catch { /* skip */ }

    if (data.date !== today) {
        lines.push(`Belum ada request hari ini.`);
        return lines.join('\n');
    }

    let totalReq = 0;
    let totalTok = 0;
    let hasData = false;

    for (const [model, stat] of Object.entries(data.models)) {
        if (stat.requests === 0) continue;
        hasData = true;
        const emoji = { groq: '⚡', gemini: '✨', qwen: '🧬', deepseek: '🧠', claude: '🤖' }[model] || '•';
        lines.push(`${emoji} **${model.toUpperCase()}** ${stat.requests} req · ${stat.tokens.toLocaleString()} tok`);
        totalReq += stat.requests;
        totalTok += stat.tokens;
    }

    if (!hasData) {
        lines.push(`Belum ada request hari ini.`);
    } else {
        lines.push(`━━━━━━━━━━━━━━━━━━`);
        lines.push(`📦 **${totalReq} req** · 🔢 **TPD ${totalTok.toLocaleString()} tok**`);
    }

    return lines.join('\n');
}

