// Lesson 5: the same agent as Lesson 4, but the tools now live in a separate MCP server
// (mcp-servers/directory.js). This file has no tool code at all: it discovers the tools at startup.
// Run with:  node 05-mcp-agent.js                (interactive; type "exit" to quit)
//       or:  node 05-mcp-agent.js "your task"    (one task, then exit)

import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "./lib/client.js";
import { runAgent } from "./lib/agent.js";
import { connectToServer, listToolsForClaude, runToolCallsOnServer } from "./lib/mcp.js";

const client = createClient();

// 1. Start the MCP server as a child process and do the initialize handshake.
const serverPath = fileURLToPath(new URL("./mcp-servers/directory.js", import.meta.url));
const mcpClient = await connectToServer("node", [serverPath]);
const server = mcpClient.getServerVersion();
console.log(`[mcp] connected to "${server.name}" v${server.version}`);

// 2. Ask the server what tools it has (tools/list), translated to the Claude API format.
//    Whatever the server says here is exactly what the model will read.
const tools = await listToolsForClaude(mcpClient);
console.log(`[mcp] tools: ${tools.map((t) => t.name).join(", ")}`);

const today = new Date().toISOString().slice(0, 10);
const SYSTEM_PROMPT =
  "You are an identity security assistant with read-only access to the company user directory. " +
  "Use the tools to look up facts instead of guessing, and say so if the data can't answer the question. " +
  `Today's date is ${today}.`;

// 3. Run the agent loop. The only difference from Lesson 4: tool calls go to the MCP server
//    (tools/call) instead of local functions.
const agentOptions = {
  client,
  system: SYSTEM_PROMPT,
  tools,
  executeTools: (content) => runToolCallsOnServer(content, mcpClient),
};

const messages = [];
const task = process.argv[2];

if (task) {
  console.log("you>", task);
  messages.push({ role: "user", content: task });
  await runAgent({ ...agentOptions, messages });
} else {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  while (true) {
    const userText = await terminal.question("\nyou> ");
    if (userText.trim() === "exit") break;
    messages.push({ role: "user", content: userText });
    await runAgent({ ...agentOptions, messages });
  }
  terminal.close();
}

// 4. Disconnect. With stdio, this also stops the server process.
await mcpClient.close();
