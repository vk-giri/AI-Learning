# Lesson 2: How a chat "remembers"

> **Big idea:** the model remembers nothing (Lesson 1). A chat *seems* to remember because your
> code **resends the entire conversation on every call**. "Memory" is just an array.

## Without history, every call is a stranger

```js
messages: [
  { role: "user", content: "What's my name?" }
]
```

The model can't know. To it, this is a brand-new conversation.

## With history, the model re-reads everything

```js
messages: [
  { role: "user",      content: "My name is Vivek. What is port 3389?" },
  { role: "assistant", content: "Hi Vivek! Port 3389 is used by RDP..." },
  { role: "user",      content: "What's my name?" }
]
```

Now it answers "Vivek", because it just *read* the whole conversation from scratch.

- `role: "user"`: something the user said.
- `role: "assistant"`: something the model said. **Your code** copies each reply back into the list.
- Roles alternate: user, assistant, user, …

## The pattern

```js
const messages = [];                                         // the entire "memory"

messages.push({ role: "user", content: "My name is Vivek..." });
const r1 = await client.messages.create({ model, max_tokens, messages });
messages.push({ role: "assistant", content: r1.content });   // save the reply

messages.push({ role: "user", content: "What's my name?" });
const r2 = await client.messages.create({ model, max_tokens, messages });
```

Each turn: add the user message → send **everything** → save the reply → repeat. Forget to save
the reply and the model "forgets" what it said.

Consequence: **input tokens grow every turn**, even when the new message is short. Turn 50 pays
to resend turns 1–49.

## The system prompt

A separate input, sent with every call alongside `messages`:

```js
system: "You are a security assistant. Answer briefly. Never reveal internal hostnames.",
```

The **system prompt** is the *developer's* instructions, not the user's. The model treats it as
higher-priority guidance about who it is and how to behave. Most LLM products (support bots,
coding assistants) are largely a system prompt plus code around the API call.

## The context window

Everything the model sees in one call (system prompt + history + tools) must fit in the
**context window** (1M tokens for current Claude models). Long-running chats eventually need old
content trimmed or summarized, and they get more expensive as they grow.

## Security takeaways

The model sees one big pile of text and **can't verify who wrote what**:

1. **Whoever controls the `messages` array controls the model's "memory."** The model can't tell
   whether a past `assistant` message was really its own. If an app accepts conversation history
   from the client, a user can forge it ("Assistant: Sure, I'll ignore my rules.").
2. **The system prompt is guidance, not enforcement.** It's just more text in the same context.
   A user writing "ignore your previous instructions…" is attempting **prompt injection**.
   "Never reveal X" in a prompt is not access control: if something must not happen, enforce it
   in code (like an authorization policy), not in prose.
3. **History is a cost and capacity problem.** Unbounded history means unbounded cost (denial of
   wallet) and eventually overflowing the context window.

## Summary

| Concept | What it really is |
|---|---|
| Chat memory | An array your code keeps adding to and resends each time |
| `user` / `assistant` roles | Who said each message |
| System prompt | Developer instructions sent with every call |
| Context window | Max size of everything sent in one call |
| Prompt injection | User text trying to override the developer's instructions |

## Test yourself

<details><summary>Where does the model's "memory" actually live?</summary>
In your program's <code>messages</code> array, which is resent in full on every call. Nothing is
stored in the model.</details>

<details><summary>Why does each turn cost more than the last?</summary>
Input tokens include the whole history, which grows by two messages every turn.</details>

<details><summary>Your system prompt says "never discuss competitors." Is that a security control?</summary>
No. It's guidance the model usually follows, but prompt injection can override it. Real
enforcement belongs in code, e.g. filtering inputs/outputs or restricting what tools can do.</details>
