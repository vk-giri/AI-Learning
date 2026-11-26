import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(ENV_PATH)) {
  process.loadEnvFile(ENV_PATH);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Add ${name}=... to ai-learning/.env`);
  }
  return value;
}

const OKTA_ORG_URL = requireEnv('OKTA_ORG_URL');
const OKTA_API_TOKEN = requireEnv('OKTA_API_TOKEN');

async function oktaAPI(method, path, { query, body } = {}) {
  const url = new URL(path, OKTA_ORG_URL);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `SSWS ${OKTA_API_TOKEN}`,
      Accept: 'application/json',
      ...(body && { 'Content-Type': 'application/json' }),
    },
    body: body ? JSON.stringify(body) : undefined,
    // A hung request would hang the whole agent loop.
    signal: AbortSignal.timeout(15_000),
  });

  // Some calls (DELETE, adding a user to a group) return an empty body.
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`Okta ${response.status}: ${data?.errorSummary ?? response.statusText}`);
  }

  return data;
}

// Name and version are sent to the client during the initialize handshake.
const server = new McpServer({ name: 'vivek-okta', version: '0.0.1' });

// MCP tool results must be { content: [...] }; isError: true marks a failure.
function textResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function errorResult(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

// Raw Okta objects are large (_links, credentials, timestamps) and every tool result is resent
// on each agent step. Keep only what the model needs: less cost, less data exposed.
function trimUser(user) {
  return {
    id: user.id,
    status: user.status,
    login: user.profile?.login,
    email: user.profile?.email,
    firstName: user.profile?.firstName,
    lastName: user.profile?.lastName,
    department: user.profile?.department,
    lastLogin: user.lastLogin,
  };
}

function trimGroup(group) {
  return {
    id: group.id,
    name: group.profile?.name,
    description: group.profile?.description,
    type: group.type,
  };
}


// List Okta users
server.registerTool(
  'list_users',
  {
    description:
      'List users in the Okta org (up to `limit`, default 25). Optionally filter by status. ' +
      'Use get_user to look up one user by id or login, and search_users to find users by ' +
      'email, name, or department.',
    inputSchema: {
      status: z
        .enum(['STAGED', 'PROVISIONED', 'ACTIVE', 'RECOVERY', 'PASSWORD_EXPIRED', 'LOCKED_OUT', 'SUSPENDED', 'DEPROVISIONED'])
        .optional(),
      limit: z.number().int().min(1).max(100).optional().describe('Max users to return, default 25'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ status, limit = 25 }) => {
    try {
      // status comes from the enum above, so it's safe to put into the search expression.
      const users = await oktaAPI('GET', '/api/v1/users', {
        query: { limit, search: status ? `status eq "${status}"` : undefined },
      });
      return textResult(users.map(trimUser));
    } catch (err) {
      return errorResult(err.message);
    }
  }
);


// Create Okta user
server.registerTool(
  'create_user',
  {
    description:
      'Create a new user in the Okta org, in STAGED status: the account exists but no email is ' +
      'sent and the user cannot sign in yet. Use activate_user afterwards to activate it. ' +
      'Check with get_user first that the login is not already taken.',
    inputSchema: {
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.email(),
      login: z.email().optional().describe('Okta login, defaults to the email'),
      department: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  async ({ firstName, lastName, email, login = email, department }) => {
    try {
      const user = await oktaAPI('POST', '/api/v1/users', {
        query: { activate: false },
        body: { profile: { firstName, lastName, email, login, department } },
      });
      return textResult(trimUser(user));
    } catch (err) {
      return errorResult(err.message);
    }
  }
);

// Deactivate Okta user
server.registerTool(
  'deactivate_user',
  {
    description:
      'Deactivate a user in the Okta org: ends all their sessions, removes their app assignments, ' +
      'and sets status to DEPROVISIONED. They can no longer sign in. Required before delete_user.',
    inputSchema: {
      user: z.string().min(1).describe('Okta user id (00u...) or login'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
  async ({ user }) => {
    try {
      // Look the user up first: resolves a login to an id, and gives the current status.
      const found = await oktaAPI('GET', `/api/v1/users/${encodeURIComponent(user)}`);

      // Already deactivated: report it instead of failing, so calling twice is harmless.
      if (found.status === 'DEPROVISIONED') {
        return textResult(`${found.profile.login} is already deactivated. No change.`);
      }

      // sendEmail=false: no notification email goes to the user's real address.
      await oktaAPI('POST', `/api/v1/users/${found.id}/lifecycle/deactivate`, {
        query: { sendEmail: false },
      });
      console.error(`[vk okta server] deactivated user ${found.id} (${found.profile.login})`);
      return textResult(`Deactivated ${found.profile.login} (${found.id}): ${found.status} → DEPROVISIONED.`);
    } catch (err) {
      return errorResult(err.message);
    }
  }
);

// Delete Okta user
server.registerTool(
  'delete_user',
  {
    description:
      'PERMANENTLY delete a user from the Okta org. Cannot be undone. Only works on users who are ' +
      'already DEPROVISIONED: use deactivate_user first. Only use when the user explicitly asks ' +
      'to delete a specific account.',
    inputSchema: {
      user: z.string().min(1).describe('Okta user id (00u...) or login'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  },
  async ({ user }) => {
    try {
      const found = await oktaAPI('GET', `/api/v1/users/${encodeURIComponent(user)}`);

      if (found.status !== 'DEPROVISIONED') {
        return errorResult(
          `Cannot delete ${found.profile.login}: status is ${found.status}. ` +
            'Deactivate the user first with deactivate_user.'
        );
      }

      await oktaAPI('DELETE', `/api/v1/users/${found.id}`);
      console.error(`[vk okta server] deleted user ${found.id} (${found.profile.login})`);
      return textResult(`Permanently deleted ${found.profile.login} (${found.id}).`);
    } catch (err) {
      return errorResult(err.message);
    }
  }
);


// Start answering requests on stdin/stdout. The process stays alive until the client disconnects.
await server.connect(new StdioServerTransport());
console.error("[vk okta server] ready on stdio");