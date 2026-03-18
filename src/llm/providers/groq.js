// src/llm/providers/groq.js
import { groqQueue } from '../../queue.js';
import { GROQ } from '../../config.js';
import { getAvailableKeys } from '../registry.js';

// Track rate limit per key
const keyStats = {};
let activeKeyIndex = 0;

function getKeys() {
    return getAvailableKeys('groq');
}

function getNextKey(keys) {
    for (let i = 0; i < keys.length; i++) {
        const idx = (activeKeyIndex + i) % keys.length;
        const key = keys[idx];
        const stats = keyStats[key];
        if (!stats || (stats.remainingRPD > 5 && stats.remainingTPM > 500)) {
            activeKeyIndex = idx;
            return key;
        }
    }
    return keys[activeKeyIndex % keys.length];
}

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
    const keys = getKeys();
    if (keys.length === 0) throw new Error('Tidak ada GROQ_API_KEY yang tersedia');

    const apiKey = getNextKey(keys);
    const model = modelId || GROQ.MODEL;

    const response = await fetchWithTimeout(GROQ.API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `--- [LOG MEMORI HARI INI] ---\n${chatHistory}\n\nUser: ${userMessage}\nFreyana:` }
            ],
            max_tokens: GROQ.MAX_TOKENS,
            temperature: 0.7,
            stream: false
        })
    }, GROQ.TIMEOUT_MS);

    const rpd = response.headers.get('x-ratelimit-remaining-requests');
    const tpm = response.headers.get('x-ratelimit-remaining-tokens');
    const resetReq = response.headers.get('x-ratelimit-reset-requests');
    const limitRpd = response.headers.get('x-ratelimit-limit-requests');
    const limitTpm = response.headers.get('x-ratelimit-limit-tokens');

    keyStats[apiKey] = {
        remainingRPD: rpd ? parseInt(rpd) : 1000,
        remainingTPM: tpm ? parseInt(tpm) : 30000,
        resetRequestsIn: resetReq || null,
    };

    console.log(`[Groq:key${keys.indexOf(apiKey) + 1}] RPD: ${keyStats[apiKey].remainingRPD}/${limitRpd || 1000} | TPM: ${keyStats[apiKey].remainingTPM}/${limitTpm || 10000}`);

    if (!response.ok) {
        const err = await response.json();
        if (response.status === 429) {
            if (keys.length > 1) {
                activeKeyIndex = (activeKeyIndex + 1) % keys.length;
                console.log(`[Groq] Key ${keys.indexOf(apiKey) + 1} rate limited → switch ke key ${activeKeyIndex + 1}`);
                throw new Error('RATE_LIMIT_RETRY');
            }
            throw new Error('RATE_LIMIT');
        }
        throw new Error(`API error ${response.status}: ${err?.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || 'Respon kosong.';
    const totalTokens = data.usage?.total_tokens || 0;
    console.log(`[Groq] Tokens — prompt: ${data.usage?.prompt_tokens} | completion: ${data.usage?.completion_tokens} | total: ${totalTokens}`);
    return { content, totalTokens };
}

export async function call(systemPrompt, chatHistory, userMessage, modelId) {
    return groqQueue.add(async () => {
        try {
            return await _call(systemPrompt, chatHistory, userMessage, modelId);
        } catch (error) {
            if (error.message === 'RATE_LIMIT_RETRY') {
                return await _call(systemPrompt, chatHistory, userMessage, modelId);
            }
            throw error;
        }
    });
}

export function isOverLimit() {
    const keys = getKeys();
    if (keys.length === 0) return true;
    return keys.every(key => {
        const stats = keyStats[key];
        return stats && (stats.remainingRPD <= 5 || stats.remainingTPM <= 500);
    });
}

export function getStats() {
    const keys = getKeys();
    return keys.map((key, idx) => ({
        keyIndex: idx + 1,
        ...(keyStats[key] || { remainingRPD: 1000, remainingTPM: 30000, resetRequestsIn: null })
    }));
}

