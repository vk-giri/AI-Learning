// Lesson 2: a chat that "remembers", by resending the whole conversation each turn.
// Run with:  node 02-chat.js      (type "exit" to quit)

// Node's built-in module for reading what you type in the terminal.
import readline from "node:readline/promises";
import { createClient, MODEL } from "./lib/client.js";
import { logReply, logStats } from "./lib/log.js";

const client = createClient();

// Developer instructions, sent with every call. Not part of "messages".
const SYSTEM_PROMPT = "You are a concise security assistant. Keep answers under 3 sentences.";

// THE ENTIRE MEMORY of this chat. Just an array we keep adding to.
const messages = [];

// Set up the terminal input.
const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });

// Loop forever: read your message, send everything, print the reply.
while (true) {
  const userText = await terminal.question("\nyou> ");
  if (userText.trim() === "exit") break;

  // 1. Add YOUR message to the history.
  messages.push({ role: "user", content: userText });

  // 2. Send the WHOLE history (not just the latest message).
  //    (If Claude's safety filter declines a request, Okta's gateway retries on
  //    another model by itself, so we don't need to handle that here.)
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: messages,
  });

  // 3. Add CLAUDE'S reply to the history too, or it will "forget" what it said.
  messages.push({ role: "assistant", content: response.content });

  // 4. Print the reply.
  logReply(response);

  // Watch "tokens in" grow every turn: we resend the whole history, every time.
  logStats(response, messages);
}

terminal.close();
