import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { getSystemPrompt, readChatHistory, writeChatHistory, invalidatePromptCache } from './parser.js';
import { generateResponse } from './llm.js';
import { askClaude } from './llm_claude.js';
import { askDeepSeek, askQwen } from './llm_nvidia.js';
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
    
    let warningMsg = `\`[SYSTEM_OUTPUT]\`⚠️ **[WARNING]** Freyana ingin mengeksekusi aksi:\n`;
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

// ID bot OpenClaw yang boleh dibalas Freyana
const OPENCLAW_BOT_ID = '1472994726847451177';

client.on('messageCreate', async (message) => {
    if (message.channelId !== process.env.DISCORD_CHANNEL_ID) return;
    if (message.author.bot && message.author.id !== OPENCLAW_BOT_ID) return;

    const text = message.content.trim();
    if (!text) return;

    // Menampilkan typing indicator di Discord
    await message.channel.sendTyping();

    try {
        // Deteksi reply — kalau kamu reply pesan tertentu, fetch konteks pesan itu
        let replyContext = '';
        if (message.reference?.messageId) {
            try {
                const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                replyContext = `[Dafana me-reply pesan ini]: "${repliedMsg.content}" (dari: ${repliedMsg.author.username})`;
                console.log('[System] Reply detected:', replyContext);
            } catch (e) {
                console.error('[System] Gagal fetch replied message:', e.message);
            }
        }

        const fullText = replyContext ? `${replyContext}\n\n${text}` : text;

        await writeChatHistory('Dafana', fullText, message.id);

        let systemPrompt = await getSystemPrompt(false, text);
        let chatHistory = await readChatHistory(text); // Pass query untuk semantic search

        let aiResponse = await generateResponse(fullText, systemPrompt, chatHistory);

        // Jika tidak ada tag khusus, kirim langsung
        await writeChatHistory('Freyana', aiResponse, null);

        // Deteksi Tag
        const bashMatch = aiResponse.match(/<RUN_BASH>([\s\S]*?)<\/RUN_BASH>/);
        const fetchMatch = aiResponse.match(/<FETCH_URL>([\s\S]*?)<\/FETCH_URL>/);
        const readFileMatch = aiResponse.match(/<READ_FILE>([\s\S]*?)<\/READ_FILE>/);
        const writeFileMatch = aiResponse.match(/<WRITE_FILE\s+path="([^"]+)">([\s\S]*?)<\/WRITE_FILE>/);
        const askClaudeMatch = aiResponse.match(/<ASK_CLAUDE(?:\s+context="([^"]*)")?>([\s\S]*?)<\/ASK_CLAUDE>/);
        const askDeepSeekMatch = aiResponse.match(/<ASK_DEEPSEEK(?:\s+context="([^"]*)")?>([\s\S]*?)<\/ASK_DEEPSEEK>/);
        const askQwenMatch = aiResponse.match(/<ASK_QWEN(?:\s+context="([^"]*)")?>([\s\S]*?)<\/ASK_QWEN>/);

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
                writeResult = await writeFileWithPermission(filePath, fileContent, true);
                // Invalidate cache kalau Freyana nulis ke workspace
                invalidatePromptCache();
            }

            const toolLog = `[SYSTEM_TOOL_RESULT]:\n${writeResult}`;
            await writeChatHistory('System', toolLog);

            await message.channel.sendTyping();

            chatHistory = await readChatHistory();
            const followUpPrompt = `[System]: Berikut adalah status penulisan file ke ${filePath}. Berikan konfirmasi ke Dafana.`;

            const finalResponse = await generateResponse(followUpPrompt, systemPrompt, chatHistory);
            await writeChatHistory('Freyana', finalResponse);
            await sendLongMessage(message.channel, finalResponse);
            
        } else if (askClaudeMatch) {
            const claudeContext = askClaudeMatch[1] || '';
            const claudeQuestion = askClaudeMatch[2].trim();

            await message.channel.sendTyping();
            await message.channel.send('🤖 *Freyana lagi konsultasi ke Claude...*');

            const claudeAnswer = await askClaude(claudeQuestion, claudeContext);
            await writeChatHistory('Claude', claudeAnswer);

            await message.channel.send(`**[Claude]** ${claudeAnswer}`);

            chatHistory = await readChatHistory();
            const claudeFollowUp = `[System]: Claude sudah menjawab. Berikan kesimpulan atau langkah selanjutnya ke Dafana.`;
            const finalResponse2 = await generateResponse(claudeFollowUp, systemPrompt, chatHistory);

            await writeChatHistory('Freyana', finalResponse2);
            await sendLongMessage(message.channel, finalResponse2);

        } else if (askDeepSeekMatch) {
            const dsContext = askDeepSeekMatch[1] || '';
            const dsQuestion = askDeepSeekMatch[2].trim();

            await message.channel.sendTyping();
            await message.channel.send('🧠 *Freyana lagi konsultasi ke DeepSeek...*');

            const dsAnswer = await askDeepSeek(dsQuestion, dsContext);
            await writeChatHistory('DeepSeek', dsAnswer);

            await message.channel.send(`**[DeepSeek]** ${dsAnswer}`);

            chatHistory = await readChatHistory();
            const dsFollowUp = `[System]: DeepSeek sudah menjawab. Berikan kesimpulan atau langkah selanjutnya ke Dafana.`;
            const finalResponse3 = await generateResponse(dsFollowUp, systemPrompt, chatHistory);

            await writeChatHistory('Freyana', finalResponse3);
            await sendLongMessage(message.channel, finalResponse3);

        } else if (askQwenMatch) {
            const qwenContext = askQwenMatch[1] || '';
            const qwenQuestion = askQwenMatch[2].trim();

            await message.channel.sendTyping();
            await message.channel.send('🧬 *Freyana lagi konsultasi ke Qwen...*');

            const qwenAnswer = await askQwen(qwenQuestion, qwenContext);
            await writeChatHistory('Qwen', qwenAnswer);

            await message.channel.send(`**[Qwen]** ${qwenAnswer}`);

            chatHistory = await readChatHistory();
            const qwenFollowUp = `[System]: Qwen sudah menjawab. Berikan kesimpulan atau langkah selanjutnya ke Dafana.`;
            const finalResponse4 = await generateResponse(qwenFollowUp, systemPrompt, chatHistory);

            await writeChatHistory('Freyana', finalResponse4);
            await sendLongMessage(message.channel, finalResponse4);

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

    // Jalanin summarizer tiap 10 menit, bukan tiap pesan
    setInterval(async () => {
        try {
            await runSummarizer();
        } catch (error) {
            console.error("⚠️ Summarizer interval error:", error.message);
        }
    }, 10 * 60 * 1000);
})();

