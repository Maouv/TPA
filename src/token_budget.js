// token_budget.js — Track request count dan token usage biar tidak kena rate limit

const CHARS_PER_TOKEN = 4;
const WINDOW_MS = 60 * 1000; // 1 menit rolling window

// Gemini free tier limits
const GEMINI_RPM_LIMIT = 10;      // 10 requests per menit (batas aman)
const GEMINI_INPUT_LIMIT = 10000; // 10K input tokens per menit
const BUDGET_RPM = Math.floor(GEMINI_RPM_LIMIT * 0.8);    // 8 RPM
const BUDGET_INPUT = Math.floor(GEMINI_INPUT_LIMIT * 0.8); // 8000 tokens

let requests = [];   // [{timestamp}]
let inputUsage = []; // [{timestamp, tokens}]
let outputUsage = [];

function estimateTokens(text) {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function getCountInWindow(arr) {
    const cutoff = Date.now() - WINDOW_MS;
    const valid = arr.filter(e => e.timestamp > cutoff);
    arr.length = 0;
    arr.push(...valid);
    return valid.length;
}

function getUsageInWindow(arr) {
    const cutoff = Date.now() - WINDOW_MS;
    const valid = arr.filter(e => e.timestamp > cutoff);
    arr.length = 0;
    arr.push(...valid);
    return valid.reduce((sum, e) => sum + e.tokens, 0);
}

export function trackRequest(inputText, outputText = '') {
    const now = Date.now();
    requests.push({ timestamp: now });
    inputUsage.push({ timestamp: now, tokens: estimateTokens(inputText) });
    if (outputText) {
        outputUsage.push({ timestamp: now, tokens: estimateTokens(outputText) });
    }
}

export function getRemainingBudget() {
    const usedRPM = getCountInWindow(requests);
    const usedInput = getUsageInWindow(inputUsage);
    return {
        rpm: Math.max(0, BUDGET_RPM - usedRPM),
        input: Math.max(0, BUDGET_INPUT - usedInput),
        usedRPM,
        usedInput
    };
}

export function isOverBudget() {
    const { rpm, input } = getRemainingBudget();
    return rpm <= 0 || input < 1000;
}

export function compressPrompt(systemPrompt, chatHistory, userMessage) {
    const { input } = getRemainingBudget();
    const totalChars = input * CHARS_PER_TOKEN;

    const systemChars = systemPrompt.length;
    const userChars = userMessage.length;
    const historyBudget = totalChars - systemChars - userChars - 500;

    if (historyBudget <= 0) {
        console.log('[Budget] ⚠️ Budget kritis — kompres agresif');
        const minSystem = systemPrompt.slice(0, Math.floor(totalChars * 0.5));
        return { systemPrompt: minSystem, chatHistory: '', userMessage };
    }

    if (chatHistory.length > historyBudget) {
        console.log(`[Budget] Kompres history: ${chatHistory.length} → ${historyBudget} chars`);
        const compressed = chatHistory.slice(-historyBudget);
        return { systemPrompt, chatHistory: compressed, userMessage };
    }

    return { systemPrompt, chatHistory, userMessage };
}

export function logBudgetStatus() {
    const { rpm, input, usedRPM, usedInput } = getRemainingBudget();
    console.log(`[Budget] RPM: ${usedRPM}/${BUDGET_RPM} used, ${rpm} remaining | Input tokens: ${usedInput}/${BUDGET_INPUT} used, ${input} remaining`);
}

