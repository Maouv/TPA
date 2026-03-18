<div align="center">

# Freya

**A self-hosted AI agent that lives in your Discord server.**

[![Node.js](https://img.shields.io/badge/Node.js-v22+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Discord.js](https://img.shields.io/badge/Discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.js.org)
[![License](https://img.shields.io/badge/License-ISC-blue?style=flat-square)](LICENSE)

</div>

---

## Overview

Freya is a VPS-hosted Discord bot powered by a multi-provider LLM chain. It responds to natural language, executes terminal commands with human-in-the-loop confirmation, manages files, browses the web, and delegates to specialized AI models — all from a single Discord channel.

## Features

| Feature | Description |
|---|---|
| 💬 **Natural conversation** | Persistent memory via daily logs + semantic search |
| ⚡ **Terminal execution** | Run bash commands with ✅/❌ reaction confirmation |
| 📁 **File management** | Read & write files in a sandboxed workspace |
| 🌐 **Web browsing** | Fetch and summarize static web pages |
| 🧠 **Multi-model second brain** | Delegate to DeepSeek, Qwen, or Claude on demand |
| 🔄 **Live model switching** | Switch LLM provider mid-conversation via `/model` |
| 📊 **Usage tracking** | Daily token and request tracking per provider |

## LLM Chain

Freya uses a cascading fallback chain to maximize uptime:

```
Groq (primary) → Gemini → Qwen (Nvidia NIM) → DeepSeek (Nvidia NIM)
```

Additional providers available via `/model`:

| Provider | Models |
|---|---|
| **Groq** | Kimi K2, Llama 3.3 70B, Llama 4 Scout, Qwen3 32B |
| **Google Gemini** | Gemini 2.5 Flash, Gemini 2.5 Flash Lite, Gemini 3 Flash |
| **Nvidia NIM** | DeepSeek V3.2, Qwen 3.5 122B, GLM 4.7, MiniMax M2.1, and more |
| **OpenRouter** | Nemotron 3 Super 120B, Step 3.5 Flash, GLM 4.5 Air, Hunter Alpha |

## Commands

| Command | Description |
|---|---|
| `/model` | Switch the active LLM provider and model |
| `/model_list` | View all available models per provider |
| `/usage` | View daily token and request usage |
| `/clear` | Clear today's chat history |

## Project Structure

```
Freya/
├── src/
│   ├── handlers/
│   │   ├── message.js        # Discord message handler
│   │   └── interactions.js   # Slash command & interaction handler
│   ├── llm/
│   │   ├── providers/        # groq, gemini, nvidia, openrouter, claude
│   │   ├── registry.js       # Provider & model registry
│   │   ├── chain.js          # Fallback chain + model switch logic
│   │   └── index.js          # Single export interface
│   ├── skills/
│   │   ├── terminal/         # RUN_BASH executor
│   │   ├── browser/          # FETCH_URL executor
│   │   ├── filemanager/      # READ_FILE / WRITE_FILE executor
│   │   └── executor.js       # Unified skill tag handler
│   ├── discord.js            # Entry point
│   ├── parser.js             # System prompt builder + memory
│   ├── embeddings.js         # Semantic search via Gemini embeddings
│   ├── summarizer.js         # Daily log summarizer
│   ├── usage_tracker.js      # Token usage tracking
│   └── config.js             # Centralized configuration
└── workspace/
    ├── SOUL.md               # Persona definition
    ├── AGENTS.md             # Behavioral rules
    ├── USER.md               # User context
    ├── MEMORY.md             # Long-term memory
    ├── skills/               # Skill documentation (read by LLM)
    └── files/                # Sandboxed file workspace
```

## Setup

### Prerequisites
- Node.js v22+
- A Discord bot token with Message Content Intent enabled
- At least one LLM API key (Gemini recommended as fallback)

### Installation

```bash
git clone https://github.com/Maouv/Freya.git
cd Freya
npm install
cp .env.example .env
```

### Configuration

Fill in `.env`:

```env
# Required
DISCORD_BOT_TOKEN=
DISCORD_CHANNEL_ID=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
GEMINI_API_KEY=

# Optional — extends fallback chain
GROQ_API_KEY_1=
GROQ_API_KEY_2=
NVIDIA_API_KEY_1=
OPENROUTER_API_KEY=
ANTHROPIC_API_KEY=
```

### Run

```bash
node src/discord.js
```

For persistent execution, use `tmux` or `screen`:

```bash
tmux new -s freya
node src/discord.js
# Ctrl+B then D to detach
```

## License

ISC

