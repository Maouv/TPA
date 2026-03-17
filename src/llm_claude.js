// llm_claude.js — Claude sebagai second brain untuk Freyana
// HANYA dipanggil jika Dafana eksplisit meminta via <ASK_CLAUDE>

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_INPUT_CHARS = 2000;  // Batas konteks yang dikirim ke Claude
const MAX_OUTPUT_TOKENS = 512; // Batas output Claude
const MIN_INTERVAL_MS = 15000; // Minimal 15 detik antar request (free tier: 5 req/menit)

let lastCallTime = 0;

const CLAUDE_SYSTEM_PROMPT = `Kamu adalah asisten teknis untuk Freyana, sebuah AI agent yang berjalan di atas Gemini.
Freyana akan mengirim pertanyaan teknis, kode, atau masalah workflow kepadamu.
Jawab dengan singkat, padat, dan langsung ke solusi. Tidak perlu basa-basi.
Output kamu akan langsung dibaca dan dieksekusi oleh Freyana.`;

export async function askClaude(question, context = '') {
    if (!process.env.ANTHROPIC_API_KEY) {
        return '⚠️ [CLAUDE_ERROR] ANTHROPIC_API_KEY tidak ditemukan di environment.';
    }

    // Rate limit check
    const now = Date.now();
    const elapsed = now - lastCallTime;
    if (lastCallTime !== 0 && elapsed < MIN_INTERVAL_MS) {
        const wait = Math.ceil((MIN_INTERVAL_MS - elapsed) / 1000);
        return `⚠️ [CLAUDE_ERROR] Rate limit lokal: tunggu ${wait} detik lagi sebelum tanya Claude.`;
    }

    // Truncate input kalau terlalu panjang
    let userMessage = context
        ? `[KONTEKS]:\n${context}\n\n[PERTANYAAN]:\n${question}`
        : question;

    if (userMessage.length > MAX_INPUT_CHARS) {
        userMessage = userMessage.slice(0, MAX_INPUT_CHARS) + '\n...[DIPOTONG]...';
    }

    try {
        lastCallTime = Date.now();

        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: MAX_OUTPUT_TOKENS,
                system: CLAUDE_SYSTEM_PROMPT,
                messages: [
                    { role: 'user', content: userMessage }
                ]
            })
        });

        if (!response.ok) {
            const err = await response.json();
            return `⚠️ [CLAUDE_ERROR] API error ${response.status}: ${err?.error?.message || 'Unknown error'}`;
        }

        const data = await response.json();
        return data.content?.[0]?.text || '⚠️ [CLAUDE_ERROR] Respon kosong dari Claude.';

    } catch (error) {
        return `⚠️ [CLAUDE_ERROR] Network error: ${error.message}`;
    }
}

