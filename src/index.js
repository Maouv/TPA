import 'dotenv/config';
import readline from 'readline';
import { getSystemPrompt, readChatHistory, writeChatHistory } from './parser.js';
import { generateResponse } from './llm.js';
import { askClaude } from './llm_claude.js';
import { executeCommand } from './skills/terminal/index.js';
import { fetchWebPage } from './skills/browser/index.js';
import { readFile, writeFileWithPermission } from './skills/filemanager/index.js';
import { runSummarizer } from './summarizer.js';

if (!process.env.GEMINI_API_KEY) {
    console.error("❌ ERROR: GEMINI_API_KEY tidak ditemukan di environment!");
    console.error("Pastikan lu udah nambahin 'export GEMINI_API_KEY=...' di ~/.bashrc");
    process.exit(1);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n[Dafana] ❯ '
});

process.stdout.write('\x1Bc'); 
console.log(`Node.js ${process.version} | TPA Ready`);
console.log("==========================================");
console.log("🤖 Freyana (Termux Personal Agent) - ONLINE");
console.log("Ketik 'exit' atau 'quit' untuk mematikan.");
console.log("==========================================\n");

rl.prompt();

rl.on('line', async (input) => {
    const text = input.trim();
    
    if (text.toLowerCase() === 'exit' || text.toLowerCase() === 'quit') {
        console.log("Freyana offline. Bye!");
        process.exit(0);
    }

    if (text) {
        process.stdout.write("[System] Freyana lagi mikir... "); 
        
        try {
            await writeChatHistory('Dafana', text);

            let systemPrompt = await getSystemPrompt();
            let chatHistory = await readChatHistory();

            let aiResponse = await generateResponse(text, systemPrompt, chatHistory);

            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0);

            console.log(`[Freyana] ❯ ${aiResponse}`);
            await writeChatHistory('Freyana', aiResponse);

            // DETEKSI TAG SKILL
            const bashMatch = aiResponse.match(/<RUN_BASH>([\s\S]*?)<\/RUN_BASH>/);
            const fetchMatch = aiResponse.match(/<FETCH_URL>([\s\S]*?)<\/FETCH_URL>/);
            const readFileMatch = aiResponse.match(/<READ_FILE>([\s\S]*?)<\/READ_FILE>/);
            const writeFileMatch = aiResponse.match(/<WRITE_FILE\s+path="([^"]+)">([\s\S]*?)<\/WRITE_FILE>/);
            const askClaudeMatch = aiResponse.match(/<ASK_CLAUDE(?:\s+context="([^"]*)")?>([\s\S]*?)<\/ASK_CLAUDE>/);

            if (bashMatch) {
                const commandToRun = bashMatch[1].trim();
                const cmdResult = await executeCommand(commandToRun);
                
                const toolLog = `[SYSTEM_TOOL_RESULT]:\n${cmdResult}`;
                await writeChatHistory('System', toolLog);
                
                process.stdout.write("[System] Freyana lagi nganalisa output terminal... ");
                
                chatHistory = await readChatHistory();
                const followUpPrompt = "[System]: Berikut adalah hasil dari eksekusi terminal tadi. Berikan analisismu, penjelasan, atau konfirmasi ke Dafana berdasarkan output tersebut.";
                
                const finalResponse = await generateResponse(followUpPrompt, systemPrompt, chatHistory);
                
                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);
                
                console.log(`[Freyana] ❯ ${finalResponse}`);
                await writeChatHistory('Freyana', finalResponse);

            } else if (fetchMatch) {
                const urlToFetch = fetchMatch[1].trim();
                const fetchResult = await fetchWebPage(urlToFetch);
                
                const toolLog = `[SYSTEM_TOOL_RESULT]:\n${fetchResult}`;
                await writeChatHistory('System', toolLog);
                
                process.stdout.write("[System] Freyana lagi baca isi website... ");
                
                chatHistory = await readChatHistory();
                const followUpPrompt = "[System]: Berikut adalah isi teks dari URL yang lu baca tadi. Berikan rangkuman, jawaban, atau kesimpulan ke Dafana berdasarkan teks tersebut.";
                
                const finalResponse = await generateResponse(followUpPrompt, systemPrompt, chatHistory);
                
                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);
                
                console.log(`[Freyana] ❯ ${finalResponse}`);
                await writeChatHistory('Freyana', finalResponse);

            } else if (readFileMatch) {
                const filePath = readFileMatch[1].trim();
                const fileResult = await readFile(filePath);

                const toolLog = `[SYSTEM_TOOL_RESULT]:\n${fileResult}`;
                await writeChatHistory('System', toolLog);

                process.stdout.write(`[System] Freyana lagi nganalisa isi file ${filePath}... `);

                chatHistory = await readChatHistory();
                const followUpPrompt = `[System]: Berikut adalah isi file dari ${filePath}. Berikan rangkuman, jawaban, atau kesimpulan ke Dafana berdasarkan teks tersebut.`;

                const finalResponse = await generateResponse(followUpPrompt, systemPrompt, chatHistory);

                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);

                console.log(`[Freyana] ❯ ${finalResponse}`);
                await writeChatHistory('Freyana', finalResponse);

            } else if (writeFileMatch) {
                const filePath = writeFileMatch[1].trim();
                const fileContent = writeFileMatch[2]; // Don't trim to preserve formatting

                const writeResult = await writeFileWithPermission(filePath, fileContent);

                const toolLog = `[SYSTEM_TOOL_RESULT]:\n${writeResult}`;
                await writeChatHistory('System', toolLog);

                process.stdout.write(`[System] Freyana mengevaluasi hasil penulisan file... `);

                chatHistory = await readChatHistory();
                const followUpPrompt = `[System]: Berikut adalah status penulisan file ke ${filePath}. Berikan konfirmasi ke Dafana.`;

                const finalResponse = await generateResponse(followUpPrompt, systemPrompt, chatHistory);

                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);

                console.log(`[Freyana] ❯ ${finalResponse}`);
                await writeChatHistory('Freyana', finalResponse);
            } else if (askClaudeMatch) {
                const claudeContext = askClaudeMatch[1] || '';
                const claudeQuestion = askClaudeMatch[2].trim();

                process.stdout.write(`[System] Freyana lagi konsultasi ke Claude... `);

                const claudeAnswer = await askClaude(claudeQuestion, claudeContext);

                await writeChatHistory('Claude', claudeAnswer);

                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);

                console.log(`[Claude] ❯ ${claudeAnswer}`);

                chatHistory = await readChatHistory();
                const claudeFollowUp = `[System]: Claude sudah menjawab pertanyaanmu. Berikan kesimpulan atau langkah selanjutnya ke Dafana berdasarkan jawaban Claude tersebut.`;

                const claudeFinalResponse = await generateResponse(claudeFollowUp, systemPrompt, chatHistory);

                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);

                console.log(`[Freyana] ❯ ${claudeFinalResponse}`);
                await writeChatHistory('Freyana', claudeFinalResponse);
            }
            
        } catch (err) {
            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0);
            console.log(`\n⚠️ [SYSTEM_ERROR] ❯ Gagal memproses alur utama: ${err.message}`);
        }
    }
    
     (async () => {
        try {
            await runSummarizer();
        } catch (error) {
            console.error("⚠️ Summarizer error:", error.message);
        }
        rl.prompt();
    })();
}).on('close', () => {
    console.log("\nFreyana offline. Bye!");
    process.exit(0);
});

