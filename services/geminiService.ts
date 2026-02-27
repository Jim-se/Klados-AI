// Client is now handled by the backend proxy

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

const getMimeType = (file: File): string => {
  return file.type || 'application/octet-stream';
};


const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const generateResponse = async (
  prompt: string,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  files: File[] = [],
  modelId: string = "gemini-1.5-flash",
  isMock: boolean = false
) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/gemini/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelId, prompt, history, files: [] }) // Simplified files for now
    });

    if (!response.ok) throw new Error(`Proxy Error: ${response.status}`);

    const data = await response.json();

    return {
      getTextStream: async function* () {
        // Since the current backend gemini endpoint is non-streaming, 
        // we'll yield the full text as a single chunk to maintain compatibility.
        if (data.text) yield data.text;
      },
      cancel: () => { }
    };

  } catch (error: any) {
    console.error("❌ Proxy Gemini API Error:", error);
    throw error;
  }
};

export const generateTitle = async (prompt: string, response: string, isMock: boolean = false) => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/gemini/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-1.5-flash",
        prompt: `Generate a short, descriptive title (2-6 words) for this conversation. Do not use quotes or special characters.\n\nUser: "${prompt}"\nAI: "${response.substring(0, 150)}..."\n\nTitle:`
      })
    });

    if (!res.ok) return "New Conversation";
    const data = await res.json();
    let title = data.text?.replace(/["'#*\n]/g, '').trim() || "";
    return title || "New Conversation";
  } catch (err) {
    return "New Conversation";
  }
};
