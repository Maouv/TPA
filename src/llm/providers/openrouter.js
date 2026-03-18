// src/llm/providers/openrouter.js
import { openrouterQueue } from '../../queue.js';
import { getAvailableKeys } from '../registry.js';

const TIMEOUT_MS = 30000;
const MAX_OUTPUT_TOKENS = 1024;

async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeout);
        return response;
    } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') throw new Error('TIMEOUT');
        throw error;
    }
}

async function _call(systemPrompt, chatHistory, userMessage, modelId) {
    const keys = getAvailableKeys('openrouter');
    if (keys.length === 0) throw new Error('OPENROUTER_API_KEY tidak ditemukan');
    const apiKey = keys[0];

    const truncatedHistory = chatHistory.slice(-2000);
    const truncatedSystem = systemPrompt.slice(0, 3000);

    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://github.com/Maouv/TPA',
            'X-Title': 'TPA - Freyana'
        },
        body: JSON.stringify({
            model: modelId,
            messages: [
                { role: 'system', content: truncatedSystem },
                { role: 'user', content: `--- [LOG MEMORI HARI INI] ---\n${truncatedHistory}\n\nUser: ${userMessage}\nFreyana:` }
            ],
            max_tokens: MAX_OUTPUT_TOKENS,
            temperature: 0.7,
            stream: false
        })
    }, TIMEOUT_MS);

    if (!response.ok) {
        const err = await response.json();
        if (response.status === 429) throw new Error('RATE_LIMIT');
        throw new Error(`API error ${response.status}: ${err?.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || 'Respon kosong.';
    const totalTokens = data.usage?.total_tokens || Math.ceil(content.length / 4);
    console.log(`[OpenRouter:${modelId}] Tokens: ${totalTokens}`);
    return { content, totalTokens };
}

export async function call(systemPrompt, chatHistory, userMessage, modelId) {
    return openrouterQueue.add(() => _call(systemPrompt, chatHistory, userMessage, modelId));
}

