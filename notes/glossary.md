# Glossary

One line per concept, for a quick scan before revising. Details are in each lesson's notes.

| Concept | One-line definition | Lesson |
|---|---|---|
| LLM API | An HTTP endpoint: send JSON (model, messages, limits), get JSON back | 1 |
| Stateless | The model remembers nothing between calls | 1 |
| Content blocks | A reply is a *list* of typed blocks (`text`, `tool_use`, …), not one string | 1 |
| `stop_reason` | Why the model stopped: `end_turn`, `max_tokens`, `tool_use`, `refusal` | 1 |
| Token | A chunk of text (~¾ word); what you're billed for and limited by | 1 |
| API key | A bearer credential: whoever has it can spend as you | 1 |
| AI gateway | A proxy that holds the real keys and issues revocable, scoped virtual keys | 1 |
| Message history | The array of `user`/`assistant` turns you resend each call | 2 |
| System prompt | Developer instructions sent with every call; guidance, not enforcement | 2 |
| Context window | Max size of everything the model sees in one call | 2 |
| Prompt injection | Text that tries to override the developer's instructions | 2 |
| Tool | A function in your code + a description/schema the model reads | 3 |
| `tool_use` / `tool_result` | The model's request to run a tool / your answer, matched by id | 3 |
| Indirect prompt injection | Malicious instructions arriving through tool results | 3 |
| Excessive agency | Giving a model more tool power than its task needs | 3 |
