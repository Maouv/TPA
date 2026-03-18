// src/llm/registry.js
// Single source of truth untuk semua provider, model, dan API key config
// Edit file ini untuk tambah/hapus provider atau model

export const REGISTRY = {

    groq: {
        name: 'Groq',
        emoji: '⚡',
        envKeys: ['GROQ_API_KEY_1', 'GROQ_API_KEY_2'], // fallback otomatis ke key berikutnya
        baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
        models: [
            { id: 'moonshotai/kimi-k2-instruct',                  label: 'Kimi K2' },
            { id: 'llama-3.3-70b-versatile',                      label: 'Llama 3.3 70B' },
            { id: 'meta-llama/llama-4-scout-17b-16e-instruct',    label: 'Llama 4 Scout 17B' },
            { id: 'qwen/qwen3-32b',                               label: 'Qwen3 32B' },
        ],
    },

    gemini: {
        name: 'Google Gemini',
        emoji: '✨',
        envKeys: ['GEMINI_API_KEY'],
        models: [
            { id: 'gemini-2.5-flash',          label: 'Gemini 2.5 Flash' },
            { id: 'gemini-2.5-flash-lite',     label: 'Gemini 2.5 Flash Lite' },
            { id: 'gemini-3-flash-preview',    label: 'Gemini 3 Flash (Preview)' },
        ],
    },

    nvidia: {
        name: 'Nvidia NIM',
        emoji: '🖥️',
        envKeys: ['NVIDIA_API_KEY_1', 'NVIDIA_API_KEY_2'],
        baseUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
        models: [
            { id: 'deepseek-ai/deepseek-v3.2',                        label: 'DeepSeek V3.2' },
            { id: 'qwen/qwen3.5-122b-a10b',                           label: 'Qwen 3.5 122B' },
            { id: 'z-ai/glm4.7',                                      label: 'GLM 4.7' },
            { id: 'minimaxai/minimax-m2.1',                           label: 'MiniMax M2.1' },
            { id: 'moonshotai/kimi-k2-thinking',                      label: 'Kimi K2 Thinking' },
            { id: 'qwen/qwen3-coder-480b-a35b-instruct',              label: 'Qwen3 Coder 480B' },
            { id: 'mistralai/devstral-2-123b-instruct-2512',          label: 'Devstral 2 123B' },
        ],
    },

    openrouter: {
        name: 'OpenRouter',
        emoji: '🌐',
        envKeys: ['OPENROUTER_API_KEY'],
        baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
        models: [
            { id: 'stepfun/step-3.5-flash:free',                  label: 'Step 3.5 Flash' },
            { id: 'nvidia/nemotron-3-super-120b-a12b:free',       label: 'Nemotron 3 Super 120B' },
            { id: 'z-ai/glm-4.5-air:free',                        label: 'GLM 4.5 Air' },
            { id: 'openrouter/hunter-alpha',                      label: 'Hunter Alpha' },
        ],
    },

};

// Ambil semua API key yang tersedia untuk provider (filter yang kosong)
export function getAvailableKeys(providerKey) {
    const provider = REGISTRY[providerKey];
    if (!provider) return [];
    return provider.envKeys
        .map(envName => process.env[envName])
        .filter(Boolean);
}

// Ambil model by ID dari semua provider
export function findModel(modelId) {
    for (const [providerKey, provider] of Object.entries(REGISTRY)) {
        const model = provider.models.find(m => m.id === modelId);
        if (model) return { providerKey, provider, model };
    }
    return null;
}

// Ambil semua model ID yang valid (ada key-nya)
export function getAvailableModels() {
    const result = [];
    for (const [providerKey, provider] of Object.entries(REGISTRY)) {
        const keys = getAvailableKeys(providerKey);
        if (keys.length === 0) continue;
        for (const model of provider.models) {
            result.push({ providerKey, modelId: model.id, label: model.label });
        }
    }
    return result;
}

