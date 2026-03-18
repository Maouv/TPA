// src/llm/providers/nvidia.js — semua model Nvidia NIM
import { nvidiaQueue } from '../../queue.js';
import { NVIDIA } from '../../config.js';
import { getAvailableKeys } from '../registry.js';

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
    const keys = getAvailableKeys('nvidia');
    if (keys.length === 0) throw new Error('Tidak ada NVIDIA_API_KEY yang tersedia');
    const apiKey = keys[0];

    const truncatedHistory = chatHistory.slice(-2000);
    const truncatedSystem = systemPrompt.slice(0, 3000);

    const response = await fetchWithTimeout(NVIDIA.API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: modelId,
            messages: [
                { role: 'system', content: truncatedSystem },
                { role: 'user', content: `--- [LOG MEMORI HARI INI] ---\n${truncatedHistory}\n\nUser: ${userMessage}\nFreyana:` }
            ],
            temperature: NVIDIA.TEMPERATURE,
            top_p: NVIDIA.TOP_P,
            max_tokens: NVIDIA.MAX_OUTPUT_TOKENS,
            stream: false
        })
    }, NVIDIA.DEEPSEEK_TIMEOUT_MS);

    if (!response.ok) {
        const err = await response.json();
        if (response.status === 429) throw new Error('RATE_LIMIT');
        throw new Error(`API error ${response.status}: ${err?.message || 'Unknown'}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || 'Respon kosong.';
    return { content, totalTokens: Math.ceil(content.length / 4) };
}

// Second brain untuk DeepSeek dan Qwen via <ASK_*> tags
async function _askAsSecondBrain(question, context, modelId) {
    const keys = getAvailableKeys('nvidia');
    if (keys.length === 0) throw new Error('Tidak ada NVIDIA_API_KEY yang tersedia');
    const apiKey = keys[0];

    let userMessage = context ? `[KONTEKS]:\n${context}\n\n[PERTANYAAN]:\n${question}` : question;
    if (userMessage.length > NVIDIA.MAX_INPUT_CHARS) {
        userMessage = userMessage.slice(0, NVIDIA.MAX_INPUT_CHARS) + '\n...[DIPOTONG]...';
    }

    const response = await fetchWithTimeout(NVIDIA.API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: modelId,
            messages: [
                { role: 'system', content: 'Jawab langsung, singkat, teknis. Tidak perlu basa-basi.' },
                { role: 'user', content: userMessage }
            ],
            temperature: NVIDIA.TEMPERATURE,
            top_p: NVIDIA.TOP_P,
            max_tokens: NVIDIA.MAX_OUTPUT_TOKENS,
            stream: false
        })
    }, NVIDIA.DEEPSEEK_TIMEOUT_MS);

    if (!response.ok) {
        const err = await response.json();
        throw new Error(`API error ${response.status}: ${err?.message || 'Unknown'}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Respon kosong.';
}

export async function call(systemPrompt, chatHistory, userMessage, modelId) {
    return nvidiaQueue.add(() => _call(systemPrompt, chatHistory, userMessage, modelId));
}

export async function askDeepSeekAsSecondBrain(question, context = '') {
    return nvidiaQueue.add(() => _askAsSecondBrain(question, context, NVIDIA.DEEPSEEK_MODEL));
}

export async function askQwenAsSecondBrain(question, context = '') {
    return nvidiaQueue.add(() => _askAsSecondBrain(question, context, NVIDIA.QWEN_MODEL));
}

