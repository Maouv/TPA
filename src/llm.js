import { GoogleGenerativeAI } from '@google/generative-ai';

// Inisialisasi API menggunakan key dari ~/.bashrc
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

export async function generateResponse(userMessage, systemPrompt, chatHistory) {
    try {
        // Merakit prompt: Sistem + Memori Hari Ini + Pesan Baru
        const fullPrompt = `${systemPrompt}\n\n--- [LOG MEMORI HARI INI] ---\n${chatHistory}\n\nDafana: ${userMessage}\nFreyana:`;
        
        const result = await model.generateContent(fullPrompt);
        return result.response.text();
    } catch (error) {
        const errStr = error.toString().toLowerCase();
        
        // Error Handling khusus Android & Free Tier
        if (errStr.includes('429') || errStr.includes('quota')) {
            return "⚠️ [SYSTEM_ERROR] Error 429: Rate limit Gemini Free Tier habis. Tunggu bentar baru nanya lagi.";
        } else if (errStr.includes('503') || errStr.includes('overloaded')) {
            return "⚠️ [SYSTEM_ERROR] Error 503: Server Gemini lagi down atau kepenuhan.";
        } else if (errStr.includes('fetch failed') || errStr.includes('network') || errStr.includes('econnreset')) {
            return "⚠️ [SYSTEM_ERROR] Network Error: Koneksi internet Termux putus. Cek sinyal atau WiFi lu, Dafana.";
        } else {
            return `⚠️ [SYSTEM_ERROR] Ada error internal: ${error.message}`;
        }
    }
}

