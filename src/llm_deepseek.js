// llm_deepseek.js — DeepSeek v3 via Nvidia NIM sebagai second brain untuk Freyana
// HANYA dipanggil jika Dafana eksplisit minta via <ASK_DEEPSEEK>

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MAX_INPUT_CHARS = 2000;
const MAX_OUTPUT_TOKENS = 1024;
const MIN_INTERVAL_MS = 5000; // 5 detik antar request

let lastCallTime = 0;

const DEEPSEEK_SYSTEM_PROMPT = `Kamu adalah asisten teknis untuk Freyana, sebuah AI agent yang berjalan di atas Gemini.
Freyana akan mengirim pertanyaan teknis, kode, atau masalah workflow kepadamu.
Jawab dengan singkat, padat, dan langsung ke solusi. Tidak perlu basa-basi.
Output kamu akan langsung dibaca dan dieksekusi oleh Freyana.`;

export async function askDeepSeek(question, context = '') {
    if (!process.env.NVIDIA_API_KEY) {
        return '⚠️ [DEEPSEEK_ERROR] NVIDIA_API_KEY tidak ditemukan di environment.';
    }

    // Rate limit check
    const now = Date.now();
    const elapsed = now - lastCallTime;
    if (lastCallTime !== 0 && elapsed < MIN_INTERVAL_MS) {
        const wait = Math.ceil((MIN_INTERVAL_MS - elapsed) / 1000);
        return `⚠️ [DEEPSEEK_ERROR] Rate limit lokal: tunggu ${wait} detik lagi.`;
    }

    // Truncate input
    let userMessage = context
        ? `[KONTEKS]:\n${context}\n\n[PERTANYAAN]:\n${question}`
        : question;

    if (userMessage.length > MAX_INPUT_CHARS) {
        userMessage = userMessage.slice(0, MAX_INPUT_CHARS) + '\n...[DIPOTONG]...';
    }

    try {
        lastCallTime = Date.now();

        const response = await fetch(NVIDIA_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-ai/deepseek-v3.2',
                messages: [
                    { role: 'system', content: DEEPSEEK_SYSTEM_PROMPT },
                    { role: 'user', content: userMessage }
                ],
                temperature: 1,
                top_p: 0.95,
                max_tokens: MAX_OUTPUT_TOKENS,
                stream: false
            })
        });

        if (!response.ok) {
            const err = await response.json();
            return `⚠️ [DEEPSEEK_ERROR] API error ${response.status}: ${err?.message || 'Unknown error'}`;
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || '⚠️ [DEEPSEEK_ERROR] Respon kosong dari DeepSeek.';

    } catch (error) {
        return `⚠️ [DEEPSEEK_ERROR] Network error: ${error.message}`;
    }
}

