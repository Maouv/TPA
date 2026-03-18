// src/llm/index.js — single export interface
export { generateResponse }                          from './chain.js';
export { getActiveModel, setActiveModel, resetToAuto } from './chain.js';
export { getStats as getGroqStats }                  from './providers/groq.js';
export { askAsSecondBrain as askClaude }             from './providers/claude.js';
export { askDeepSeekAsSecondBrain as askDeepSeek, askQwenAsSecondBrain as askQwen } from './providers/nvidia.js';
export { REGISTRY }                                  from './registry.js';

