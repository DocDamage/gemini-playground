// /core/ai/ollamaProvider.js
/**
 * Purpose: AI Service provider for Ollama (Local LLMs).
 * Communicates with a local Ollama server endpoint.
 *
 * Conforms to Feature 2 Plan & aiService architecture (Spec 8.3).
 */

import { fetchURL } from '../webFetch.js'; // Use our safe fetch

// Default Ollama endpoint
const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/generate';
const OLLAMA_CHAT_ENDPOINT = process.env.OLLAMA_CHAT_ENDPOINT || 'http://localhost:11434/api/chat';

/**
 * Sends a prompt to the local Ollama server and returns the response.
 * Handles both completion and chat endpoints.
 *
 * @param {string} prompt - The full prompt text (including persona).
 * @param {object} options - Generation options.
 * @param {string} [options.model] - Specific Ollama model to use (e.g., 'llama3', 'mistral').
 * @param {boolean} [options.useChatEndpoint=false] - Whether to use the /api/chat endpoint.
 * @param {object} [options.ollamaOptions] - Additional options for the Ollama API.
 * @param {object} [fetchConfig] - Configuration for webFetch (retries, timeout, etc.).
 * @returns {Promise<object>} An object containing the response text and provider info.
 */
export async function generate(prompt, options = {}, fetchConfig = {}) {
  const model = options.model || 'llama3'; // Default to llama3 if not specified
  const useChatEndpoint = options.useChatEndpoint || false; // Default to /api/generate
  const endpoint = useChatEndpoint ? OLLAMA_CHAT_ENDPOINT : OLLAMA_ENDPOINT;

  const start = Date.now();
  let responseText = '';
  let success = false;
  let errorMsg = null;

  try {
    const ollamaPayload = {
      model: model,
      stream: false, // Keep it simple for now, no streaming
      ...(options.ollamaOptions || {}), // Allow passing custom Ollama options
    };

    // Structure payload based on endpoint
    if (useChatEndpoint) {
      // Assuming a simple chat structure for now
      ollamaPayload.messages = [{ role: 'user', content: prompt }];
    } else {
      ollamaPayload.prompt = prompt;
    }

    // Use webFetch for the request
    const response = await fetchURL(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaPayload),
    }, fetchConfig);

    const responseData = await response.json();
    const latency = Date.now() - start;

    if (response.ok) {
      // Extract text based on endpoint response structure
      if (useChatEndpoint) {
        responseText = responseData?.message?.content || '';
      } else {
        responseText = responseData?.response || '';
      }
      success = true;

      // Log hook lives in aiService for now; noop here.
    } else {
      errorMsg = responseData?.error || `Ollama API Error (${response.status})`;
    }

     return {
      provider: 'ollama',
      model: model,
      text: responseText,
      success: success,
      latency: latency,
      error: errorMsg,
    };

  } catch (err) {
    const latency = Date.now() - start;
    errorMsg = err.message;
    console.error(`[ollamaProvider] Fetch error: ${errorMsg}`);
     return {
      provider: 'ollama',
      model: model,
      text: '',
      success: false,
      latency: latency,
      error: errorMsg,
    };
  }
}

// Export the generate function directly for aiService registration
export default generate;
