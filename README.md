# AI agents & AI security: course code

Concept notes are in `notes/`, one file per lesson.

## 1. Install

```bash
cd ~/Downloads/claudetest/ai-learning
npm install
```

## 2. Add your API key

Create a file named `.env` in this folder (see `.env.example`):

```
ANTHROPIC_API_KEY=sk-...your-llm.atko.ai-key...
ANTHROPIC_BASE_URL=https://llm.atko.ai
```

## 3. Run a lesson

```bash
node 01-single-call.js
node 02-chat.js                 # type "exit" to quit
node 03-tools.js                # or: node 03-tools.js "your question"
node 04-agent.js                # or: node 04-agent.js "your task"
node 05-mcp-agent.js            # or: node 05-mcp-agent.js "your task"
```

To inspect the MCP server from Lesson 5 in a web UI:

```bash
npx @modelcontextprotocol/inspector node mcp-servers/directory.js
```

The model used by every lesson is set by `MODEL` in `lib/client.js`.
