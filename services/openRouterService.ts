import { OpenRouter } from '@openrouter/sdk';

// Initialize the client
// Make sure to add VITE_OPENROUTER_API_KEY to your .env file
const client = new OpenRouter({
  apiKey: import.meta.env.VITE_OPENROUTER_API_KEY,
});

// --- Helper Functions ---

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const isImageFile = (file: File): boolean => {
  return file.type.startsWith('image/');
};

// --- Main Service Functions ---

export const generateResponse = async (
  prompt: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  files: File[] = [],
  modelId: string = "openai/gpt-4o"
) => {
  try {
    // 1. Format History
    const messages: any[] = history.map(msg => ({
      role: (msg.role as string) === 'model' ? 'assistant' : msg.role,
      content: msg.content || (msg as any).parts?.[0]?.text
    }));

    // 2. Build Current User Message
    let userContent: any;

    if (files.length > 0) {
      const contentParts: any[] = [];

      if (prompt.trim()) {
        contentParts.push({
          type: "text",
          text: prompt
        });
      }

      for (const file of files) {
        if (isImageFile(file)) {
          const base64Data = await fileToBase64(file);
          contentParts.push({
            type: "image_url",
            image_url: {
              url: `data:${file.type};base64,${base64Data}`
            }
          });
        } else {
          console.warn(`File type ${file.type} not explicitly supported for vision models.`);
        }
      }
      userContent = contentParts;
    } else {
      userContent = prompt;
    }

    messages.push({
      role: 'user',
      content: userContent
    });

    // 3. Initiate Stream via OpenRouter callModel
    const result = client.callModel({
      model: modelId,
      input: messages
    });

    return result;

  } catch (error: any) {
    if (error.name === 'AbortError' || error.message?.includes('Cancel')) {
      console.log('Stream aborted natively in service.');
      throw error;
    }
    console.error("❌ OpenRouter API Error:", error);
    throw error;
  }
};

// Inside openRouterService.ts

export const generateTitle = async (
  userMessage: string,
  aiResponse: string,
  modelName: string // Argument accepted.
) => {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        // IMPORTANT: Ensure your .env has VITE_OPENROUTER_API_KEY
        "Authorization": `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "LLM-Brancher",
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          {
            role: "system",
            content: "Summarize this into a 3-word title. No quotes."
          },
          {
            role: "user",
            content: `User: ${userMessage.slice(0, 200)}\nAI: ${aiResponse.slice(0, 200)}`
          }
        ],
        max_tokens: 15,
      })
    });

    // Handle 502/404 by retrying with a bulletproof model
    if (!response.ok) {
      if (response.status === 502 || response.status === 404) {
        console.warn(`Model ${modelName} hit a ${response.status}. Retrying with Gemini...`);
        return generateTitle(userMessage, aiResponse, "google/gemini-flash-1.5-8b");
      }
      throw new Error(`OpenRouter Error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.replace(/["']/g, "").trim() || "New Chat";

  } catch (error) {
    console.error("Title generation failed:", error);
    return "New Discussion";
  }
};