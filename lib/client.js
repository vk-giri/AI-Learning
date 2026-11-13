
import Anthropic from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The model every lesson uses. Our gateway key is allowed to use this one.
export const MODEL = "claude-haiku-5-5";

const ENV_PATH = fileURLToPath(new URL("../.env", import.meta.url));

export function createClient() {
  if (existsSync(ENV_PATH)) {
    process.loadEnvFile(ENV_PATH);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.ANTHROPIC_BASE_URL;
  
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is empty. Add ANTHROPIC_API_KEY=sk-... to .env " +
        "(or run: unset ANTHROPIC_API_KEY if your terminal has an empty one)."
    );
  }

  return new Anthropic({ apiKey, baseURL });
}
