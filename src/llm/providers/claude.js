// src/llm/providers/claude.js — second brain only, dipanggil via <ASK_CLAUDE>
import { claudeQueue } from '../../queue.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_INPUT_CHARS = 2000;
const MAX_OUTPUT_TOKENS = 512;

async function _askAsSecondBrain(question, context = '') {
    if (!process.env.ANTHROPIC_API_KEY) {
        return '⚠️ [CLAUDE_ERROR] ANTHROPIC_API_KEY tidak ditemukan.';
    }

    let userMessage = context
        ? `[KONTEKS]:\n${context}\n\n[PERTANYAAN]:\n${question}`
        : question;

    if (userMessage.length > MAX_INPUT_CHARS) {
        userMessage = userMessage.slice(0, MAX_INPUT_CHARS) + '\n...[DIPOTONG]...';
    }

    try {
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
                system: 'Kamu adalah asisten teknis. Jawab singkat, padat, langsung ke solusi.',
                messages: [{ role: 'user', content: userMessage }]
            })
        });

        if (!response.ok) {
            const err = await response.json();
            return `⚠️ [CLAUDE_ERROR] API error ${response.status}: ${err?.error?.message || 'Unknown'}`;
        }

        const data = await response.json();
        return data.content?.[0]?.text || '⚠️ [CLAUDE_ERROR] Respon kosong.';
    } catch (error) {
        return `⚠️ [CLAUDE_ERROR] Network error: ${error.message}`;
    }
}

export async function askAsSecondBrain(question, context = '') {
    return claudeQueue.add(() => _askAsSecondBrain(question, context));
}

