import { Client, GatewayIntentBits } from 'discord.js';
import { getSystemPrompt, readChatHistory, writeChatHistory } from './parser.js';
import { generateResponse } from './llm.js';
import { executeCommand } from './skills/terminal/index.js';
import { fetchWebPage } from './skills/browser/index.js';
import { readFile, writeFileWithPermission } from './skills/filemanager/index.js';
import { runSummarizer } from './summarizer.js';

// Cek env variable
if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_CHANNEL_ID) {
    console.error("❌ ERROR: DISCORD_BOT_TOKEN atau DISCORD_CHANNEL_ID tidak ditemukan!");
    process.exit(1);
}

// Inisialisasi Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Fungsi untuk mengirim pesan yang panjang (lebih dari 2000 karakter)
async function sendLongMessage(channel, text) {
    const CHUNK_SIZE = 1900; // Menyisihkan sedikit ruang aman
    if (text.length <= CHUNK_SIZE) {
        await channel.send(text);
        return;
    }

    const chunks = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
        chunks.push(text.slice(i, i + CHUNK_SIZE));
    }

    for (const chunk of chunks) {
        await channel.send(`[Lanjutan]\n${chunk}`);
    }
}

// Fungsi konfirmasi via Discord (mengganti prompt stdin)
async function askPermissionDiscord(channel, commandOrPath, actionType, previewContext = '') {
    // actionType = "TERMINAL" atau "WRITE_FILE"
    
    let warningMsg = `⚠️ **[WARNING]** Freyana ingin mengeksekusi aksi:\n`;
    if(actionType === 'TERMINAL') {
        warningMsg += `\`\`\`bash\n${commandOrPath}\n\`\`\``;
    } else {
        warningMsg += `Menulis ke file: \`${commandOrPath}\`\nPreview: \`${previewContext}\``;
    }
    warningMsg += `\n**Izinkan? (Balas 'y' untuk setuju, 'n' untuk tolak)** \n*(Otomatis tolak dalam 30 detik)*`;

    await channel.send(warningMsg);

    // Filter untuk menangkap jawaban dari siapapun di channel tersebut 
    // (Bisa diperketat untuk hanya menerima dari ID Dafana, tapi untuk sekarang kita biarkan terbuka di channel ID yang sama)
    const filter = (m) => ['y', 'n', 'yes', 'no'].includes(m.content.toLowerCase());
    
    try {
        const collected = await channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });
        const answer = collected.first().content.toLowerCase();
        
        if (answer === 'y' || answer === 'yes') {
            await channel.send("✅ Eksekusi diizinkan. Menjalankan...");
            return true;
        } else {
            await channel.send("❌ Eksekusi ditolak (N).");
            return false;
        }
    } catch (error) {
         await channel.send("⏳ Timeout 30 detik. Eksekusi otomatis dibatalkan (N).");
         return false;
    }
}


client.on('ready', () => {
    console.log(`Node.js ${process.version} | TPA Discord Ready`);
    console.log(`🤖 Freyana Online sebagai: ${client.user.tag}`);
    console.log("==========================================");
});

client.on('messageCreate', async (message) => {
    // Abaikan pesan dari bot sendiri atau dari channel lain
    if (message.author.bot || message.channelId !== process.env.DISCORD_CHANNEL_ID) return;

    const text = message.content.trim();
    if (!text) return;

    // Menampilkan typing indicator di Discord
    await message.channel.sendTyping();

    try {
        await writeChatHistory('Dafana', text);

        let systemPrompt = await getSystemPrompt();
        let chatHistory = await readChatHistory();

        let aiResponse = await generateResponse(text, systemPrompt, chatHistory);

        // Jika tidak ada tag khusus, kirim langsung
        await writeChatHistory('Freyana', aiResponse);

        // Deteksi Tag
        const bashMatch = aiResponse.match(/<RUN_BASH>([\s\S]*?)<\/RUN_BASH>/);
        const fetchMatch = aiResponse.match(/<FETCH_URL>([\s\S]*?)<\/FETCH_URL>/);
        const readFileMatch = aiResponse.match(/<READ_FILE>([\s\S]*?)<\/READ_FILE>/);
        const writeFileMatch = aiResponse.match(/<WRITE_FILE\s+path="([^"]+)">([\s\S]*?)<\/WRITE_FILE>/);

        if (bashMatch) {
            const commandToRun = bashMatch[1].trim();
            
            // Tanya izin lewat Discord
            const isAllowed = await askPermissionDiscord(message.channel, commandToRun, 'TERMINAL');
            
            let cmdResult = "[SYSTEM_LOG] Operasi terminal dibatalkan oleh Dafana (N).";
            if(isAllowed) {
                 // Eksekusi terminal (tanpa prompt stdin lagi)
                 cmdResult = await executeCommand(commandToRun, true); // Perlu sedikit modifikasi di file terminal/index.js agar bypass stdin
            }

            const toolLog = `[SYSTEM_TOOL_RESULT]:\n${cmdResult}`;
            await writeChatHistory('System', toolLog);

            await message.channel.sendTyping();
            
            chatHistory = await readChatHistory();
            const followUpPrompt = "[System]: Berikut adalah hasil dari eksekusi terminal tadi. Berikan analisismu, penjelasan, atau konfirmasi ke Dafana berdasarkan output tersebut.";
            
            const finalResponse = await generateResponse(followUpPrompt, systemPrompt, chatHistory);
            await writeChatHistory('Freyana', finalResponse);
            await sendLongMessage(message.channel, finalResponse);

        } else if (fetchMatch) {
             const urlToFetch = fetchMatch[1].trim();
             const fetchResult = await fetchWebPage(urlToFetch);
             
             const toolLog = `[SYSTEM_TOOL_RESULT]:\n${fetchResult}`;
             await writeChatHistory('System', toolLog);
             
             await message.channel.sendTyping();
             
             chatHistory = await readChatHistory();
             const followUpPrompt = "[System]: Berikut adalah isi teks dari URL yang lu baca tadi. Berikan rangkuman, jawaban, atau kesimpulan ke Dafana berdasarkan teks tersebut.";
             
             const finalResponse = await generateResponse(followUpPrompt, systemPrompt, chatHistory);
             await writeChatHistory('Freyana', finalResponse);
             await sendLongMessage(message.channel, finalResponse);

        } else if (readFileMatch) {
            const filePath = readFileMatch[1].trim();
            const fileResult = await readFile(filePath);

            const toolLog = `[SYSTEM_TOOL_RESULT]:\n${fileResult}`;
            await writeChatHistory('System', toolLog);

            await message.channel.sendTyping();

            chatHistory = await readChatHistory();
            const followUpPrompt = `[System]: Berikut adalah isi file dari ${filePath}. Berikan rangkuman, jawaban, atau kesimpulan ke Dafana berdasarkan teks tersebut.`;

            const finalResponse = await generateResponse(followUpPrompt, systemPrompt, chatHistory);
            await writeChatHistory('Freyana', finalResponse);
            await sendLongMessage(message.channel, finalResponse);

        } else if (writeFileMatch) {
            const filePath = writeFileMatch[1].trim();
            const fileContent = writeFileMatch[2]; 
            const previewText = fileContent.length > 50 ? fileContent.substring(0, 50) + "..." : fileContent;

            // Tanya izin lewat Discord
            const isAllowed = await askPermissionDiscord(message.channel, filePath, 'WRITE_FILE', previewText);

            let writeResult = "[SYSTEM_LOG] Operasi WRITE file dibatalkan oleh Dafana (N).";
            
            if(isAllowed) {
                // Eksekusi tulis file (tanpa prompt stdin lagi)
                writeResult = await writeFileWithPermission(filePath, fileContent, true); // Modifikasi bypass
            }

            const toolLog = `[SYSTEM_TOOL_RESULT]:\n${writeResult}`;
            await writeChatHistory('System', toolLog);

            await message.channel.sendTyping();

            chatHistory = await readChatHistory();
            const followUpPrompt = `[System]: Berikut adalah status penulisan file ke ${filePath}. Berikan konfirmasi ke Dafana.`;

            const finalResponse = await generateResponse(followUpPrompt, systemPrompt, chatHistory);
            await writeChatHistory('Freyana', finalResponse);
            await sendLongMessage(message.channel, finalResponse);
            
        } else {
             // Jika tidak mengeksekusi tool apapun
             await sendLongMessage(message.channel, aiResponse);
        }
        
    } catch (err) {
        console.error("Gagal memproses alur:", err);
        await message.channel.send(`⚠️ **[SYSTEM_ERROR]** Gagal memproses alur utama: ${err.message}`);
    }
});
 (async () => { 
    try {
        await runSummarizer();
    } catch (error) {
        console.error("⚠️ Summarizer error:", error.message);
    }
    client.login(process.env.DISCORD_BOT_TOKEN);
})();
