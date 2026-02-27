import OpenAI from "openai";

// Client is now handled by the backend proxy

// Helper function to convert File to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Helper to determine if file is an image
const isImageFile = (file: File): boolean => {
  return file.type.startsWith('image/');
};

// Helper to determine if file is a PDF
const isPdfFile = (file: File): boolean => {
  return file.type === 'application/pdf';
};

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const generateResponseOpenAI = async (
  prompt: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  files: File[] = [],
  modelId: string = "gpt-4o"
) => {
  try {
    const messages = history.map(msg => ({
      role: msg.role,
      content: msg.content
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

    const response = await fetch(`${API_BASE_URL}/api/openai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelId, messages, stream: true })
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
                } catch (e) { }
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
    console.error("❌ Proxy OpenAI API Error:", error);
    throw error;
  }
};
