// src/discord.js — entry point, thin wrapper
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { validateConfig } from './config.js';
import { runSummarizer } from './summarizer.js';
import { setupMessageHandler } from './handlers/message.js';
import { setupInteractionHandler } from './handlers/interactions.js';

import { rebuildIndex } from './file_index.js';

validateConfig();

// ─── Slash Commands ───────────────────────────────────────────
const commands = [
    new SlashCommandBuilder().setName('usage').setDescription('Liat usage model hari ini'),
    new SlashCommandBuilder().setName('model_list').setDescription('Lihat semua model tersedia per provider'),
    new SlashCommandBuilder()
        .setName('model')
        .setDescription('Switch model aktif')
        .addStringOption(opt =>
            opt.setName('provider')
                .setDescription('Pilih provider')
                .setRequired(true)
                .addChoices(
                    { name: '🔄 Auto (fallback chain)', value: 'auto' },
                    { name: '⚡ Groq', value: 'groq' },
                    { name: '✨ Google Gemini', value: 'gemini' },
                    { name: '🖥️ Nvidia NIM', value: 'nvidia' },
                    { name: '🌐 OpenRouter', value: 'openrouter' },
                )
        )
        .addStringOption(opt =>
            opt.setName('model')
                .setDescription('ID model (cek /model_list). Kosongkan untuk lihat model aktif.')
                .setRequired(false)
        ),
    new SlashCommandBuilder().setName('clear').setDescription('Clear chat history hari ini'),
].map(cmd => cmd.toJSON());

async function registerSlashCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
            { body: commands }
        );
        console.log('✅ Slash commands registered.');
    } catch (e) {
        console.error('⚠️ Gagal register slash commands:', e.message);
    }
}

// ─── Client ───────────────────────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

let botUserId = null;
const getBotUserId = () => botUserId;

client.on('ready', () => {
    botUserId = client.user.id;
    console.log(`Node.js ${process.version} | TPA Discord Ready`);
    console.log(`🤖 Freyana Online sebagai: ${client.user.tag}`);
    console.log('==========================================');
});

// ─── Handlers ─────────────────────────────────────────────────
setupMessageHandler(client, getBotUserId);
setupInteractionHandler(client);

// ─── Boot ─────────────────────────────────────────────────────
(async () => {
    try { await runSummarizer(); } catch (e) { console.error('⚠️ Summarizer error:', e.message); }
    try { await rebuildIndex(); } catch (e) { console.error('⚠️ FileIndex error:', e.message); }
    await client.login(process.env.DISCORD_BOT_TOKEN);
    await registerSlashCommands();
    setInterval(async () => {
        try { await runSummarizer(); } catch (e) { console.error('⚠️ Summarizer interval error:', e.message); }
    }, 10 * 60 * 1000);
})();

