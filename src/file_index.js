// src/file_index.js
// Auto-maintain workspace/files/INDEX.md
// Dipanggil setiap kali file dibuat atau dihapus

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILES_DIR   = path.resolve(__dirname, '..', 'workspace', 'files');
const INDEX_FILE  = path.join(FILES_DIR, 'INDEX.md');

function getTimestamp() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

async function readIndex() {
    try {
        return await fs.readFile(INDEX_FILE, 'utf-8');
    } catch {
        return '# File Index\n\n';
    }
}

async function writeIndex(content) {
    await fs.mkdir(FILES_DIR, { recursive: true });
    await fs.writeFile(INDEX_FILE, content, 'utf-8');
}

// Panggil ini setelah WRITE_FILE sukses
export async function indexAddFile(filePath) {
    try {
        const filename = path.basename(filePath);
        if (filename === 'INDEX.md') return; // jangan index dirinya sendiri

        let content = await readIndex();

        // Kalau sudah ada, update timestamp-nya
        const lineRegex = new RegExp(`^- ${escapeRegex(filename)} .*$`, 'm');
        const newLine = `- ${filename} (dibuat: ${getTimestamp()})`;

        if (lineRegex.test(content)) {
            content = content.replace(lineRegex, newLine);
        } else {
            content += `${newLine}\n`;
        }

        await writeIndex(content);
        console.log(`[FileIndex] +${filename}`);
    } catch (e) {
        console.error('[FileIndex] Gagal tambah entry:', e.message);
    }
}

// Panggil ini setelah rm sukses
export async function indexRemoveFile(filePath) {
    try {
        const filename = path.basename(filePath);
        if (filename === 'INDEX.md') return;

        let content = await readIndex();
        const lineRegex = new RegExp(`^- ${escapeRegex(filename)} .*\\n?`, 'm');
        content = content.replace(lineRegex, '');

        await writeIndex(content);
        console.log(`[FileIndex] -${filename}`);
    } catch (e) {
        console.error('[FileIndex] Gagal hapus entry:', e.message);
    }
}

// Rebuild index dari file yang sebenarnya ada di disk
export async function rebuildIndex() {
    try {
        await fs.mkdir(FILES_DIR, { recursive: true });
        const entries = await fs.readdir(FILES_DIR);
        const files = entries.filter(f => f !== 'INDEX.md');

        let content = '# File Index\n\n';
        for (const f of files) {
            const stat = await fs.stat(path.join(FILES_DIR, f));
            const modified = stat.mtime.toISOString().slice(0, 16).replace('T', ' ');
            content += `- ${f} (dibuat: ${modified})\n`;
        }

        await writeIndex(content);
        console.log(`[FileIndex] Rebuilt — ${files.length} files`);
    } catch (e) {
        console.error('[FileIndex] Gagal rebuild:', e.message);
    }
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

