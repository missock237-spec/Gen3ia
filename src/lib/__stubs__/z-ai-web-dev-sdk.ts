/**
 * Stub for z-ai-web-dev-sdk — Provides fallback implementations
 * when the actual ZAI SDK is not available.
 */

const ZAI = {
  chat: {
    completions: {
      create: async (params: any) => {
        return {
          choices: [{ message: { content: '[ZAI SDK not available — stub response]' } }],
        };
      },
    },
  },
  images: {
    generate: async (params: any) => {
      return { data: [{ url: '', b64_json: '' }] };
    },
  },
  audio: {
    speech: {
      create: async (params: any) => {
        return { buffer: Buffer.from('') };
      },
    },
    transcriptions: {
      create: async (params: any) => {
        return { text: '' };
      },
    },
  },
};

export default ZAI;
export { ZAI };
