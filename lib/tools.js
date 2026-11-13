// Shared tool-running code (Lesson 3 onward).
// Our code is the only thing that ever executes a tool, so this file is where later lessons add
// policy: blocking, approval prompts, limits.

import { logToolCall } from "./log.js";

// Runs ONE tool the model asked for. Never throws: failures become an error result the model
// can read and react to (retry, try another tool, or explain), instead of crashing the agent.
export function runTool(toolFunctions, name, input) {
  const fn = toolFunctions[name];
  if (!fn) {
    return { result: `Unknown tool: ${name}`, isError: true };
  }
  try {
    return { result: String(fn(input)), isError: false };
  } catch (err) {
    return { result: `Error: ${err.message}`, isError: true };
  }
}

// Runs EVERY tool_use block in a model reply and returns the matching tool_result blocks,
// ready to send back together in ONE user message (the rules from Lesson 3).
export function runToolCalls(content, toolFunctions) {
  const toolResults = [];
  for (const block of content) {
    if (block.type !== "tool_use") continue;
    const { result, isError } = runTool(toolFunctions, block.name, block.input);
    logToolCall(block.name, block.input, result, isError);
    toolResults.push({
      type: "tool_result",
      tool_use_id: block.id,
      content: result,
      is_error: isError,
    });
  }
  return toolResults;
}
