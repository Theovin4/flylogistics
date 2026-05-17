import Groq from "groq-sdk";
import { cleanEnv } from "@/lib/env";

let groqClient: Groq | null = null;

export function getGroq() {
  const apiKey = cleanEnv(process.env.GROQ_API_KEY);
  if (!apiKey) return null;
  if (!groqClient) {
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}
