import Groq from "groq-sdk";

let groqClient: Groq | null = null;

export function getGroq() {
  if (!process.env.GROQ_API_KEY) return null;
  if (!groqClient) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
}
