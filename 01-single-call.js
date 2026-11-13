// Lesson 1: one request in, one reply out.
// Run with:  node 01-single-call.js

// Our shared setup (lib/client.js): loads .env, checks the key, creates the API client.
import { createClient, MODEL } from "./lib/client.js";
// Our shared output functions (lib/log.js), used by every lesson.
import { logReply, logStats } from "./lib/log.js";

// The client knows how to talk to the API (key + address already filled in).
const client = createClient();

// Send the request. The object we pass IS the JSON request body from Lesson 1.
const response = await client.messages.create({
  model: MODEL,
  max_tokens: 1000,
  messages: [
    { role: "user", content: "In one sentence: what is port 3389 used for?" },
  ],
});

// Print the reply's text blocks ("content" is a LIST of blocks).
logReply(response);

// Print why the model stopped and how many tokens were used.
logStats(response);
