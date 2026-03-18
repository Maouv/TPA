// src/handlers/interactions.js
import { getActiveModel, setActiveModel, resetToAuto, REGISTRY } from '../llm/index.js';
import { getUsageSummary } from '../usage_tracker.js';
import { WORKSPACE_DIR } from '../parser.js';
import fs from 'fs/promises';
import path from 'path';

function getTodayDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function setupInteractionHandler(client) {
    client.on('interactionCreate', async (interaction) => {
        if (interaction.channelId !== process.env.DISCORD_CHANNEL_ID) return;

        // ── Slash Commands ────────────────────────────────────
        if (interaction.isChatInputCommand()) {

            if (interaction.commandName === 'model_list') {
                await interaction.deferReply();
                const lines = [];
                for (const [, provider] of Object.entries(REGISTRY)) {
                    lines.push(`${provider.emoji} **${provider.name}**`);
                    for (const m of provider.models) {
                        lines.push(`• \`${m.id}\` — ${m.label}`);
                    }
                    lines.push('');
                }
                await interaction.editReply(lines.join('\n'));

            } else if (interaction.commandName === 'usage') {
                await interaction.deferReply();
                const summary = await getUsageSummary();
                await interaction.editReply(summary);

            } else if (interaction.commandName === 'model') {
                await interaction.deferReply({ ephemeral: true });
                const providerKey = interaction.options.getString('provider');
                const modelId     = interaction.options.getString('model');

                // Cek model aktif saja (tidak ada input model)
                if (providerKey === 'auto') {
                    resetToAuto();
                    await interaction.editReply('✅ Model direset ke **Auto** (fallback chain).');
                    return;
                }

                if (!modelId) {
                    const current = getActiveModel();
                    const currentLabel = current
                        ? `${REGISTRY[current.providerKey].emoji} **${current.label}** (${current.providerKey})`
                        : '🔄 **Auto** (fallback chain)';
                    await interaction.editReply(`🤖 Model aktif: ${currentLabel}\n\nKetik \`/model_list\` untuk lihat semua model, lalu ulangi command ini dengan isi field **model**.`);
                    return;
                }

                try {
                    setActiveModel(providerKey, modelId);
                    const model = REGISTRY[providerKey].models.find(m => m.id === modelId);
                    await interaction.editReply(`✅ Model switched ke **${model?.label || modelId}** (${providerKey})`);
                } catch (e) {
                    await interaction.editReply(`❌ ${e.message}\n\nCek \`/model_list\` untuk ID model yang valid.`);
                }

            } else if (interaction.commandName === 'clear') {
                await interaction.deferReply();
                try {
                    const dateStr = getTodayDate();
                    const memFile = path.join(WORKSPACE_DIR, 'memory', `${dateStr}.md`);
                    await fs.writeFile(memFile, '', 'utf-8');
                    await interaction.editReply(`🗑️ Chat history hari ini (${dateStr}) sudah di-clear.`);
                } catch (e) {
                    await interaction.editReply(`❌ Gagal clear history: ${e.message}`);
                }
            }
        }

    });
}

