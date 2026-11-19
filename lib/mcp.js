// MCP client side, shared from Lesson 5 onward: start/connect to an MCP server, translate its tools
// into the Claude API's tool format, and run tool calls on it.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { logToolCall } from "./log.js";

// Starts a local MCP server as a child process (stdio transport) and runs the initialize handshake.
// The server process does NOT inherit our environment variables (the SDK passes only a safe default
// set, like PATH and HOME), so it never sees ANTHROPIC_API_KEY unless we hand it over explicitly.
export async function connectToServer(command, args) {
  const transport = new StdioClientTransport({ command, args });
  const mcpClient = new Client({ name: "ai-learning-agent", version: "1.0.0" });
  await mcpClient.connect(transport);
  return mcpClient;
}

// tools/list → Claude API tool definitions.
// The two formats carry the same information with different field names:
//   MCP:        { name, description, inputSchema, annotations, ... }
//   Claude API: { name, description, input_schema }
// Only these three fields are sent to the model; annotations are for the client, not the model.
export async function listToolsForClaude(mcpClient) {
  const { tools } = await mcpClient.listTools();
  return tools.map((tool) => {
    const { $schema, ...inputSchema } = tool.inputSchema;
    return { name: tool.name, description: tool.description, input_schema: inputSchema };
  });
}

// Runs every tool_use block of a model reply on the MCP server (tools/call), and returns the
// matching tool_result blocks: one per request, matched by id, ready to send in one user message.
export async function runToolCallsOnServer(content, mcpClient) {
  const toolResults = [];
  for (const block of content) {
    if (block.type !== "tool_use") continue;

    let result, isError;
    try {
      const response = await mcpClient.callTool({ name: block.name, arguments: block.input });
      // An MCP result is a list of content blocks; ours only returns text, so join it into a string.
      result = response.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
      isError = response.isError === true;
    } catch (err) {
      // The connection itself failed (server crashed, timed out). Still answer the request.
      result = `MCP call failed: ${err.message}`;
      isError = true;
    }

    logToolCall(block.name, block.input, result, isError);
    toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result, is_error: isError });
  }
  return toolResults;
}
