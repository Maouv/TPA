import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_DIR = path.resolve(__dirname, '..', 'workspace');
const MEMORY_DIR = path.join(WORKSPACE_DIR, 'memory');
const MAIN_MEMORY_FILE = path.join(WORKSPACE_DIR, 'MEMORY.md');

// Fungsi untuk mendapatkan tanggal kemarin (YYYY-MM-DD)
function getYesterdayDate() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function runSummarizer() {
    console.log("[System] Menjalankan pengecekan log memori harian...");
    
    // Pastikan folder memory dan file MEMORY.md ada agar tidak error
    await fs.mkdir(MEMORY_DIR, { recursive: true }).catch(() => ({}));
    
    try {
         await fs.access(MAIN_MEMORY_FILE);
    } catch {
         await fs.writeFile(MAIN_MEMORY_FILE, '# MEMORY (Long Term Context)\n', 'utf-8');
    }

    const yesterdayDate = getYesterdayDate();
    const oldLogFile = path.join(MEMORY_DIR, `${yesterdayDate}.md`);

    let oldLogContent = '';

    // Cek apakah ada file log kemarin
    try {
        oldLogContent = await fs.readFile(oldLogFile, 'utf-8');
    } catch (e) {
        console.log(`[System] Tidak ada log untuk diringkas (hari: ${yesterdayDate}). Aman.`);
        return; // Tidak ada log, keluar fungsi dengan tenang
    }

    if (!oldLogContent || oldLogContent.trim() === '') {
         console.log(`[System] Log file untuk ${yesterdayDate} kosong. Menghapusnya...`);
         await fs.unlink(oldLogFile);
         return;
    }

    console.log(`[System] Ditemukan file log lama (${yesterdayDate}). Memulai proses peringkasan...`);

    // Inisialisasi API terpisah untuk summarizer (agar tidak tercampur konteks utama)
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI.MODEL });

    const summaryPrompt = `Berikut adalah log percakapan antara User (user) dan Freyana (AI Agent) kemarin (${yesterdayDate}):\n\n--- [LOG PERCAKAPAN MENTAH] ---\n${oldLogContent}\n--- [END LOG] ---\n\nTugas lu:
1. Analisis log tersebut dan buat ringkasan eksekutif dengan maksimal 10 poin penting.
2. Abaikan hal-hal sepele (seperti salah ketik, error sementara). Fokus pada keputusan, tindakan penting, kode yang dibuat, file yang diubah, dan hal-hal baru yang dipelajari User.
3. Tulis ringkasan lu dengan gaya bahasa Freyana (Blak-blakan, sarkas, straight to the point).`;

    try {
        const result = await model.generateContent(summaryPrompt);
        const summaryText = result.response.text();

        // Siapkan entri memori baru untuk ditulis
        const memoryEntry = `\n\n## Ringkasan Log [${yesterdayDate}]\n${summaryText}`;

        // Append ke MEMORY.md (Long term memory)
        await fs.appendFile(MAIN_MEMORY_FILE, memoryEntry, 'utf-8');
        console.log(`[System] ✅ Ringkasan untuk tanggal ${yesterdayDate} berhasil ditambahkan ke MEMORY.md!`);

        // Hapus log harian karena esensinya sudah diringkas
        await fs.unlink(oldLogFile);
        console.log(`[System] 🗑️ File log mentah (${yesterdayDate}.md) dihapus.`);

    } catch (error) {
        // Jika API error (seperti 429 atau koneksi putus), JANGAN hapus file.
        // Biarkan agar bisa dicoba diringkas lagi besok.
        console.error(`[System] ⚠️ Gagal membuat ringkasan log. Error API Gemini: ${error.message}`);
        console.error(`[System] File log ${yesterdayDate}.md dipertahankan untuk dicoba lagi nanti.`);
    }
}


