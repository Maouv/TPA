// src/handlers/message.js
import { getSystemPrompt, readChatHistory, writeChatHistory, getOwnerName } from '../parser.js';
import { generateResponse } from '../llm/index.js';
import { executeSkills } from '../skills/executor.js';
import { getUsageSummary } from '../usage_tracker.js';
import { DISCORD } from '../config.js';

export function setupMessageHandler(client, getBotUserId) {
    const ALLOWED_BOT_IDS = DISCORD.ALLOWED_BOT_IDS;

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
        warningMsg += `\n**Klik ✅ untuk izinkan, ❌ untuk tolak** *(otomatis tolak dalam 30 detik)*`;

        const warningMessage = await channel.send(warningMsg);
        await warningMessage.react('✅');
        await warningMessage.react('❌');

        const botUserId = getBotUserId();
        const filter = (reaction, user) =>
            ['✅', '❌'].includes(reaction.emoji.name) &&
            !user.bot &&
            user.id !== botUserId;

        try {
            const collected = await warningMessage.awaitReactions({
                filter,
                max: 1,
                time: DISCORD.CONFIRM_TIMEOUT_MS,
                errors: ['time']
            });
            const reaction = collected.first();
            if (reaction.emoji.name === '✅') {
                await channel.send('`[SYSTEM_OUTPUT]` ✅ Eksekusi diizinkan. Menjalankan...');
                return true;
            } else {
                await channel.send('`[SYSTEM_OUTPUT]` ❌ Eksekusi ditolak.');
                return false;
            }
        } catch {
            await channel.send('`[SYSTEM_OUTPUT]` ⏳ Timeout 30 detik. Eksekusi otomatis dibatalkan.');
            return false;
        }
    }

    client.on('messageCreate', async (message) => {
        if (message.channelId !== process.env.DISCORD_CHANNEL_ID) return;

        const botUserId = getBotUserId();
        const selfId = botUserId || client.user?.id;
        if (selfId && message.author.id === selfId) return;
        if (message.author.bot && !ALLOWED_BOT_IDS.includes(message.author.id)) return;

        const text = message.content.trim();
        if (!text) return;
        if (text.includes('[SYSTEM_OUTPUT]')) return;

        // Legacy !usage — masih support buat fallback
        if (text === '!usage') {
            const summary = await getUsageSummary();
            await message.channel.send(summary);
            return;
        }

        await message.channel.sendTyping();

        try {
            const ownerName = await getOwnerName();

            let replyContext = '';
            if (message.reference?.messageId) {
                try {
                    const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                    const repliedContent = repliedMsg.content;
                    if (!repliedContent.includes('[SYSTEM_OUTPUT]')) {
                        replyContext = `[${ownerName} me-reply pesan ini]: "${repliedContent}" (dari: ${repliedMsg.author.username})`;
                        console.log('[System] Reply detected:', replyContext);
                    } else {
                        console.log('[System] Reply ke SYSTEM_OUTPUT diabaikan — skip replyContext');
                    }
                } catch (e) {
                    console.error('[System] Gagal fetch replied message:', e.message);
                }
            }

            const fullText = replyContext ? `${replyContext}\n\n${text}` : text;

            await writeChatHistory(ownerName, fullText, message.id);

            const systemPrompt = await getSystemPrompt(false, text);
            const chatHistory  = await readChatHistory(text);
            const aiResponse   = await generateResponse(fullText, systemPrompt, chatHistory);

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
}

