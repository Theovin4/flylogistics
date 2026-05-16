import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const { default: Groq } = await import('groq-sdk');

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

async function listModels() {
  try {
    const res = await client.models.list();
    console.log('Models available:');
    if (res && res.data && Array.isArray(res.data)) {
      for (const m of res.data) {
        console.log('-', m.id || JSON.stringify(m));
      }
    } else {
      console.log(res);
    }
  } catch (err) {
    console.error('Failed to list models:', groqErrorMessage(err) || err);
    const apiMessage = groqErrorMessage(err);
    if (apiMessage) {
      console.error('API message:', apiMessage);
    }
  }
}

await listModels();
