import Groq from "groq-sdk";

let groqClient: Groq | null = null;

export function getGroq() {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;
  if (!groqClient) {
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}
