import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../env.js";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (client) return client;
  client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

export const ONBOARDING_MODEL = "claude-sonnet-4-6";
