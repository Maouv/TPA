import { GoogleGenerativeAI } from '@google/generative-ai';
import { askDeepSeekAsFallback, askQwenAsFallback } from './llm_nvidia.js';
import { geminiQueue } from './queue.js';
import { trackRequest, isOverBudget, compressPrompt, logBudgetStatus } from './token_budget.js';
import { generateResponseGroq, isGroqOverLimit } from './llm_groq.js';
import { GEMINI } from './config.js';
import { trackUsage } from './usage_tracker.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: GEMINI.MODEL });

let geminiCooldownUntil = 0;
const GEMINI_COOLDOWN_MS = GEMINI.COOLDOWN_MS;

async function callGeminiWithRetry(fullPrompt, maxRetries = 2) {
    let delay = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await model.generateContent(fullPrompt);
            return result.response.text();
        } catch (error) {
            const errStr = error.toString().toLowerCase();

            if (errStr.includes('fetch failed') || errStr.includes('network') || errStr.includes('econnreset')) {
                throw new Error('NETWORK');
            }

            if (errStr.includes('429') || errStr.includes('quota') || errStr.includes('503') || errStr.includes('overloaded')) {
                if (attempt === maxRetries) throw new Error('RATE_LIMIT');
                console.log(`[Gemini] limit (attempt ${attempt}/${maxRetries}) — retry dalam ${delay/1000}s...`);
                await new Promise(r => setTimeout(r, delay));
                delay *= 2;
                continue;
            }

            throw error;
        }
    }
}

export async function generateResponse(userMessage, systemPrompt, chatHistory) {
    return geminiQueue.add(() => _generateResponse(userMessage, systemPrompt, chatHistory));
}

async function _generateResponse(userMessage, systemPrompt, chatHistory) {

    // Layer 1: Groq (primary)
    if (!isGroqOverLimit()) {
        try {
            console.log('[System] Trying Groq...');
            const result = await generateResponseGroq(systemPrompt, chatHistory, userMessage);
            const { content, totalTokens } = result;
            trackUsage('groq', totalTokens).catch(() => {});
            return content;
        } catch (error) {
            if (error.message === 'TIMEOUT') {
                console.log('[Groq] Timeout — fallback ke Gemini...');
            } else if (error.message === 'RATE_LIMIT') {
                console.log('[Groq] Rate limit — fallback ke Gemini...');
            } else {
                console.log(`[Groq] Error: ${error.message} — fallback ke Gemini...`);
            }
        }
    } else {
        console.log('[Groq] Over limit — skip ke Gemini...');
    }

    // Layer 2: Gemini (secondary)
    if (Date.now() >= geminiCooldownUntil) {
        logBudgetStatus();
        if (!isOverBudget()) {
            const compressed = compressPrompt(systemPrompt, chatHistory, userMessage);
            const fullPrompt = `${compressed.systemPrompt}\n\n--- [LOG MEMORI HARI INI] ---\n${compressed.chatHistory}\n\nDafana: ${compressed.userMessage}\nFreyana:`;
            trackRequest(fullPrompt);

            try {
                const geminiResponse = await callGeminiWithRetry(fullPrompt);
                console.log('[Gemini] Response OK');
                trackUsage('gemini', Math.ceil((fullPrompt.length + geminiResponse.length) / 4)).catch(() => {});
                return geminiResponse;
            } catch (error) {
                if (error.message === 'RATE_LIMIT') {
                    geminiCooldownUntil = Date.now() + GEMINI_COOLDOWN_MS;
                    console.log('[Gemini] Rate limit — cooldown 5 menit, fallback ke Qwen...');
                } else if (error.message === 'NETWORK') {
                    return "⚠️ [SYSTEM_ERROR] Network Error: Koneksi internet putus.";
                }
            }
        }
    } else {
        const remaining = Math.ceil((geminiCooldownUntil - Date.now()) / 1000);
        console.log(`[Gemini] Cooldown ${remaining}s — skip ke Qwen...`);
    }

    // Layer 3: Qwen
    try {
        console.log('[System] Fallback ke Qwen...');
        const qwenResponse = await askQwenAsFallback(userMessage, systemPrompt, chatHistory);
        if (!qwenResponse.includes('[QWEN_ERROR]')) {
            trackUsage('qwen', Math.ceil(qwenResponse.length / 4)).catch(() => {});
            return qwenResponse;
        }
        throw new Error(qwenResponse);
    } catch {
        // Layer 4: DeepSeek
        try {
            console.log('[System] Fallback ke DeepSeek...');
            const dsResponse = await askDeepSeekAsFallback(userMessage, systemPrompt, chatHistory);
            if (!dsResponse.includes('[DEEPSEEK_ERROR]')) {
                trackUsage('deepseek', Math.ceil(dsResponse.length / 4)).catch(() => {});
                return dsResponse;
            }
            throw new Error(dsResponse);
        } catch {
            return "⚠️ [SYSTEM_ERROR] Semua model kena limit. Tunggu bentar.";
        }
    }
}


