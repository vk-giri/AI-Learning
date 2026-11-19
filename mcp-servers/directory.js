// An MCP server that exposes the user directory from Lesson 4 as tools.
// It knows nothing about Claude or any model: it just answers MCP requests from whichever client
// connects (our agent, Claude Code, the MCP Inspector, ...).
//
// Transport: stdio. The client starts this file as a child process and they exchange JSON-RPC
// messages over stdin/stdout. So stdout belongs to the protocol: anything else printed there
// corrupts the message stream. Logs must go to stderr (console.error), never console.log.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

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

// Name and version are sent to the client during the initialize handshake.
const server = new McpServer({ name: "directory", version: "1.0.0" });

// Every MCP tool result has the same shape: a list of content blocks, plus isError on failure.
function textResult(data) {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}
function errorResult(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

// registerTool(name, definition, handler).
// The definition is what clients see in tools/list, and what ends up in front of the model:
// - description: the model reads this to decide when to use the tool
// - inputSchema: validated by the SDK before the handler runs; sent to clients as JSON Schema
// - annotations: HINTS about behavior. readOnlyHint: true claims the tool changes nothing. A
//   client can use this to decide what needs approval, but it's the server's claim, not a guarantee.
server.registerTool(
  "list_users",
  {
    description:
      "List users in the directory (id, name, status only). Optionally filter by status. " +
      "Use get_user for MFA, department, or last login details.",
    inputSchema: {
      status: z.enum(["ACTIVE", "SUSPENDED", "DEPROVISIONED"]).optional(),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ status }) => {
    const users = Object.entries(USERS)
      .filter(([, user]) => !status || user.status === status)
      .map(([id, user]) => ({ id, name: user.name, status: user.status }));
    return textResult(users);
  }
);

server.registerTool(
  "get_user",
  {
    description:
      "Get one user's full profile: email, status, department, enrolled MFA factors, last login date.",
    inputSchema: {
      user_id: z.string().describe("User id, e.g. u001"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ user_id }) => {
    const user = USERS[user_id];
    if (!user) return errorResult(`No user with id "${user_id}"`);
    return textResult({ id: user_id, ...user });
  }
);

server.registerTool(
  "list_group_members",
  {
    description: "List the members (id and name) of a group, e.g. Admins or Engineering.",
    inputSchema: {
      group_name: z.string().describe("Exact group name, e.g. Admins"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ group_name }) => {
    const memberIds = GROUPS[group_name];
    if (!memberIds) {
      return errorResult(`No group named "${group_name}". Groups: ${Object.keys(GROUPS).join(", ")}`);
    }
    return textResult(memberIds.map((id) => ({ id, name: USERS[id].name })));
  }
);

// Start answering requests on stdin/stdout. The process stays alive until the client disconnects.
await server.connect(new StdioServerTransport());
console.error("[directory server] ready on stdio");
