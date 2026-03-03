// Client is now handled by the backend proxy

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

import { API_BASE_URL } from './frontendConfig';
import { supabase } from './supabaseClient';

export const generateResponse = async (
  prompt: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  files: File[] = [],
  modelId: string = "openai/gpt-4o",
  thinking: boolean = false
) => {
  try {
    const messages: any[] = history.map(msg => ({
      role: (msg.role as string) === 'model' ? 'assistant' : msg.role,
      content: msg.content || (msg as any).parts?.[0]?.text
    }));

    let userContent: any;
    if (files.length > 0) {
      const contentParts: any[] = [];
      if (prompt.trim()) {
        contentParts.push({ type: "text", text: prompt });
      }

      for (const file of files) {
        if (isImageFile(file)) {
          const base64Data = await fileToBase64(file);
          contentParts.push({
            type: "image_url",
            image_url: { url: `data:${file.type};base64,${base64Data}` }
          });
        }
      }
      userContent = contentParts;
    } else {
      userContent = prompt;
    }

    messages.push({ role: 'user', content: userContent });

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const requestBody: any = { model: modelId, messages, stream: true };
    if (thinking) {
      requestBody.include_reasoning = true;
      // Some providers use reasoning_effort
      requestBody.provider = { include_reasoning: true };
    }

    const response = await fetch(`${API_BASE_URL}/api/openrouter/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) throw new Error(`Proxy Error: ${response.status}`);

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    return {
      getTextStream: async function* () {
        if (!reader) return;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data.trim() === '[DONE]') break;
                try {
                  const json = JSON.parse(data);
                  const content = json.choices?.[0]?.delta?.content;
                  if (content) yield content;
                } catch (e) {
                  // Ignore parse errors for incomplete JSON
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      },
      cancel: () => reader?.cancel()
    };

  } catch (error: any) {
    console.error("❌ Proxy OpenRouter API Error:", error);
    throw error;
  }
};

export const generateTitle = async (
  userMessage: string,
  aiResponse: string,
  modelName: string
) => {
  try {
    const messages = [
      { role: "system", content: "Summarize this into a 3-word title. No quotes." },
      { role: "user", content: `User: ${userMessage.slice(0, 200)}\nAI: ${aiResponse.slice(0, 200)}` }
    ];

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const response = await fetch(`${API_BASE_URL}/api/openrouter/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ model: modelName, messages })
    });

    if (!response.ok) throw new Error(`Proxy Error: ${response.status}`);

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.replace(/["']/g, "").trim() || "New Chat";

  } catch (error) {
    console.error("Title generation failed:", error);
    return "New Discussion";
  }
};
