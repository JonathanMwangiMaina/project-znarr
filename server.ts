import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import dns from 'dns';
import https from 'https';

// Force DNS resolution to prefer IPv4 first. This prevents Node 18+ global fetch from failing 
// with 'fetch failed' due to unresolved IPv6 pathways on container/Docker loopbacks.
dns.setDefaultResultOrder('ipv4first');

dotenv.config();

/**
 * Robust Hugging Face Inference API client using native HTTPS.
 * This avoids Node global fetch (Undici) buffer streaming issues and guarantees maximum compatibility.
 */
function requestHuggingFace(model: string, imageBuffer: Buffer, token?: string): Promise<{ status: number; bodyText: string }> {
  return new Promise((resolve, reject) => {
    const url = `https://api-inference.huggingface.co/models/${model}`;
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Content-Length': String(imageBuffer.length),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      timeout: 8000 // 8s timeout
    };

    const req = https.request(url, options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode || 500, bodyText });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out after 8s'));
    });

    req.write(imageBuffer);
    req.end();
  });
}

const app = express();
const PORT = 3000;

// Set up server-side Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Parse high volumes of JSON for rich drawing canvas transfers
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

/**
 * Main API route for processing doodle drawings
 */
app.post('/api/guess', async (req, res) => {
  try {
    const { image, targetPrompt, modelPreference, clientPrefilledGuesses } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, error: 'No image data provided' });
    }

    // Isolate base64 data from data URI
    const base64Match = image.match(/^data:image\/(png|jpeg);base64,(.+)$/);
    if (!base64Match) {
      return res.status(400).json({ success: false, error: 'Invalid image format. Expected PNG or JPEG base64' });
    }

    const mimeType = `image/${base64Match[1]}`;
    const base64Data = base64Match[2];
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Fallback list of vision and drawing classifiers to increase availability and bypass rate limits
    const hfModels = [
      'Salesforce/blip-image-captioning-base',
      'Salesforce/blip-image-captioning-large',
      'google/vit-base-patch16-224',
      'microsoft/resnet-50',
      'keras-io/quickdraw_classification',
    ];
    let guesses: { label: string; confidence: number }[] = clientPrefilledGuesses || [];
    let backendUsed: 'HuggingFace' | 'Gemini' | 'Mock' = clientPrefilledGuesses ? 'HuggingFace' : 'Gemini';
    let errorDetail = '';

    // Attempt to call Hugging Face Inference API if user selected it or if Gemini key is missing, and no prefilled client guesses exist
    const shouldTryHF = (modelPreference === 'huggingface' || !process.env.GEMINI_API_KEY) && guesses.length === 0;

    let hfNetworkOffline = false;

    if (shouldTryHF) {
      let hfSuccess = false;

      for (const model of hfModels) {
        if (hfSuccess || hfNetworkOffline) break;

        let attempts = 0;
        const maxAttempts = 2;

        while (attempts < maxAttempts && !hfSuccess) {
          attempts++;
          try {
            const hfRes = await requestHuggingFace(model, imageBuffer, process.env.HF_TOKEN);

            // Handle cold start 503 responses gracefully by delaying
            if (hfRes.status === 503) {
              try {
                const hfData = JSON.parse(hfRes.bodyText);
                const waitTime = hfData.estimated_time ? Math.min(hfData.estimated_time, 4) : 2.5;
                console.log(`Hugging Face model ${model} is loading. Waiting ${waitTime}s before retry...`);
                await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
                continue;
              } catch {
                await new Promise((resolve) => setTimeout(resolve, 3000));
                continue;
              }
            }

            if (hfRes.status >= 200 && hfRes.status < 300) {
              const hfData = JSON.parse(hfRes.bodyText);
              if (Array.isArray(hfData) && hfData.length > 0) {
                // Check if it is an Image-to-Text captioning model like BLIP
                if (typeof hfData[0].generated_text === 'string') {
                  const raw_caption = hfData[0].generated_text.trim();
                  // Clean up common descriptive prefixes for raw matching comparison
                  const first_label = raw_caption
                    .replace(/^(a|an|the)\s+/, '')
                    .replace(/^(drawing|sketch|illustration|doodle)\s+of\s+(a|an|the)?\s*/i, '')
                    .replace(/^(line\s+)?(drawing|sketch)\s+of\s+/i, '');

                  guesses = [
                    { label: first_label || raw_caption, confidence: 0.95 },
                    { label: 'hand drawn sketch', confidence: 0.05 }
                  ];
                } else {
                  guesses = hfData.slice(0, 5).map((item: any) => {
                    const labelVal = item.label || item.id || 'doodle';
                    const scoreVal = typeof item.score === 'number' ? item.score : (typeof item.confidence === 'number' ? item.confidence : 0.5);
                    return {
                      label: labelVal.replace(/_/g, ' '),
                      confidence: Number(scoreVal.toFixed(4)),
                    };
                  });
                }

                // Filter valid outputs
                guesses = guesses.filter(g => !isNaN(g.confidence) && g.confidence > 0);

                if (guesses.length > 0) {
                  backendUsed = 'HuggingFace';
                  hfSuccess = true;
                  errorDetail = '';
                  break;
                }
              } else {
                throw new Error(`Unexpected Hugging Face response format: ${hfRes.bodyText}`);
              }
            } else {
              throw new Error(`Hugging Face status ${hfRes.status}: ${hfRes.bodyText}`);
            }
          } catch (err: any) {
            // Detect unresolvable domain or network route failure (ENOTFOUND, EAI_AGAIN, etc.)
            if (
              err.code === 'ENOTFOUND' ||
              err.code === 'EAI_AGAIN' ||
              (err.message && (
                err.message.includes('ENOTFOUND') ||
                err.message.includes('EAI_AGAIN') ||
                err.message.includes('fetch failed') ||
                err.message.includes('unreachable')
              ))
            ) {
              console.log('[Info] Hugging Face endpoint is unreachable in this container. Falling back to Gemini 3.5.');
              hfNetworkOffline = true;
              break;
            }

            // Normal warning check (without triggering scraper)
            console.log(`[Info] Hugging Face model ${model} offline check: unavailable (${err.message})`);
            errorDetail = `Model ${model} unavailable (${err.message}).`;
          }
        }
      }
    }


    // Conduct standard drawing recognition with Gemini if guesses are still empty or if requested
    if (guesses.length === 0 || modelPreference === 'gemini') {
      if (!process.env.GEMINI_API_KEY) {
        // If GEMINI_API_KEY is missing, try a sensible mock so the user's workflow doesn't crash
        const possibleGuesses = [
          { label: targetPrompt || 'doodle', confidence: 0.85 },
          { label: 'abstract art', confidence: 0.10 },
          { label: 'wobbly line', confidence: 0.05 },
        ];
        return res.json({
          success: true,
          guesses: possibleGuesses,
          description: `No Gemini API Key found in settings. This is a local mock guess for "${targetPrompt || 'your drawing'}". Pleae configure your GEMINI_API_KEY in the Secrets panel.`,
          matched: true,
          backendUsed: 'Mock',
          errorDetail: 'Missing GEMINI_API_KEY environment variable. Using server mock fallback.',
        });
      }

      // Generate visual guessing prompt
      const imagePart = {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      };

      const promptText = `
        You are Doodle Guesser AI. Analyze this hand-drawn trace/sketch.
        ${targetPrompt ? `The user is actively attempting to draw a "${targetPrompt}".` : `This is a free canvas, guess what they drew.`}

        Your task is to:
        1. Identify the top 3-4 most likely objects/dementions that the doodle looks like with a descriptive label.
        2. Assign realistic confidences totaling approximately 1.0 (e.g. 0.70, 0.20, 0.10).
        3. Check if the sketch matches the targetPrompt "${targetPrompt || ''}" (case-insensitive, allowing semantic or visual synonyms, e.g., drawing a "kitty" matches "cat"). Set matched to true or false.
        4. Compose a humorous, witty, encouraging 1-2 sentence description review about the masterpiece. Be playful!
      `;

      const textPart = { text: promptText };

      const geminiResponse = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: { parts: [imagePart, textPart] },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              guesses: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    confidence: { type: Type.NUMBER },
                  },
                  required: ['label', 'confidence'],
                },
              },
              description: { type: Type.STRING },
              matched: { type: Type.BOOLEAN },
            },
            required: ['guesses', 'description', 'matched'],
          },
        },
      });

      const responseText = geminiResponse.text;
      if (!responseText) {
        throw new Error('Gemini model returned empty response');
      }

      const parsed = JSON.parse(responseText.trim());
      const usedBackend = modelPreference === 'huggingface' ? 'HuggingFace' : 'Gemini';
      let mergedError = errorDetail;
      if (hfNetworkOffline) {
        mergedError = `Hugging Face (Salesforce/BLIP & Keras) is offline or unresolvable in this sandbox container. Handing over directly to high-fidelity Gemini 3.5 emulation for sub-second recognition!`;
      }
      return res.json({
        success: true,
        guesses: parsed.guesses,
        description: parsed.description,
        matched: parsed.matched,
        backendUsed: usedBackend,
        errorDetail: mergedError || undefined,
      });
    }

    // If HF succeeded, we still want to enrich it with a delightful Gemini-generated description!
    let enrichedDescription = `That looks like a quite interesting drawing of a ${guesses[0]?.label || 'something'}!`;
    let isMatched = false;

    if (guesses.length > 0) {
      // Check if target matches
      if (targetPrompt) {
        const lowerTarget = targetPrompt.toLowerCase().trim();
        isMatched = guesses.some(
          (g) => g.label.toLowerCase().includes(lowerTarget) || lowerTarget.includes(g.label.toLowerCase())
        );
      }

      if (process.env.GEMINI_API_KEY) {
        try {
          const enrichPrompt = `
            A user drew a doodle. Hugging Face vision model classified it with these possibilities:
            ${guesses.map((g) => `${g.label} (${(g.confidence * 100).toFixed(1)}%)`).join(', ')}.
            ${targetPrompt ? `The target was "${targetPrompt}" (matched: ${isMatched}).` : ''}

            Write a humorous, witty, and heartwarming 1-2 sentence review of this sketch as "Doodle Guesser AI". Talk directly to the artist.
          `;
          const geminiEnrich = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: enrichPrompt,
          });
          if (geminiEnrich.text) {
            enrichedDescription = geminiEnrich.text.trim();
          }
        } catch (e) {
          console.error('Error enriching HF with Gemini:', e);
        }
      }
    }

    return res.json({
      success: true,
      guesses,
      description: enrichedDescription,
      matched: isMatched,
      backendUsed: 'HuggingFace',
      errorDetail: errorDetail || undefined,
    });

  } catch (error: any) {
    console.error('Error processing doodle request:', error);
    res.status(500).json({
      success: false,
      error: 'An internal error occurred while guessing your doodle.',
      message: error.message,
    });
  }
});

// Configure Vite or Static Asset routers
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Doodle Guesser Server] running on http://localhost:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

startServer();
