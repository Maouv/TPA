// src/llm/providers/gemini.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { geminiQueue } from '../../queue.js';
import { trackRequest, isOverBudget, compressPrompt, logBudgetStatus } from '../../token_budget.js';
import { GEMINI } from '../../config.js';
import { REGISTRY } from '../registry.js';

// Cache instance per model biar tidak bikin ulang tiap request
const modelInstances = {};

function getModel(modelId) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY tidak ditemukan');
    if (!modelInstances[modelId]) {
        const genAI = new GoogleGenerativeAI(apiKey);
        modelInstances[modelId] = genAI.getGenerativeModel({ model: modelId });
    }
    return modelInstances[modelId];
}

let cooldownUntil = 0;

async function _call(systemPrompt, chatHistory, userMessage, modelId) {
    if (Date.now() < cooldownUntil) {
        const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
        throw new Error(`COOLDOWN:${remaining}`);
    }

    logBudgetStatus();
    if (isOverBudget()) throw new Error('OVER_BUDGET');

    const compressed = compressPrompt(systemPrompt, chatHistory, userMessage);
    const fullPrompt = `${compressed.systemPrompt}\n\n--- [LOG MEMORI HARI INI] ---\n${compressed.chatHistory}\n\nUser: ${compressed.userMessage}\nFreyana:`;
    trackRequest(fullPrompt);

    const activeModelId = modelId || GEMINI.MODEL;
    const model = getModel(activeModelId);

    let delay = GEMINI.RETRY_DELAY_MS;
    for (let attempt = 1; attempt <= GEMINI.MAX_RETRIES; attempt++) {
        try {
            const result = await model.generateContent(fullPrompt);
            const text = result.response.text();
            console.log(`[Gemini:${activeModelId}] Response OK`);
            return { content: text, totalTokens: Math.ceil((fullPrompt.length + text.length) / 4) };
        } catch (error) {
            const errStr = error.toString().toLowerCase();
            if (errStr.includes('fetch failed') || errStr.includes('network') || errStr.includes('econnreset')) {
                throw new Error('NETWORK');
            }
            if (errStr.includes('429') || errStr.includes('quota') || errStr.includes('503') || errStr.includes('overloaded')) {
                if (attempt === GEMINI.MAX_RETRIES) {
                    cooldownUntil = Date.now() + GEMINI.COOLDOWN_MS;
                    throw new Error('RATE_LIMIT');
                }
                console.log(`[Gemini] limit (attempt ${attempt}/${GEMINI.MAX_RETRIES}) — retry dalam ${delay / 1000}s...`);
                await new Promise(r => setTimeout(r, delay));
                delay *= 2;
            } else {
                throw error;
            }
        }
    }
}

export async function call(systemPrompt, chatHistory, userMessage, modelId) {
    return geminiQueue.add(() => _call(systemPrompt, chatHistory, userMessage, modelId));
}

