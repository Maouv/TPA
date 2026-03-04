import fs from 'fs/promises';
import path from 'path';

const WORKSPACE_DIR = path.resolve('workspace');
const MEMORY_DIR = path.join(WORKSPACE_DIR, 'memory');
const MAX_CONTEXT_CHARS = 12000;

// Fungsi membaca file sistem/persona
export async function getSystemPrompt() {
    const files = ['SOUL.md', 'AGENTS.md', 'USER.md', 'TOOLS.md'];
    let prompt = '';
    
    // 1. Load file workspace dasar
    for (const file of files) {
        try {
            const content = await fs.readFile(path.join(WORKSPACE_DIR, file), 'utf-8');
            prompt += `\n--- [BEGIN ${file}] ---\n${content}\n--- [END ${file}] ---\n`;
        } catch (e) {
            // Abaikan jika file belum ada
        }
    }

    // 2. Load SKILL: TERMINAL
    try {
        const termPath = path.resolve('src/skills/terminal/SKILL.md');
        const termContent = await fs.readFile(termPath, 'utf-8');
        prompt += `\n--- [BEGIN SKILL: TERMINAL] ---\n${termContent}\n--- [END SKILL: TERMINAL] ---\n`;
    } catch (e) {
        // Abaikan jika belum ada
    }

    // 3. Load SKILL: BROWSER
    try {
        const browserPath = path.resolve('src/skills/browser/SKILL.md');
        const browserContent = await fs.readFile(browserPath, 'utf-8');
        prompt += `\n--- [BEGIN SKILL: BROWSER] ---\n${browserContent}\n--- [END SKILL: BROWSER] ---\n`;
    } catch (e) {
        // Abaikan jika belum ada
    }

    // 4. Load SKILL: FILEMANAGER
    try {
        const fileManagerPath = path.resolve('src/skills/filemanager/SKILL.md');
        const fileManagerContent = await fs.readFile(fileManagerPath, 'utf-8');
        prompt += `\n--- [BEGIN SKILL: FILEMANAGER] ---\n${fileManagerContent}\n--- [END SKILL: FILEMANAGER] ---\n`;
    } catch (e) {
        // Abaikan jika belum ada
    }

    // 5. Potong jika kepanjangan (Anti OOM)
    if (prompt.length > MAX_CONTEXT_CHARS) {
        prompt = prompt.slice(0, MAX_CONTEXT_CHARS) + '\n...[DIPOTONG]...';
    }

    return prompt;
}

// Mendapatkan tanggal untuk nama file log
function getTodayDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Membaca sejarah obrolan (Hanya 20 baris terakhir)
export async function readChatHistory() {
    const file = path.join(MEMORY_DIR, `${getTodayDate()}.md`);
    try {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n');
        
        if (lines.length > 20) {
            return "\n...[LOG DIPOTONG (Hanya 20 baris terakhir untuk hemat RAM)]...\n" + lines.slice(-20).join('\n');
        }
        return content;
    } catch (e) {
        return ''; // Return kosong jika file log hari ini belum dibuat
    }
}

// Menulis log obrolan baru
export async function writeChatHistory(role, text) {
    // Buat folder memory/ jika belum ada
    await fs.mkdir(MEMORY_DIR, { recursive: true }).catch(() => ({}));
    
    const file = path.join(MEMORY_DIR, `${getTodayDate()}.md`);
    const time = new Date().toLocaleTimeString('id-ID');
    const logEntry = `\n**[${time}] ${role}:**\n${text}\n`;
    
    await fs.appendFile(file, logEntry, 'utf-8');
}

