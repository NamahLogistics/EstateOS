/**
 * Photo → draft Life Map fields.
 * Uses OpenAI vision when OPENAI_API_KEY is set; otherwise filename + category heuristics.
 */

function guessCategory(name = '', hint = '') {
  if (hint) return hint;
  const s = name.toLowerCase();
  if (/lic|policy|insurance|hdfc life|max life/.test(s)) return 'insurance';
  if (/passbook|sbi|hdfc|icici|axis|bank|statement/.test(s)) return 'bank';
  if (/demat|zerodha|groww|ppf|epf|mutual|nps/.test(s)) return 'investments';
  if (/deed|registry|flat|property|society/.test(s)) return 'property';
  if (/aadhaar|pan|passport|sim|phone/.test(s)) return 'digital';
  if (/will|wish|funeral/.test(s)) return 'wishes';
  return 'bank';
}

function titleFromFilename(name = '') {
  const base = String(name)
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base || /^img|image|photo|scan|dsc|screenshot/i.test(base)) return null;
  return base.slice(0, 80);
}

async function draftWithOpenAI(buffer, mime, categoryHint) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const b64 = buffer.toString('base64');
  const dataUrl = `data:${mime || 'image/jpeg'};base64,${b64}`;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Extract estate vault fields from an Indian bank/insurance/property document photo. Return JSON keys: category (bank|insurance|investments|property|digital|subscriptions|contacts|wishes), title, institution, accountRef, notes. Keep notes short. If unsure, still guess best-effort.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: categoryHint
                ? `Preferred category hint: ${categoryHint}. Extract fields.`
                : 'Extract fields from this document photo.',
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 400,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('openai vision failed', res.status, errText.slice(0, 200));
    return null;
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(raw);
    const cats = [
      'bank',
      'insurance',
      'investments',
      'property',
      'digital',
      'subscriptions',
      'contacts',
      'wishes',
    ];
    return {
      category: cats.includes(parsed.category) ? parsed.category : guessCategory('', categoryHint),
      title: String(parsed.title || 'Scanned document').slice(0, 120),
      institution: String(parsed.institution || '').slice(0, 120),
      accountRef: String(parsed.accountRef || '').slice(0, 80),
      notes: String(parsed.notes || 'Draft from photo — confirm details.').slice(0, 500),
      source: 'openai_vision',
    };
  } catch {
    return null;
  }
}

export async function draftFromPhoto({ buffer, mime, name, categoryHint }) {
  const ai = await draftWithOpenAI(buffer, mime, categoryHint).catch((err) => {
    console.error('vision error', err.message);
    return null;
  });
  if (ai) return ai;

  const category = guessCategory(name, categoryHint);
  const title = titleFromFilename(name) || `Scanned ${category} document`;
  return {
    category,
    title,
    institution: '',
    accountRef: '',
    notes: 'Draft from photo — open this item and fill bank/policy details. Photo is attached.',
    source: 'heuristic',
  };
}
