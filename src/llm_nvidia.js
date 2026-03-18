// llm_nvidia.js — Nvidia NIM sebagai fallback brain untuk Freyana
// Model 1: DeepSeek V3.2 (NVIDIA_API_KEY_DEEPSEEK)
// Model 2: Qwen3.5 122B A10B (NVIDIA_API_KEY_QWEN)

import { nvidiaQueue } from './queue.js';
import { NVIDIA } from './config.js';

const NVIDIA_API_URL     = NVIDIA.API_URL;
const MAX_INPUT_CHARS    = NVIDIA.MAX_INPUT_CHARS;
const MAX_OUTPUT_TOKENS  = NVIDIA.MAX_OUTPUT_TOKENS;
const DEEPSEEK_TIMEOUT_MS = NVIDIA.DEEPSEEK_TIMEOUT_MS;
const QWEN_TIMEOUT_MS    = NVIDIA.QWEN_TIMEOUT_MS;

const SYSTEM_PROMPT = `Kamu ADALAH Freyana. Jawab langsung sebagai Freyana dengan gaya galak, pedas, sarkas, to-the-point. Pakai Lo/Gw. Jangan sebut nama model kamu. Jangan gunakan tag apapun seperti <ASK_DEEPSEEK>, <ASK_QWEN>, atau tag lainnya dalam responmu. Langsung jawab pertanyaan user.`;

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

async function callNvidia(question, context, model, apiKey, timeoutMs) {
    let userMessage = context
        ? `[KONTEKS]:\n${context}\n\n[PERTANYAAN]:\n${question}`
        : question;

    if (userMessage.length > MAX_INPUT_CHARS) {
        userMessage = userMessage.slice(0, MAX_INPUT_CHARS) + '\n...[DIPOTONG]...';
    }

    console.log(`[Debug] Calling model: ${model}`);

    const response = await fetchWithTimeout(NVIDIA_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.6,
            top_p: 0.95,
            max_tokens: MAX_OUTPUT_TOKENS,
            stream: false
        })
    }, timeoutMs);

    console.log(`[Debug] Response status: ${response.status}`);

    if (!response.ok) {
        const err = await response.json();
        console.log(`[Debug] API error:`, JSON.stringify(err));
        throw new Error(`API error ${response.status}: ${err?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || 'Respon kosong.';
    console.log(`[Debug] Response content length: ${content.length}`);
    return content;
}

async function _callNvidiaAsFallback(userMessage, freyanaSystemPrompt, chatHistory, model, apiKey, timeoutMs) {
    const truncatedHistory = chatHistory.slice(-2000);
    const truncatedSystem = freyanaSystemPrompt.slice(0, 3000);

    console.log(`[Debug] Fallback calling model: ${model}`);
    console.log(`[Debug] API key exists: ${!!apiKey}`);

    const response = await fetchWithTimeout(NVIDIA_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: truncatedSystem },
                { role: 'user', content: `--- [LOG MEMORI HARI INI] ---\n${truncatedHistory}\n\nDafana: ${userMessage}\nFreyana:` }
            ],
            temperature: 0.6,
            top_p: 0.95,
            max_tokens: MAX_OUTPUT_TOKENS,
            stream: false
        })
    }, timeoutMs);

    console.log(`[Debug] Fallback response status: ${response.status}`);

    if (!response.ok) {
        const err = await response.json();
        console.log(`[Debug] Fallback API error:`, JSON.stringify(err));
        throw new Error(`API error ${response.status}: ${err?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || 'Respon kosong.';
    console.log(`[Debug] Fallback content length: ${content.length}`);
    return content;
}

// DeepSeek V3.2
async function _askDeepSeek(question, context = '') {
    const apiKey = process.env.NVIDIA_API_KEY_DEEPSEEK;
    if (!apiKey) return '⚠️ [DEEPSEEK_ERROR] NVIDIA_API_KEY_DEEPSEEK tidak ditemukan.';
    try {
        return await callNvidia(question, context, NVIDIA.DEEPSEEK_MODEL, apiKey, DEEPSEEK_TIMEOUT_MS);
    } catch (error) {
        console.log(`[Debug] DeepSeek error: ${error.name} — ${error.message}`);
        if (error.message === 'TIMEOUT') return '⚠️ [DEEPSEEK_ERROR] Timeout 30s — DeepSeek tidak respond.';
        return `⚠️ [DEEPSEEK_ERROR] ${error.message}`;
    }
}

export async function askDeepSeek(question, context = '') {
    return nvidiaQueue.add(() => _askDeepSeek(question, context));
}

// Qwen3.5 122B
async function _askQwen(question, context = '') {
    const apiKey = process.env.NVIDIA_API_KEY_QWEN;
    if (!apiKey) return '⚠️ [QWEN_ERROR] NVIDIA_API_KEY_QWEN tidak ditemukan.';
    try {
        return await callNvidia(question, context, NVIDIA.QWEN_MODEL, apiKey, QWEN_TIMEOUT_MS);
    } catch (error) {
        console.log(`[Debug] Qwen error: ${error.name} — ${error.message}`);
        if (error.message === 'TIMEOUT') return '⚠️ [QWEN_ERROR] Timeout 15s — Qwen tidak respond.';
        return `⚠️ [QWEN_ERROR] ${error.message}`;
    }
}

export async function askQwen(question, context = '') {
    return nvidiaQueue.add(() => _askQwen(question, context));
}

export async function askDeepSeekAsFallback(userMessage, systemPrompt, chatHistory) {
    const apiKey = process.env.NVIDIA_API_KEY_DEEPSEEK;
    if (!apiKey) return '⚠️ [DEEPSEEK_ERROR] NVIDIA_API_KEY_DEEPSEEK tidak ditemukan.';
    return nvidiaQueue.add(async () => {
        try {
            return await _callNvidiaAsFallback(userMessage, systemPrompt, chatHistory, NVIDIA.DEEPSEEK_MODEL, apiKey, DEEPSEEK_TIMEOUT_MS);
        } catch (error) {
            console.log(`[Debug] DeepSeek fallback error: ${error.name} — ${error.message}`);
            if (error.message === 'TIMEOUT') return '⚠️ [DEEPSEEK_ERROR] Timeout 30s.';
            return `⚠️ [DEEPSEEK_ERROR] ${error.message}`;
        }
    });
}

export async function askQwenAsFallback(userMessage, systemPrompt, chatHistory) {
    const apiKey = process.env.NVIDIA_API_KEY_QWEN;
    if (!apiKey) return '⚠️ [QWEN_ERROR] NVIDIA_API_KEY_QWEN tidak ditemukan.';
    return nvidiaQueue.add(async () => {
        try {
            return await _callNvidiaAsFallback(userMessage, systemPrompt, chatHistory, NVIDIA.QWEN_MODEL, apiKey, QWEN_TIMEOUT_MS);
        } catch (error) {
            console.log(`[Debug] Qwen fallback error: ${error.name} — ${error.message}`);
            if (error.message === 'TIMEOUT') return '⚠️ [QWEN_ERROR] Timeout 15s.';
            return `⚠️ [QWEN_ERROR] ${error.message}`;
        }
    });
}


