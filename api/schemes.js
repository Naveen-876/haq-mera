export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key missing' });

  try {
    const { profile, state } = req.body;
    if (!profile) return res.status(400).json({ error: 'Profile required' });

    const prompt = `You are a government welfare scheme expert for India. 

Citizen profile:
${profile}

Return ONLY a JSON array of 6-8 matching government welfare schemes. Each object must have:
{
  "icon": "single emoji",
  "name": "scheme name in Telugu",
  "category": "Telugu category",
  "benefit": "key benefit in Telugu e.g. ₹2.5 లక్షలు",
  "is_new": false,
  "description": "2-3 sentences in Telugu",
  "documents": ["doc1", "doc2", "doc3"],
  "where": "where to apply in Telugu",
  "apply_link": null
}
Return JSON array only. No markdown. No explanation.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    const data = await response.json();
    
    if (data.error) {
      console.error('Gemini error:', data.error);
      return res.status(500).json({ error: data.error.message });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response from Gemini');

    const clean = text.replace(/```json|```/g, '').trim();
    const schemes = JSON.parse(clean);

    return res.status(200).json({ schemes });

  } catch (err) {
    console.error('Handler error:', err.message);
    return res.status(500).json({ error: 'ఏదో తేడా అయింది: ' + err.message });
  }
}
