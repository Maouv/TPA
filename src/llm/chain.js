// src/llm/chain.js — fallback chain + model switch
import * as groq       from './providers/groq.js';
import * as gemini     from './providers/gemini.js';
import * as nvidia     from './providers/nvidia.js';
import * as openrouter from './providers/openrouter.js';
import { trackUsage }  from '../usage_tracker.js';
import { REGISTRY, findModel } from './registry.js';
import { NVIDIA }      from '../config.js';

// State: { providerKey, modelId } atau null (= auto)
let activeModel = null;

export function getActiveModel() {
    return activeModel;
}

export function setActiveModel(providerKey, modelId) {
    if (!REGISTRY[providerKey]) throw new Error(`Provider '${providerKey}' tidak dikenal.`);
    const found = REGISTRY[providerKey].models.find(m => m.id === modelId);
    if (!found) throw new Error(`Model '${modelId}' tidak ada di provider '${providerKey}'.`);
    activeModel = { providerKey, modelId, label: found.label };
    console.log(`[Chain] Model switch → ${providerKey}/${modelId}`);
}

export function resetToAuto() {
    activeModel = null;
    console.log('[Chain] Model reset → auto');
}

// Call model spesifik berdasarkan provider
async function callProvider(providerKey, modelId, systemPrompt, chatHistory, userMessage) {
    switch (providerKey) {
        case 'groq':       return groq.call(systemPrompt, chatHistory, userMessage, modelId);
        case 'gemini':     return gemini.call(systemPrompt, chatHistory, userMessage);
        case 'nvidia':     return nvidia.call(systemPrompt, chatHistory, userMessage, modelId);
        case 'openrouter': return openrouter.call(systemPrompt, chatHistory, userMessage, modelId);
        default: throw new Error(`Provider '${providerKey}' tidak dikenal.`);
    }
}

export async function generateResponse(userMessage, systemPrompt, chatHistory) {

    // Mode: model spesifik (user pilih via /model)
    if (activeModel) {
        try {
            console.log(`[Chain] Forced: ${activeModel.providerKey}/${activeModel.modelId}`);
            const result = await callProvider(activeModel.providerKey, activeModel.modelId, systemPrompt, chatHistory, userMessage);
            trackUsage(activeModel.providerKey, result.totalTokens).catch(() => {});
            return result.content;
        } catch (error) {
            console.log(`[Chain] Forced model error: ${error.message}`);
            return `⚠️ [ERROR] Model ${activeModel.label} gagal: ${error.message}`;
        }
    }

    // Mode: auto fallback chain
    // Layer 1: Groq (default model dari config)
    if (!groq.isOverLimit()) {
        try {
            console.log('[Chain] Trying Groq...');
            const result = await groq.call(systemPrompt, chatHistory, userMessage);
            trackUsage('groq', result.totalTokens).catch(() => {});
            return result.content;
        } catch (error) {
            console.log(`[Chain] Groq failed (${error.message}) → Gemini...`);
        }
    } else {
        console.log('[Chain] Groq over limit → Gemini...');
    }

    // Layer 2: Gemini
    try {
        console.log('[Chain] Trying Gemini...');
        const result = await gemini.call(systemPrompt, chatHistory, userMessage);
        trackUsage('gemini', result.totalTokens).catch(() => {});
        return result.content;
    } catch (error) {
        if (error.message === 'NETWORK') return '⚠️ [SYSTEM_ERROR] Network error: koneksi putus.';
        console.log(`[Chain] Gemini failed (${error.message}) → Nvidia Qwen...`);
    }

    // Layer 3: Nvidia Qwen
    try {
        console.log('[Chain] Trying Nvidia Qwen...');
        const result = await nvidia.call(systemPrompt, chatHistory, userMessage, NVIDIA.QWEN_MODEL);
        trackUsage('nvidia', result.totalTokens).catch(() => {});
        return result.content;
    } catch (error) {
        console.log(`[Chain] Nvidia Qwen failed (${error.message}) → Nvidia DeepSeek...`);
    }

    // Layer 4: Nvidia DeepSeek
    try {
        console.log('[Chain] Trying Nvidia DeepSeek...');
        const result = await nvidia.call(systemPrompt, chatHistory, userMessage, NVIDIA.DEEPSEEK_MODEL);
        trackUsage('nvidia', result.totalTokens).catch(() => {});
        return result.content;
    } catch (error) {
        console.log(`[Chain] Nvidia DeepSeek failed (${error.message})`);
    }

    return '⚠️ [SYSTEM_ERROR] Semua model kena limit. Tunggu bentar.';
}

