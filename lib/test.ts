import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
const { groq } = await import('./groq');

type GroqErrorShape = {
  message?: string;
  error?: {
    error?: {
      message?: string;
    };
  };
};

function groqErrorMessage(err: unknown) {
  if (err && typeof err === 'object') {
    const shaped = err as GroqErrorShape;
    return shaped.error?.error?.message ?? shaped.message;
  }
  return undefined;
}

async function testAI() {
  const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  try {
    const response = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: "Hello Fly Logistics AI",
        },
      ],
      model,
    });

    console.log(response.choices[0]?.message?.content);
  } catch (err) {
    console.error('Groq API error:', groqErrorMessage(err) || err);
    const apiMessage = groqErrorMessage(err);
    if (apiMessage) {
      console.error('API message:', apiMessage);
    }
  }
}

testAI();
