import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { connectToServer, listToolsForClaude, runToolCallsOnServer } from "./lib/mcp.js";
import { createClient } from "./lib/client.js";
import { runAgent } from "./lib/agent.js";


const serverPath = fileURLToPath(new URL("./mcp-servers/okta.js", import.meta.url));
const mcpClient = await connectToServer("node", [serverPath])
const serverDetails = mcpClient.getServerVersion();
console.log(`[mcp] connected to "${serverDetails.name}" v${serverDetails.version}`);

const tools = await listToolsForClaude(mcpClient);
console.log(`[mcp] tools: ${tools.map((t) => t.name).join(", ")}`);


const client = createClient();
const today = new Date().toISOString().slice(0, 10);
const SYSTEM_PROMPT =
  "You are an Okta administrator assistant for a TEST Okta org. You can list, create, deactivate, " +
  "and delete users using the tools. " +
  "Look users up before acting on them, and never guess an id or login. " +
  "Deleting is a two-step process: deactivate the user first, then delete. " +
  "Before any change, say which user it affects and why. Every change is shown to a human for approval. " +
  "Use the tools to look up facts instead of guessing, and say so if the data can't answer the question. " +
  `Today's date is ${today}.`;

const agentOptions = {
  client, 
  system: SYSTEM_PROMPT,
  tools,
  executeTools: (content) => runToolCallsOnServer(content, mcpClient)
}

const messages = []
const task = process.argv[2];

if (task) {
  console.log("Human>", task)
  messages.push({role: "user", content: task})
  await runAgent({...agentOptions, messages});
} else {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });

  while (true) {
    const userText = await terminal.question("\nHuman> ");

    if (userText.trim() === 'exit') break;

    messages.push({role: "user", content: userText});
    await runAgent({...agentOptions, messages})
  }

  terminal.close();
}

await mcpClient.close()