import { exec } from 'child_process';
import readline from 'readline';

// 1. Blacklist Perintah Destruktif
const BLACKLIST = ['rm -rf', 'mkfs', 'chmod 777', 'dd', 'su', 'sudo'];

// Fungsi untuk meminta izin Y/N ke Dafana
async function askPermission(command) {
    // Normalisasi spasi agar tidak bisa diakali (contoh: 'rm   -rf' jadi 'rm -rf')
    const cmdLower = command.toLowerCase();
    const normalizedCmd = cmdLower.replace(/\s+/g, ' ');
    
    // Cek Blacklist dengan command yang sudah dinormalisasi
    if (BLACKLIST.some(badCmd => normalizedCmd.includes(badCmd))) {
        console.log(`\n❌ [SECURITY BLOCK] ❯ Freyana nyoba jalanin perintah terlarang: \`${command}\`. Eksekusi otomatis diblokir!`);
        return false; // Otomatis tolak tanpa nanya
    }

    return new Promise((resolve) => {
        // Buat interface prompt sementara
        const rlConfirm = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        let timeout;

        // Fungsi untuk menutup prompt dan mengembalikan hasil
        const finish = (result) => {
            clearTimeout(timeout);
            rlConfirm.close();
            resolve(result);
        };

        console.log('\n==========================================');
        // Prompt diubah menjadi (y/N) untuk menandakan N adalah default
        rlConfirm.question(`⚠️ [WARNING] Freyana ingin mengeksekusi:\n> \x1b[33m${command}\x1b[0m\n\nIzinkan? (y/N) [Batal otomatis dlm 30s]: `, (answer) => {
            const ans = answer.trim().toLowerCase();
            
            // Hanya mengeksekusi jika Dafana secara eksplisit mengetik 'y'
            if (ans === 'y') {
                finish(true);
            } else {
                finish(false); // Default N jika tekan Enter kosong atau ketik huruf lain
            }
        });

        // 3. Timeout 30 detik otomatis batal (N)
        timeout = setTimeout(() => {
            console.log('\n⏳ [TIMEOUT] 30 detik berlalu. Eksekusi dibatalkan otomatis (N).');
            finish(false);
        }, 30000);
    });
}

// Fungsi utama yang akan dipanggil nanti
 export async function executeCommand(command, skipPrompt = false) {
    if (!skipPrompt) {
        const isAllowed = await askPermission(command.trim());
        if (!isAllowed) {
            return "[SYSTEM_LOG] Eksekusi dibatalkan oleh Dafana atau diblokir oleh sistem keamanan.";
        }
    }   

    console.log(`\n[System] ❯ Menjalankan: ${command} ...\n`);
    
    return new Promise((resolve) => {
        exec(command, (error, stdout, stderr) => {
            let aiFeedback = "";
            
            // 4. Output langsung ditampilkan ke terminal
            if (stdout) {
                console.log(`\x1b[32m${stdout}\x1b[0m`); // Warna hijau
                aiFeedback += `[STDOUT]\n${stdout}\n`;
            }
            if (stderr) {
                console.error(`\x1b[31m${stderr}\x1b[0m`); // Warna merah
                aiFeedback += `[STDERR]\n${stderr}\n`;
            }
            if (error) {
                aiFeedback += `[ERROR_CODE]\n${error.message}\n`;
            }
            
            // Kembalikan teks output agar bisa dibaca oleh Freyana
            resolve(aiFeedback || "[SYSTEM_LOG] Perintah selesai dieksekusi tanpa output teks.");
        });
    });
}

