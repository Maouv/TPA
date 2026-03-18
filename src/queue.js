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

// Queue terpisah untuk Gemini dan Nvidia biar tidak deadlock
export const geminiQueue = new RequestQueue('gemini', QUEUE.GEMINI_DELAY_MS);
export const nvidiaQueue = new RequestQueue('nvidia', QUEUE.NVIDIA_DELAY_MS);

// Backwards compat
export const llmQueue = nvidiaQueue;


