// llm_groq.js — Groq sebagai primary brain untuk Freyana
// Model: meta-llama/llama-4-scout-17b-16e-instruct
// Format: OpenAI compatible

import { nvidiaQueue } from './queue.js';
import { GROQ } from './config.js';

const GROQ_API_URL = GROQ.API_URL;
const GROQ_MODEL   = GROQ.MODEL;
const MAX_OUTPUT_TOKENS = GROQ.MAX_TOKENS;
const TIMEOUT_MS   = GROQ.TIMEOUT_MS;

// Track rate limit dari response headers
let remainingRPD = 1000;
let remainingTPM = 30000;
let resetRequestsIn = null; // e.g. "2m59.56s"

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

async function _callGroq(systemPrompt, chatHistory, userMessage) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY tidak ditemukan');

    const response = await fetchWithTimeout(GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `--- [LOG MEMORI HARI INI] ---\n${chatHistory}\n\nDafana: ${userMessage}\nFreyana:` }
            ],
            max_tokens: MAX_OUTPUT_TOKENS,
            temperature: 0.7,
            stream: false
        })
    }, TIMEOUT_MS);

    // Update rate limit dari headers
    const rpd = response.headers.get('x-ratelimit-remaining-requests');
    const tpm = response.headers.get('x-ratelimit-remaining-tokens');
    const limitRpd = response.headers.get('x-ratelimit-limit-requests');
    const limitTpm = response.headers.get('x-ratelimit-limit-tokens');
    const resetReq = response.headers.get('x-ratelimit-reset-requests');
    if (rpd) remainingRPD = parseInt(rpd);
    if (tpm) remainingTPM = parseInt(tpm);
    if (resetReq) resetRequestsIn = resetReq;
    console.log(`[Groq] RPD: ${remainingRPD}/${limitRpd || 1000} remaining | TPM: ${remainingTPM}/${limitTpm || 30000} remaining | Reset in: ${resetRequestsIn}`);

    if (!response.ok) {
        const err = await response.json();
        const errStr = JSON.stringify(err).toLowerCase();
        if (response.status === 429) throw new Error('RATE_LIMIT');
        throw new Error(`API error ${response.status}: ${err?.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || 'Respon kosong.';
    const totalTokens = data.usage?.total_tokens || 0;
    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    console.log(`[Groq] Tokens — prompt: ${promptTokens} | completion: ${completionTokens} | total: ${totalTokens}`);
    return { content, totalTokens };
}

export function isGroqOverLimit() {
    return remainingRPD <= 5 || remainingTPM <= 500;
}

export function getGroqStats() {
    return { remainingRPD, remainingTPM, resetRequestsIn };
}

export async function generateResponseGroq(systemPrompt, chatHistory, userMessage) {
    return nvidiaQueue.add(() => _callGroq(systemPrompt, chatHistory, userMessage));
}

// Unwrap content + tokens dari result _callGroq
export async function callGroqWithTokens(systemPrompt, chatHistory, userMessage) {
    return nvidiaQueue.add(() => _callGroq(systemPrompt, chatHistory, userMessage));
}


