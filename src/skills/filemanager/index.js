import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';

// Base direktori yang aman. Resolving memastikan mendapatkan path absolutnya.
const WORKSPACE_DIR = path.resolve('workspace');

// Fungsi bantuan untuk memastikan operasi file hanya dilakukan di dalam workspace.
function getSafePath(targetPath) {
    // Gabungkan path yang diminta dengan letak root proyek (bisa relatif)
    const resolvedPath = path.resolve(WORKSPACE_DIR, targetPath);

    // Pastikan path hasil resolve diawali dengan WORKSPACE_DIR.
    // Jika mengandung .. atau keluar scope, resolvedPath akan berbeda direktorinya.
    if (!resolvedPath.startsWith(WORKSPACE_DIR)) {
        throw new Error(`[SECURITY BLOCK] Akses file ke ${resolvedPath} ditolak! Freyana hanya diizinkan mengakses di dalam ${WORKSPACE_DIR}`);
    }
    return resolvedPath;
}

// Fungsi untuk tag <READ_FILE>
export async function readFile(targetPath) {
    try {
        const safePath = getSafePath(targetPath);
        console.log(`\n[System] ❯ Freyana sedang membaca file: ${safePath}\n`);
        const content = await fs.readFile(safePath, 'utf-8');
        return `[FILE_CONTENT dari ${targetPath}]:\n${content}`;
    } catch (error) {
        return `[FILE_ERROR] Gagal membaca file ${targetPath}: ${error.message}`;
    }
}

// Fungsi untuk tag <WRITE_FILE> yang mensyaratkan izin dari pengguna.
export async function writeFileWithPermission(targetPath, content, skipPrompt = false) {
    try {
        const safePath = getSafePath(targetPath);
	
	if (skipPrompt) {
            await fs.mkdir(path.dirname(safePath), { recursive: true });
            await fs.writeFile(safePath, content, 'utf-8');
            return `[FILE_SUCCESS] File ${targetPath} berhasil ditulis.`;
        }

        
        // Meminta konfirmasi (Y/N), dengan logika mirip skill Terminal
        return new Promise((resolve) => {
            const rlConfirm = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            let timeout;

            const finish = async (result) => {
                clearTimeout(timeout);
                rlConfirm.close();
                if(result) {
                    try {
                        // Jika targetPath mengandung folder sub-direktori, buatkan sekalian
                        const dirname = path.dirname(safePath);
                        await fs.mkdir(dirname, { recursive: true });

                        await fs.writeFile(safePath, content, 'utf-8');
                        console.log(`\n[System] ❯ Berhasil menulis ke file: ${safePath}\n`);
                        resolve(`[FILE_SUCCESS] File ${targetPath} berhasil ditulis.`);
                    } catch (err) {
                        resolve(`[FILE_ERROR] Gagal menulis ke ${targetPath}: ${err.message}`);
                    }
                } else {
                     resolve("[SYSTEM_LOG] Operasi WRITE file dibatalkan oleh Dafana (N).");
                }
            };

            console.log('\n==========================================');
            // Menampilkan secuil isi konten agar user tau apa yg mau ditulis
            const previewContent = content.length > 100 ? content.substring(0, 100) + "..." : content;
            rlConfirm.question(`⚠️ [WARNING] Freyana ingin menulis file ke: \n> \x1b[33m${targetPath}\x1b[0m\n\nPreview Konten:\n${previewContent}\n\nIzinkan? (y/N) [Batal otomatis dlm 30s]: `, (answer) => {
                const ans = answer.trim().toLowerCase();
                if (ans === 'y') {
                    finish(true);
                } else {
                    finish(false);
                }
            });

            timeout = setTimeout(() => {
                console.log('\n⏳ [TIMEOUT] 30 detik berlalu. Penulisan file dibatalkan otomatis (N).');
                finish(false);
            }, 30000);
        });

    } catch (error) {
        return `[FILE_ERROR] Gagal validasi operasi tulis file ${targetPath}: ${error.message}`;
    }
}

