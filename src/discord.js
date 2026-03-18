import { Client, GatewayIntentBits } from 'discord.js';
import { getSystemPrompt, readChatHistory, writeChatHistory, getOwnerName } from './parser.js';
import { generateResponse } from './llm.js';
import { runSummarizer } from './summarizer.js';
import { DISCORD, validateConfig } from './config.js';
import { executeSkills } from './skills/executor.js';
import { getUsageSummary } from './usage_tracker.js';

validateConfig();

// ─── Discord Client ───────────────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const ALLOWED_BOT_IDS = DISCORD.ALLOWED_BOT_IDS;

// ─── Helpers ──────────────────────────────────────────────────
async function sendLongMessage(channel, text) {
    if (text.length <= DISCORD.CHUNK_SIZE) {
        await channel.send(text);
        return;
    }
    for (let i = 0; i < text.length; i += DISCORD.CHUNK_SIZE) {
        await channel.send(`[Lanjutan]\n${text.slice(i, i + DISCORD.CHUNK_SIZE)}`);
    }
}

async function askPermissionDiscord(channel, commandOrPath, actionType, fileContent = '') {
    let warningMsg = `\`[SYSTEM_OUTPUT]\`⚠️ **[WARNING]** Freyana ingin mengeksekusi aksi:\n`;
    if (actionType === 'TERMINAL') {
        warningMsg += `\`\`\`bash\n${commandOrPath}\n\`\`\``;
    } else {
        const preview = fileContent.length > 50 ? fileContent.substring(0, 50) + '...' : fileContent;
        warningMsg += `Menulis ke file: \`${commandOrPath}\`\nPreview: \`${preview}\``;
    }
    warningMsg += `\n**Izinkan? (Balas 'y' untuk setuju, 'n' untuk tolak)**\n*(Otomatis tolak dalam 30 detik)*`;

    const sentWarning = await channel.send(warningMsg);
    const warningTimestamp = sentWarning.createdTimestamp;

    // Hanya terima pesan yang dikirim SETELAH warning muncul
    const filter = (m) =>
        ['y', 'n', 'yes', 'no'].includes(m.content.toLowerCase()) &&
        m.createdTimestamp > warningTimestamp;

    try {
        const collected = await channel.awaitMessages({ filter, max: 1, time: DISCORD.CONFIRM_TIMEOUT_MS, errors: ['time'] });
        const answer = collected.first().content.toLowerCase();
        if (answer === 'y' || answer === 'yes') {
            await channel.send('✅ Eksekusi diizinkan. Menjalankan...');
            return true;
        } else {
            await channel.send('❌ Eksekusi ditolak (N).');
            return false;
        }
    } catch {
        await channel.send('⏳ Timeout 30 detik. Eksekusi otomatis dibatalkan (N).');
        return false;
    }
}

// ─── Events ───────────────────────────────────────────────────
// Simpan bot ID setelah ready — hindari client.user null saat event awal
let botUserId = null;

client.on('ready', () => {
    botUserId = client.user.id;
    console.log(`Node.js ${process.version} | TPA Discord Ready`);
    console.log(`🤖 Freyana Online sebagai: ${client.user.tag}`);
    console.log('==========================================');
});

client.on('messageCreate', async (message) => {
    if (message.channelId !== process.env.DISCORD_CHANNEL_ID) return;

    // Block semua pesan dari bot — termasuk diri sendiri
    // Pengecualian hanya untuk ALLOWED_BOT_IDS (OpenClaw, dll)
    if (message.author.bot) {
        if (!ALLOWED_BOT_IDS.includes(message.author.id)) return;
    }

    // Block pesan dari diri sendiri — pakai botUserId yang sudah di-set saat ready
    if (botUserId && message.author.id === botUserId) return;

    const text = message.content.trim();
    if (!text) return;
    if (text.includes('[SYSTEM_OUTPUT]')) return;

    // ── Command: !usage ───────────────────────────────────────
    if (text === '!usage') {
        const summary = await getUsageSummary();
        await message.channel.send(summary);
        return;
    }

    await message.channel.sendTyping();

    try {
        const ownerName = await getOwnerName();

        // Deteksi reply
        let replyContext = '';
        if (message.reference?.messageId) {
            try {
                const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                replyContext = `[${ownerName} me-reply pesan ini]: "${repliedMsg.content}" (dari: ${repliedMsg.author.username})`;
                console.log('[System] Reply detected:', replyContext);
            } catch (e) {
                console.error('[System] Gagal fetch replied message:', e.message);
            }
        }

        const fullText = replyContext ? `${replyContext}\n\n${text}` : text;

        await writeChatHistory(ownerName, fullText, message.id);

        const systemPrompt = await getSystemPrompt(false, text);
        const chatHistory  = await readChatHistory(text);
        const aiResponse   = await generateResponse(fullText, systemPrompt, chatHistory);

        // Jangan tulis history di sini — executor.js yang handle
        // (kalau ditulis di sini, response ke-2 dari tool akan trigger loop)
        await message.channel.sendTyping();

        await executeSkills(aiResponse, systemPrompt, ownerName, {
            notify: (msg) => sendLongMessage(message.channel, msg),
            askPermission: (target, type, content) => askPermissionDiscord(message.channel, target, type, content),
        });

    } catch (err) {
        console.error('Gagal memproses alur:', err);
        await message.channel.send(`⚠️ **[SYSTEM_ERROR]** Gagal memproses alur utama: ${err.message}`);
    }
});

// ─── Boot ─────────────────────────────────────────────────────
(async () => {
    try { await runSummarizer(); } catch (e) { console.error('⚠️ Summarizer error:', e.message); }
    client.login(process.env.DISCORD_BOT_TOKEN);
    setInterval(async () => {
        try { await runSummarizer(); } catch (e) { console.error('⚠️ Summarizer interval error:', e.message); }
    }, 10 * 60 * 1000);
})();

