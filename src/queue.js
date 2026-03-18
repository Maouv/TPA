import { QUEUE } from './config.js';

class RequestQueue {
    constructor(name, delayMs = 500) {
        this.name = name;
        this.queue = [];
        this.isProcessing = false;
        this.delayMs = delayMs;
    }

    async add(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            this.process();
        });
    }

    async process() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        const { fn, resolve, reject } = this.queue.shift();

        try {
            const result = await fn();
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            this.isProcessing = false;
            if (this.queue.length > 0) {
                setTimeout(() => this.process(), this.delayMs);
            }
        }
    }
}

// Queue terpisah per provider — hindari deadlock
export const geminiQueue     = new RequestQueue('gemini',     QUEUE.GEMINI_DELAY_MS);
export const nvidiaQueue     = new RequestQueue('nvidia',     QUEUE.NVIDIA_DELAY_MS);
export const groqQueue       = new RequestQueue('groq',       QUEUE.GROQ_DELAY_MS || 300);
export const openrouterQueue = new RequestQueue('openrouter', QUEUE.OPENROUTER_DELAY_MS || 500);
export const claudeQueue     = new RequestQueue('claude',     QUEUE.CLAUDE_DELAY_MS || 15000);

// Backwards compat
export const llmQueue = nvidiaQueue;



