// Lesson 3: tools. The model ASKS our code to run a function; our code runs it and sends back the result.
// Run with:  node 03-tools.js
//       or:  node 03-tools.js "your own question here"

// Node's built-in crypto module, used by our hash_text tool.
import { createHash } from "node:crypto";
import { createClient, MODEL } from "./lib/client.js";
import { logReply, logStats, logToolCall } from "./lib/log.js";

const client = createClient();

// ---------------------------------------------------------------------------
// PART 1: The real functions. Ordinary JavaScript. The model never sees this code.
// ---------------------------------------------------------------------------
const COMMON_PORTS = {
  22: "SSH", 25: "SMTP", 53: "DNS", 80: "HTTP", 389: "LDAP",
  443: "HTTPS", 636: "LDAPS", 3306: "MySQL", 3389: "RDP", 5432: "PostgreSQL",
};

// Each function receives ONE object: the "input" the model filled in.
// { port } pulls the "port" property out of that object.
function lookupPort({ port }) {
  // "??" means: if the left side is missing, use the right side instead.
  return COMMON_PORTS[port] ?? "unknown (not in our local table)";
}

function hashText({ text, algorithm }) {
  // Never trust the model's input blindly: check it, like any input from outside.
  if (!["md5", "sha1", "sha256"].includes(algorithm)) {
    throw new Error(`unsupported algorithm: ${algorithm}`);
  }
  return createHash(algorithm).update(text).digest("hex");
}

// Maps the tool NAME the model uses to the function we actually run.
const TOOL_FUNCTIONS = {
  lookup_port: lookupPort,
  hash_text: hashText,
};

// ---------------------------------------------------------------------------
// PART 2: The tool definitions. This is ALL the model knows about our tools.
// The model decides whether and how to call a tool based only on name + description + schema.
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    name: "lookup_port",
    description: "Look up the well-known service name for a TCP port number.",
    // A JSON Schema: describes the input object the model must send.
    input_schema: {
      type: "object",
      properties: {
        port: { type: "integer", description: "TCP port number, e.g. 443" },
      },
      required: ["port"],
    },
  },
  {
    name: "hash_text",
    description: "Compute the hex digest (hash) of a piece of text.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The text to hash" },
        algorithm: { type: "string", enum: ["md5", "sha1", "sha256"] },
      },
      required: ["text", "algorithm"],
    },
  },
];

// ---------------------------------------------------------------------------
// PART 3: Running a tool the model asked for. OUR code decides what actually happens.
// ---------------------------------------------------------------------------
function runTool(name, input) {
  const fn = TOOL_FUNCTIONS[name];
  if (!fn) {
    return { result: `Unknown tool: ${name}`, isError: true };
  }
  try {
    return { result: String(fn(input)), isError: false };
  } catch (err) {
    // Report the failure back to the model instead of crashing the program.
    return { result: `Error: ${err.message}`, isError: true };
  }
}

// ---------------------------------------------------------------------------
// PART 4: The conversation: two calls to the model.
// ---------------------------------------------------------------------------
// process.argv holds the command-line words; [2] is the first word after "node 03-tools.js".
const question =
  process.argv[2] ?? "What service runs on port 3389, and what is the sha256 hash of the word hello?";
console.log("you>", question);

const messages = [{ role: "user", content: question }];

// CALL 1: send the question AND the list of tools.
const first = await client.messages.create({
  model: MODEL,
  max_tokens: 2000,
  tools: TOOLS,
  messages: messages,
});
messages.push({ role: "assistant", content: first.content });
logReply(first); // sometimes the model says a sentence before asking for tools
logStats(first, messages);

// If the model didn't ask for a tool, it answered directly (or declined). Nothing more to do.
if (first.stop_reason !== "tool_use") {
  process.exit(0);
}

// The model asked for one or more tools. Run EACH one and collect the results.
const toolResults = [];
for (const block of first.content) {
  if (block.type === "tool_use") {
    const { result, isError } = runTool(block.name, block.input);
    logToolCall(block.name, block.input, result, isError);
    toolResults.push({
      type: "tool_result",
      tool_use_id: block.id, // must match the id of the request it answers
      content: result,
      is_error: isError,
    });
  }
}

// Send ALL results back together, in ONE user message.
messages.push({ role: "user", content: toolResults });

// CALL 2: same tools, now with the results in the history. The model writes its answer.
const second = await client.messages.create({
  model: MODEL,
  max_tokens: 2000,
  tools: TOOLS,
  messages: messages,
});
messages.push({ role: "assistant", content: second.content });
logReply(second);
logStats(second, messages);

if (second.stop_reason === "tool_use") {
  console.log("(The model wants MORE tools. Handling that automatically is the agent loop: Lesson 4.)");
}
