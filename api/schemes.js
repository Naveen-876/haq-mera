// api/schemes.js — Secure Anthropic API proxy
// Runs on Vercel serverless — API key never reaches the browser

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

// Simple in-memory rate limiter (resets per serverless instance)
const rateLimitMap = new Map();
const RATE_LIMIT = 5;        // max 5 requests
const RATE_WINDOW = 60000;   // per 60 seconds per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_WINDOW) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  rateLimitMap.set(ip, entry);
  return true;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'చాలా requests పంపారు. కొంచెం ఆగి మళ్ళీ try చేయండి.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const { profile, state } = req.body;
    if (!profile) return res.status(400).json({ error: 'Profile required' });

    const today = new Date().toISOString().split('T')[0];

    const systemPrompt = `You are a government welfare scheme expert for India with live web search. Today: ${today}.

Use web_search to find: "latest government welfare schemes ${state || 'India'} 2025 2026 new launch"

Then return ONLY a JSON array (no markdown, no preamble) of matching schemes. Each object:
{
  "icon": "single emoji",
  "name": "scheme name in Telugu preferred",
  "category": "Telugu category (గృహ నిర్మాణం/విద్య/ఆరోగ్యం/వ్యవసాయం/పెన్షన్/మహిళా సాధికారత/యువత)",
  "benefit": "key benefit e.g. ₹2.5 లక్షలు",
  "is_new": true if launched after Jan 2024,
  "description": "2-3 sentences in Telugu explaining scheme and eligibility",
  "documents": ["doc1 Telugu", "doc2 Telugu", "doc3 Telugu"],
  "where": "where to apply in Telugu",
  "apply_link": "official URL or null"
}
Return 6-10 schemes. Mix well-known + newly launched. Prioritize high-value schemes first.`;

    const userMsg = `Citizen profile:\n${profile}\n\nReturn matching schemes as JSON array only.`;

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05'
    };

    // First call with web search tool
    const firstRes = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        system: systemPrompt,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    const firstData = await firstRes.json();

    let finalContent = firstData.content || [];

    // If Claude used web search tool, do second turn to get final JSON
    if (firstData.stop_reason === 'tool_use') {
      const secondRes = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1000,
          system: systemPrompt,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [
            { role: 'user', content: userMsg },
            { role: 'assistant', content: firstData.content }
          ]
        })
      });
      const secondData = await secondRes.json();
      finalContent = secondData.content || [];
    }

    const textBlock = finalContent.find(b => b.type === 'text');
    if (!textBlock) throw new Error('No text in response');

    const clean = textBlock.text.replace(/```json|```/g, '').trim();
    const schemes = JSON.parse(clean);

    return res.status(200).json({ schemes });

  } catch (err) {
    console.error('Scheme API error:', err);
    return res.status(500).json({ error: 'ఏదో తేడా అయింది. మళ్ళీ try చేయండి.' });
  }
}
