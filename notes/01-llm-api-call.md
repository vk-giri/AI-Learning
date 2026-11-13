# Lesson 1: An LLM is a function behind a web API

> **Big idea:** the model is a **stateless** function on someone else's server. You send JSON,
> it sends JSON back, and it remembers nothing between calls. Everything else (memory, tools,
> agents, MCP) is code *you* write around that one call.

## The request

A language model like Claude runs on Anthropic's servers. You use it like any web API: send an
HTTP request, get JSON back. The request body:

```json
{
  "model": "claude-haiku-5-5",
  "max_tokens": 1000,
  "messages": [
    { "role": "user", "content": "What is port 3389 used for?" }
  ]
}
```

- **`model`**: which model answers. Bigger models are smarter, smaller ones (like Haiku) are
  faster and cheaper.
- **`max_tokens`**: the maximum length of the *reply*.
- **`messages`**: the conversation so far. Here, one message from the user.

## The reply

```json
{
  "role": "assistant",
  "content": [
    { "type": "text", "text": "Port 3389 is used by RDP (Remote Desktop Protocol)..." }
  ],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 20, "output_tokens": 35 }
}
```

- **`content`** is a **list of blocks**, not one string. Each block has a `type`. So far, `text`;
  later the model can return a `tool_use` block that asks your code to do something. That's
  where agents start, so always check `type` before reading a block.
- **`stop_reason`** says why the model stopped:

  | Value | Meaning |
  |---|---|
  | `end_turn` | Finished its answer |
  | `max_tokens` | Hit your `max_tokens` limit; the answer is cut off |
  | `refusal` | A safety filter declined the request |
  | `tool_use` | Wants your code to run a tool (Lesson 3) |

  The agent loop (Lesson 4) is built around this field.
- **`usage`**: how many tokens went in and out (below).

## Tokens

**A token is a chunk of text** the model reads and writes. Before the model sees anything, the
server's *tokenizer* splits text into pieces from a fixed vocabulary. Common words are one token;
numbers, rare words, and code get split up:

```
"what is port 3389 used for?"   →   "what" " is" " port" " 33" "89" " used" " for" "?"
```

(Illustrative; the exact split depends on the model.) Rule of thumb: **1 token ≈ ¾ of a word ≈
4 characters** of English.

Your code doesn't count tokens; the server does and reports them in `usage`:

| Field | What's counted |
|---|---|
| `input_tokens` | **Everything sent**: system prompt, every message in the history, tool definitions, plus a little formatting overhead. Even a one-line question costs more than you'd guess. |
| `output_tokens` | **Everything generated**: the visible answer *plus* hidden reasoning ("thinking"). Many current models think by default, so this can be larger than the visible text. |

Why tokens matter:
- **Cost.** You pay per token, and output costs more than input. Claude Haiku 5.5's list price is
  $0.10 / $0.50 per million input / output tokens.
- **Limits.** `max_tokens` caps output only. The **context window** (1M tokens for current Claude
  models) caps everything in one call.
- **Growth.** Conversations resend their history (Lesson 2), so every turn costs more than the last.

## Authentication: API keys

Each request carries an **API key** in a header. It's a **bearer credential**: whoever holds it
can spend money as you, so it's handled like a password:

- **Never in source code.** Keep it in an **environment variable**, a named value the operating
  system hands to a running program. Locally these are often loaded from a `.env` file that is
  excluded from git.
- **Scope matters.** A variable exported in your shell profile is visible to *every* program you
  run; one loaded only by your program is visible to that program alone.

### AI gateways and virtual keys

Companies often don't hand out real provider keys. Instead, a **gateway** (a proxy, e.g. LiteLLM)
holds the real keys and issues each person a **virtual key** that only works *through the gateway*:

```
your code ──virtual key──► gateway (checks key, model access, budget; logs) ──real key──► model provider
```

The gateway can revoke a key, restrict which models it may use, cap spending, and log usage, all
in one place. It's the same idea as an identity provider brokering access to apps instead of
sharing app passwords.

Practical consequence: the code must send requests to the **gateway's address** (the client's
`baseURL`). The same virtual key sent straight to the provider is rejected as invalid.

Reading auth errors:

| Symptom | Meaning |
|---|---|
| "Could not resolve authentication method" | No credential reached the code |
| `401 invalid x-api-key` | A credential was sent, but the server doesn't recognize it (wrong key, or right key sent to the wrong server) |
| `403 ... not allowed` | Recognized credential, but not permitted for this resource (e.g. this model) |

## The code pattern

```js
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey, baseURL });  // who you are + where to send

const response = await client.messages.create({
  model: "claude-haiku-5-5",
  max_tokens: 1000,
  messages: [{ role: "user", content: "In one sentence: what is port 3389 used for?" }],
});

for (const block of response.content) {
  if (block.type === "text") console.log(block.text);
}
```

- The **SDK** (Anthropic's library) builds the HTTP request and parses the JSON reply. The object
  passed to `messages.create` *is* the request body above.
- `new Anthropic()` with no arguments reads `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL` from the
  environment by itself. Most real code relies on that.

### Good practice for the setup code

- **Configuration comes from the environment, not the code.** The key and address are environment
  variables, so the same code runs anywhere by changing the environment, and secrets never end up
  in source files.
- **Fail fast with a clear message.** Check required settings at startup ("API key is empty")
  rather than failing later with a confusing library error.
- **Write shared setup once.** Code every program needs (load config, check the key, create the
  client) goes in one shared module that the others `import`, so a fix applies everywhere.

## Security takeaways

1. **API keys are bearer secrets.** Leaked LLM keys are among the most common real incidents; bots
   scan public code for them within minutes. If one leaks, revoke it immediately.
2. **Prefer scoped, revocable credentials.** A gateway's virtual keys limit the blast radius.
3. **Tokens are an attack surface.** Anyone who can make your app read huge inputs or loop
   forever runs up your bill: **denial of wallet**. Set `max_tokens`, cap loops, use budgets.

## Test yourself

<details><summary>Why is <code>content</code> a list instead of a string?</summary>
A reply can contain several blocks of different types, e.g. some text plus one or more tool
requests. You check each block's <code>type</code>.</details>

<details><summary>You get <code>401 invalid x-api-key</code> with a key you know is valid. What's a likely cause?</summary>
The key is being sent to the wrong server, e.g. a gateway virtual key sent directly to the
provider because <code>baseURL</code> isn't set.</details>

<details><summary>Does <code>max_tokens</code> limit what you send?</summary>
No. It limits only the reply. The context window limits the total.</details>
