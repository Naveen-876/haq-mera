const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const rateLimitMap = new Map();
const RATE_LIMIT = 5;
const RATE_WINDOW = 60000;

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'చాలా requests. కొంచెం ఆగి try చేయండి.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server error' });

  try {
    const { profile, state } = req.body;
    if (!profile) return res.status(400).json({ error: 'Profile required' });

    const today = new Date().toISOString().split('T')[0];

    const prompt = `You are a government welfare scheme expert for India. Today: ${today}.

Citizen profile:
${profile}

Return ONLY a JSON array (no markdown, no preamble) of 6-8 matching central + state government welfare schemes. Each object:
{
  "icon": "single emoji",
  "name": "scheme name in Telugu preferred",
  "category": "Telugu category (గృహ నిర్మాణం/విద్య/ఆరోగ్యం/వ్యవసాయం/పెన్షన్/మహిళా సాధికారత/యువత)",
  "benefit": "key benefit e.g. ₹2.5 లక్షలు",
  "is_new": false,
  "description": "2-3 sentences in Telugu explaining scheme and eligibility",
  "documents": ["doc1 Telugu", "doc2 Telugu", "doc3 Telugu"],
  "where": "where to apply in Telugu",
  "apply_link": null
}
Return JSON array only. No markdown.`;

    const res2 = await fetch(`${GEMINI_API}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
      })
    });

    const data = await res2.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response');

    const clean = text.replace(/```json|```/g, '').trim();
    const schemes = JSON.parse(clean);

    return res.status(200).json({ schemes });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'ఏదో తేడా అయింది. మళ్ళీ try చేయండి.' });
  }
}
