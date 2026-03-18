// src/skills/executor.js
// Shared logic untuk deteksi dan eksekusi skill tags
// Dipakai oleh discord.js dan index.js — tidak ada duplikasi

import { generateResponse } from '../llm.js';
import { askClaude } from '../llm_claude.js';
import { askDeepSeek, askQwen } from '../llm_nvidia.js';
import { executeCommand } from './terminal/index.js';
import { fetchWebPage } from './browser/index.js';
import { readFile, writeFileWithPermission } from './filemanager/index.js';
import { writeChatHistory, readChatHistory, invalidatePromptCache } from '../parser.js';

// ─── Tag Patterns ────────────────────────────────────────────
export const TAGS = {
    RUN_BASH:    /<RUN_BASH>([\s\S]*?)<\/RUN_BASH>/,
    FETCH_URL:   /<FETCH_URL>([\s\S]*?)<\/FETCH_URL>/,
    READ_FILE:   /<READ_FILE>([\s\S]*?)<\/READ_FILE>/,
    WRITE_FILE:  /<WRITE_FILE\s+path="([^"]+)">([\s\S]*?)<\/WRITE_FILE>/,
    ASK_CLAUDE:  /<ASK_CLAUDE(?:\s+context="([^"]*)")?>([\s\S]*?)<\/ASK_CLAUDE>/,
    ASK_DEEPSEEK:/<ASK_DEEPSEEK(?:\s+context="([^"]*)")?>([\s\S]*?)<\/ASK_DEEPSEEK>/,
    ASK_QWEN:    /<ASK_QWEN(?:\s+context="([^"]*)")?>([\s\S]*?)<\/ASK_QWEN>/,
};

// Strip semua tag executable dari response sebelum dikirim ke Discord
// Mencegah finalResponse yang mengandung tag trigger loop baru
function stripTags(text) {
    return text
        .replace(/<RUN_BASH>[\s\S]*?<\/RUN_BASH>/g, '')
        .replace(/<FETCH_URL>[\s\S]*?<\/FETCH_URL>/g, '')
        .replace(/<READ_FILE>[\s\S]*?<\/READ_FILE>/g, '')
        .replace(/<WRITE_FILE[^>]*>[\s\S]*?<\/WRITE_FILE>/g, '')
        .replace(/<ASK_CLAUDE[^>]*>[\s\S]*?<\/ASK_CLAUDE>/g, '')
        .replace(/<ASK_DEEPSEEK[^>]*>[\s\S]*?<\/ASK_DEEPSEEK>/g, '')
        .replace(/<ASK_QWEN[^>]*>[\s\S]*?<\/ASK_QWEN>/g, '')
        .trim();
}
function sanitizeCommand(raw) {
    return raw
        .trim()
        .replace(/^```(?:bash)?\n?/i, '')
        .replace(/\n?```$/i, '')
        .replace(/`/g, '')
        .trim();
}

// ─── Core Executor ───────────────────────────────────────────
// notify: fungsi async untuk kirim pesan/status ke user (beda di CLI vs Discord)
// askPermission: fungsi async untuk minta konfirmasi Y/N (beda di CLI vs Discord)

export async function executeSkills(aiResponse, systemPrompt, ownerName, { notify, askPermission }) {
    const bashMatch      = aiResponse.match(TAGS.RUN_BASH);
    const fetchMatch     = aiResponse.match(TAGS.FETCH_URL);
    const readFileMatch  = aiResponse.match(TAGS.READ_FILE);
    const writeFileMatch = aiResponse.match(TAGS.WRITE_FILE);
    const askClaudeMatch = aiResponse.match(TAGS.ASK_CLAUDE);
    const askDeepSeekMatch = aiResponse.match(TAGS.ASK_DEEPSEEK);
    const askQwenMatch   = aiResponse.match(TAGS.ASK_QWEN);

    // ── RUN_BASH ──────────────────────────────────────────────
    if (bashMatch) {
        const commandToRun = sanitizeCommand(bashMatch[1]);
        const isAllowed = await askPermission(commandToRun, 'TERMINAL');

        let cmdResult = '[SYSTEM_LOG] Operasi terminal dibatalkan oleh user (N).';
        if (isAllowed) {
            cmdResult = await executeCommand(commandToRun, true);
        }

        await writeChatHistory('System', `[SYSTEM_TOOL_RESULT]:\n${cmdResult}`);
        const chatHistory = await readChatHistory();

        const followUpPrompt = isAllowed
            ? '[System]: Perintah terminal sudah dieksekusi. Beritahu user hasilnya dengan singkat. JANGAN generate tag atau perintah baru apapun. Hanya konfirmasi hasil eksekusi.'
            : `[System]: ${ownerName} menolak eksekusi perintah terminal (menekan 'N'). Itu adalah inisiatif LU sendiri sebagai AI, bukan permintaan ${ownerName}. JANGAN salahkan atau ceramahi ${ownerName}. JANGAN generate tag atau perintah baru. Cukup acknowledge penolakan dengan singkat dan tanya mau lanjut ngapain.`;

        const finalResponse = await generateResponse(followUpPrompt, systemPrompt, chatHistory);
        await writeChatHistory('Freyana', finalResponse);
        await notify(stripTags(finalResponse));
        return;
    }

    // ── FETCH_URL ─────────────────────────────────────────────
    if (fetchMatch) {
        const urlToFetch = fetchMatch[1].trim();
        await notify('🌐 *Freyana lagi baca isi website...*');
        const fetchResult = await fetchWebPage(urlToFetch);

        await writeChatHistory('System', `[SYSTEM_TOOL_RESULT]:\n${fetchResult}`);
        const chatHistory = await readChatHistory();
        const followUpPrompt = '[System]: Berikut adalah isi teks dari URL yang lu baca tadi. Berikan rangkuman, jawaban, atau kesimpulan ke user berdasarkan teks tersebut.';

        const finalResponse = await generateResponse(followUpPrompt, systemPrompt, chatHistory);
        await writeChatHistory('Freyana', finalResponse);
        await notify(stripTags(finalResponse));
        return;
    }

    // ── READ_FILE ─────────────────────────────────────────────
    if (readFileMatch) {
        const filePath = readFileMatch[1].trim();
        const fileResult = await readFile(filePath);

        await writeChatHistory('System', `[SYSTEM_TOOL_RESULT]:\n${fileResult}`);
        const chatHistory = await readChatHistory();
        const followUpPrompt = `[System]: Berikut adalah isi file dari ${filePath}. Berikan rangkuman, jawaban, atau kesimpulan ke user berdasarkan teks tersebut.`;

        const finalResponse = await generateResponse(followUpPrompt, systemPrompt, chatHistory);
        await writeChatHistory('Freyana', finalResponse);
        await notify(stripTags(finalResponse));
        return;
    }

    // ── WRITE_FILE ────────────────────────────────────────────
    if (writeFileMatch) {
        const filePath    = writeFileMatch[1].trim();
        const fileContent = writeFileMatch[2];
        const isAllowed   = await askPermission(filePath, 'WRITE_FILE', fileContent);

        let writeResult = `[SYSTEM_LOG] Operasi WRITE file dibatalkan oleh user (N).`;
        if (isAllowed) {
            writeResult = await writeFileWithPermission(filePath, fileContent, true);
            invalidatePromptCache();
        }

        await writeChatHistory('System', `[SYSTEM_TOOL_RESULT]:\n${writeResult}`);
        const chatHistory = await readChatHistory();

        const followUpPrompt = isAllowed
            ? `[System]: File ${filePath} berhasil ditulis. Konfirmasi ke user dengan singkat. JANGAN baca file itu lagi, JANGAN generate tag apapun, JANGAN lakukan aksi lanjutan tanpa diminta.`
            : `[System]: ${ownerName} menolak penulisan file ${filePath} (menekan 'N'). Itu inisiatif LU sendiri. JANGAN ceramahi ${ownerName}. JANGAN generate tag atau aksi baru. Acknowledge penolakan singkat dan tanya mau ngapain.`;

        const finalResponse = await generateResponse(followUpPrompt, systemPrompt, chatHistory);
        await writeChatHistory('Freyana', finalResponse);
        await notify(stripTags(finalResponse));
        return;
    }

    // ── ASK_CLAUDE ────────────────────────────────────────────
    if (askClaudeMatch) {
        const claudeContext  = askClaudeMatch[1] || '';
        const claudeQuestion = askClaudeMatch[2].trim();

        await notify('🤖 *Freyana lagi konsultasi ke Claude...*');
        const claudeAnswer = await askClaude(claudeQuestion, claudeContext);
        await writeChatHistory('Claude', claudeAnswer);
        await notify(`**[Claude]** ${claudeAnswer}`);

        const chatHistory = await readChatHistory();
        const followUp = '[System]: Claude sudah menjawab. Berikan kesimpulan atau langkah selanjutnya ke user.';
        const finalResponse = await generateResponse(followUp, systemPrompt, chatHistory);
        await writeChatHistory('Freyana', finalResponse);
        await notify(stripTags(finalResponse));
        return;
    }

    // ── ASK_DEEPSEEK ──────────────────────────────────────────
    if (askDeepSeekMatch) {
        const dsContext  = askDeepSeekMatch[1] || '';
        const dsQuestion = askDeepSeekMatch[2].trim();

        await notify('🧠 *Freyana lagi konsultasi ke DeepSeek...*');
        const dsAnswer = await askDeepSeek(dsQuestion, dsContext);
        await writeChatHistory('DeepSeek', dsAnswer);
        await notify(`**[DeepSeek]** ${dsAnswer}`);

        const chatHistory = await readChatHistory();
        const followUp = '[System]: DeepSeek sudah menjawab. Berikan kesimpulan atau langkah selanjutnya ke user.';
        const finalResponse = await generateResponse(followUp, systemPrompt, chatHistory);
        await writeChatHistory('Freyana', finalResponse);
        await notify(stripTags(finalResponse));
        return;
    }

    // ── ASK_QWEN ──────────────────────────────────────────────
    if (askQwenMatch) {
        const qwenContext  = askQwenMatch[1] || '';
        const qwenQuestion = askQwenMatch[2].trim();

        await notify('🧬 *Freyana lagi konsultasi ke Qwen...*');
        const qwenAnswer = await askQwen(qwenQuestion, qwenContext);
        await writeChatHistory('Qwen', qwenAnswer);
        await notify(`**[Qwen]** ${qwenAnswer}`);

        const chatHistory = await readChatHistory();
        const followUp = '[System]: Qwen sudah menjawab. Berikan kesimpulan atau langkah selanjutnya ke user.';
        const finalResponse = await generateResponse(followUp, systemPrompt, chatHistory);
        await writeChatHistory('Freyana', finalResponse);
        await notify(stripTags(finalResponse));
        return;
    }

    // ── No tag — kirim langsung ───────────────────────────────
    await notify(aiResponse);
}

