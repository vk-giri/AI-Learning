// The agent loop from Lesson 4, shared from Lesson 5 onward.
// The loop doesn't care where tools come from: the caller passes in `executeTools`, which turns a
// reply's tool_use blocks into tool_result blocks (local functions, an MCP server, ...).

import { MODEL } from "./client.js";
import { logReply, logStats, logStep, logAgentDone } from "./log.js";

export async function runAgent({ client, system, tools, messages, executeTools, maxSteps = 10 }) {
  const totals = { in: 0, out: 0 };

  for (let step = 1; step <= maxSteps; step++) {
    logStep(step, maxSteps);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system,
      tools,
      messages,
    });
    totals.in += response.usage.input_tokens;
    totals.out += response.usage.output_tokens;

    // Save the reply first: tool results must point at requests already in the history.
    messages.push({ role: "assistant", content: response.content });
    logReply(response);
    logStats(response, messages);

    if (response.stop_reason === "tool_use") {
      const toolResults = await executeTools(response.content);
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // A reply cut off mid tool request can't be answered; drop it so the next call doesn't fail.
    if (response.stop_reason === "max_tokens" && response.content.some((b) => b.type === "tool_use")) {
      messages.pop();
    }

    logAgentDone(response.stop_reason, step, totals);
    return;
  }

  logAgentDone("step limit reached", maxSteps, totals);
}
