// Lesson 4: the agent loop. Ask the model -> run the tools it asks for -> send the results back ->
// repeat until it stops asking. Model + tools + this loop = an agent.
// Run with:  node 04-agent.js                (interactive; type "exit" to quit)
//       or:  node 04-agent.js "your task"    (one task, then exit)

import readline from "node:readline/promises";
import { createClient, MODEL } from "./lib/client.js";
import { logReply, logStats, logStep, logAgentDone } from "./lib/log.js";
import { runToolCalls } from "./lib/tools.js";

const client = createClient();

// Hard cap on model calls per task. Without it, a confused (or manipulated) model could keep
// asking for tools forever, and every step costs tokens.
const MAX_STEPS = 10;

// ---------------------------------------------------------------------------
// PART 1: A fake user directory, standing in for a real identity API.
// ---------------------------------------------------------------------------
const USERS = {
  u001: { name: "Priya Shah",    email: "priya.shah@example.com",    status: "ACTIVE",        department: "Security",    mfaFactors: ["okta_verify_push", "webauthn"], lastLogin: "2026-11-10" },
  u002: { name: "Marcus Lee",    email: "marcus.lee@example.com",    status: "ACTIVE",        department: "IT",          mfaFactors: [],                               lastLogin: "2026-11-12" },
  u003: { name: "Elena Novak",   email: "elena.novak@example.com",   status: "SUSPENDED",     department: "IT",          mfaFactors: [],                               lastLogin: "2026-04-02" },
  u004: { name: "Sam Okafor",    email: "sam.okafor@example.com",    status: "ACTIVE",        department: "Engineering", mfaFactors: ["sms"],                          lastLogin: "2026-06-20" },
  u005: { name: "Jordan Kim",    email: "jordan.kim@example.com",    status: "ACTIVE",        department: "Engineering", mfaFactors: ["okta_verify_push"],             lastLogin: "2026-11-11" },
  u006: { name: "Aisha Rahman",  email: "aisha.rahman@example.com",  status: "DEPROVISIONED", department: "Finance",     mfaFactors: [],                               lastLogin: "2025-12-15" },
  u007: { name: "Diego Alvarez", email: "diego.alvarez@example.com", status: "ACTIVE",        department: "Finance",     mfaFactors: [],                               lastLogin: "2026-07-01" },
  u008: { name: "Hannah Weber",  email: "hannah.weber@example.com",  status: "ACTIVE",        department: "Sales",       mfaFactors: ["webauthn"],                     lastLogin: "2026-11-09" },
};

const GROUPS = {
  Admins: ["u001", "u002", "u003", "u004"],
  Engineering: ["u004", "u005"],
  Finance: ["u006", "u007"],
  Everyone: Object.keys(USERS),
};

// ---------------------------------------------------------------------------
// PART 2: The tool functions. Tool results must be text; JSON is text the model reads well.
// All three are READ-ONLY: this agent can look things up but can't change anything.
// ---------------------------------------------------------------------------
function listUsers({ status }) {
  const users = Object.entries(USERS)
    .filter(([, user]) => !status || user.status === status)
    .map(([id, user]) => ({ id, name: user.name, status: user.status }));
  return JSON.stringify(users);
}

function getUser({ user_id }) {
  const user = USERS[user_id];
  if (!user) throw new Error(`No user with id "${user_id}"`);
  return JSON.stringify({ id: user_id, ...user });
}

function listGroupMembers({ group_name }) {
  const memberIds = GROUPS[group_name];
  if (!memberIds) {
    throw new Error(`No group named "${group_name}". Groups: ${Object.keys(GROUPS).join(", ")}`);
  }
  return JSON.stringify(memberIds.map((id) => ({ id, name: USERS[id].name })));
}

const TOOL_FUNCTIONS = {
  list_users: listUsers,
  get_user: getUser,
  list_group_members: listGroupMembers,
};

// ---------------------------------------------------------------------------
// PART 3: The tool definitions: all the model knows about these tools.
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    name: "list_users",
    description:
      "List users in the directory (id, name, status only). Optionally filter by status. " +
      "Use get_user for MFA, department, or last login details.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["ACTIVE", "SUSPENDED", "DEPROVISIONED"] },
      },
    },
  },
  {
    name: "get_user",
    description:
      "Get one user's full profile: email, status, department, enrolled MFA factors, last login date.",
    input_schema: {
      type: "object",
      properties: {
        user_id: { type: "string", description: "User id, e.g. u001" },
      },
      required: ["user_id"],
    },
  },
  {
    name: "list_group_members",
    description: "List the members (id and name) of a group, e.g. Admins or Engineering.",
    input_schema: {
      type: "object",
      properties: {
        group_name: { type: "string", description: "Exact group name, e.g. Admins" },
      },
      required: ["group_name"],
    },
  },
];

// The model has no clock: anything it needs from the outside world, including today's date,
// must be put into its context.
const today = new Date().toISOString().slice(0, 10);
const SYSTEM_PROMPT =
  "You are an identity security assistant with read-only access to the company user directory. " +
  "Use the tools to look up facts instead of guessing, and say so if the data can't answer the question. " +
  `Today's date is ${today}.`;

// ---------------------------------------------------------------------------
// PART 4: THE AGENT LOOP.
// The model decides which tools to call and when it's done. Our code decides whether tools
// actually run, and how many steps are allowed.
// ---------------------------------------------------------------------------
async function runAgent(messages) {
  const totals = { in: 0, out: 0 };

  for (let step = 1; step <= MAX_STEPS; step++) {
    logStep(step, MAX_STEPS);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: messages,
    });
    totals.in += response.usage.input_tokens;
    totals.out += response.usage.output_tokens;

    // Always save the reply first: tool results must point at requests already in the history.
    messages.push({ role: "assistant", content: response.content });
    logReply(response);
    logStats(response, messages);

    // The model wants tools: run them all, send every result back in ONE user message, go again.
    if (response.stop_reason === "tool_use") {
      const toolResults = runToolCalls(response.content, TOOL_FUNCTIONS);
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // A reply cut off by max_tokens may end in a half-written tool request. It can't be answered,
    // and an unanswered request makes the next call fail, so drop that reply from the history.
    if (response.stop_reason === "max_tokens" && response.content.some((b) => b.type === "tool_use")) {
      messages.pop();
    }

    // Anything else ends the task: end_turn (done), max_tokens (cut off), refusal (declined).
    logAgentDone(response.stop_reason, step, totals);
    return;
  }

  // Step limit reached. The history still ends with valid tool results, so a follow-up task
  // can continue from here.
  logAgentDone("step limit reached", MAX_STEPS, totals);
}

// ---------------------------------------------------------------------------
// PART 5: Two loops. The outer one is the conversation (one turn per task you type, as in
// Lesson 2). The inner one is the agent loop (as many steps as each task needs).
// The history is kept across tasks, so follow-up questions work.
// ---------------------------------------------------------------------------
const messages = [];
const task = process.argv[2];

if (task) {
  console.log("you>", task);
  messages.push({ role: "user", content: task });
  await runAgent(messages);
} else {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  while (true) {
    const userText = await terminal.question("\nyou> ");
    if (userText.trim() === "exit") break;
    messages.push({ role: "user", content: userText });
    await runAgent(messages);
  }
  terminal.close();
}
