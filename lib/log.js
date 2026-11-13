

// Prints the model's reply: only its text blocks (a reply can also hold tool_use and
// thinking blocks), or a note if the model declined.
export function logReply(response) {
  if (response.stop_reason === "refusal") {
    console.log("claude> [declined this request]");
    return;
  }
  for (const block of response.content) {
    if (block.type === "text") console.log("claude>", block.text);
  }
}

// Prints why the model stopped and how many tokens the call used.
export function logStats(response, messages) {
  const parts = [
    `stop_reason: ${response.stop_reason}`,          // why the model stopped
    `tokens in: ${response.usage.input_tokens}`,     // everything we SENT (system + whole history + tools)
    `tokens out: ${response.usage.output_tokens}`,   // everything the model GENERATED (incl. hidden thinking)
  ];

  // Only lessons with a conversation pass "messages" (Lesson 1 doesn't have one).
  if (messages) {
    parts.push(`history: ${messages.length} messages`);
  }

  console.log(`[stats] ${parts.join(" | ")}`);
}

// Prints one tool call that OUR code ran on the model's behalf (Lesson 3 onward).
//
// Example output:
//   [tool] lookup_port({"port":3389}) -> RDP
//   [tool] hash_text({"text":"hi","algorithm":"sha512"}) -> ERROR Error: unsupported algorithm: sha512
export function logToolCall(name, input, result, isError) {
  const status = isError ? "ERROR " : "";
  console.log(`[tool] ${name}(${JSON.stringify(input)}) -> ${status}${result}`);
}

// Marks the start of one model call inside the agent loop (Lesson 4 onward).
//
// Example output:
//   [agent] step 2/10
export function logStep(step, maxSteps) {
  console.log(`\n[agent] step ${step}/${maxSteps}`);
}

// Summarizes a whole agent run: why it ended, how many model calls it took, and the total tokens
// across all of those calls (each step resends the whole history, so totals grow fast).
//
// Example output:
//   [agent] finished: end_turn after 3 steps | total tokens in: 4210 | total tokens out: 650
export function logAgentDone(reason, steps, totals) {
  console.log(
    `[agent] finished: ${reason} after ${steps} steps | ` +
      `total tokens in: ${totals.in} | total tokens out: ${totals.out}`
  );
}
