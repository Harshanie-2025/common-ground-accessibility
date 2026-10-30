import { defineConfig, loadEnv } from 'vite';

const MAX_BODY_BYTES = 24_000;
const REQUESTS_PER_MINUTE = 12;
const rateWindows = new Map();

function json(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let text = '';
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request is too large.');
    text += chunk.toString('utf8');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Send a valid JSON request.');
  }
}

function takeRateLimit(request) {
  const now = Date.now();
  const key = request.socket.remoteAddress || 'local';
  const window = rateWindows.get(key);
  if (!window || now - window.startedAt >= 60_000) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (window.count >= REQUESTS_PER_MINUTE) return false;
  window.count += 1;
  return true;
}

function extractText(payload) {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.filter((item) => typeof item?.text === 'string').map((item) => item.text).join('\n').trim();
  return '';
}

function safeBoardContext(value) {
  const context = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const summary = context.summary && typeof context.summary === 'object' ? context.summary : {};
  const number = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(10_000, Math.round(Number(value)))) : 0;
  const categories = new Set(['Broken slab', 'Missing curb ramp', 'Pothole', 'Encroachment', 'Open drain', 'No tactile paving', 'Blocked path', 'No street light']);
  const priorities = new Set(['Critical', 'High', 'Medium', 'Low']);
  const issues = Array.isArray(context.issues) ? context.issues.slice(0, 15).map((issue) => ({
    id: number(issue?.id),
    category: categories.has(issue?.category) ? issue.category : 'Accessibility issue',
    score: number(issue?.score),
    priority: priorities.has(issue?.priority) ? issue.priority : 'Unranked',
    accessibilityImpact: number(issue?.accessibilityImpact),
    reports: number(issue?.reports),
    daysOpen: number(issue?.daysOpen),
    mergedReports: number(issue?.mergedReports)
  })) : [];
  return {
    selectedPersona: new Set(['Wheelchair user', 'Elderly', 'Visually impaired', 'Parent + stroller', 'Everyone']).has(context.selectedPersona) ? context.selectedPersona : 'Everyone',
    summary: {
      openIssues: number(summary.openIssues),
      completedIssues: number(summary.completedIssues),
      highPriorityIssues: number(summary.highPriorityIssues)
    },
    issues
  };
}

async function handleAssistantRequest(request, response) {
  if (request.method === 'GET') {
    json(response, 200, { configured: Boolean(process.env.OPENROUTER_API_KEY) });
    return;
  }
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    json(response, 405, { error: 'Use GET or POST for the AI assistant.' });
    return;
  }
  if (!takeRateLimit(request)) {
    json(response, 429, { error: 'Please wait a minute before sending more questions.' });
    return;
  }
  if (!process.env.OPENROUTER_API_KEY) {
    json(response, 503, { error: 'AI is not configured yet. Add your OpenRouter key to .env and restart the app.' });
    return;
  }

  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    json(response, 400, { error: error.message });
    return;
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    json(response, 400, { error: 'Send the question and issue summary as a JSON object.' });
    return;
  }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-8) : [];
  if (!messages.length || messages.some((item) =>
    !item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string' ||
    !item.content.trim() || item.content.length > (item.role === 'user' ? 1200 : 4000)
  )) {
    json(response, 400, { error: 'Add a question of up to 1,200 characters.' });
    return;
  }

  const contextText = JSON.stringify(safeBoardContext(body.context));

  const instructions = [
    'You are the Last 100 m Access Copilot for a civic accessibility dashboard.',
    'Use the supplied issue-board summary to answer questions about accessibility barriers, priority, and practical next steps.',
    'The dashboard score is the source of truth for ranking. Explain its factors; never invent or silently change scores.',
    'The supplied issues are prototype reports and may be seeded demo data. Say when evidence is incomplete; do not claim a field inspection, a verified route, or live facts.',
    'Keep answers plain, concise, respectful, and actionable. Consider the selected mobility persona and differences between wheelchair users, older adults, people with low vision, and stroller users.',
    'Do not ask for or infer a person\'s medical details. AI advice is a planning aid and does not mark work complete or alter the dashboard.'
  ].join(' ');
  const input = [
    { role: 'user', content: `Current dashboard summary (no exact GPS coordinates or photos):\n${contextText}` },
    ...messages.map(({ role, content }) => ({ role, content: content.trim() }))
  ];

  try {
    const apiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
        messages: [{ role: 'system', content: instructions }, ...input],
        max_tokens: 600,
        stream: false
      }),
      signal: AbortSignal.timeout(35_000)
    });
    const payload = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      const message = apiResponse.status === 401
        ? 'OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env.'
        : apiResponse.status === 429
          ? 'OpenRouter is rate-limited or the account has no available credits. Check its usage and limits.'
          : apiResponse.status === 402
            ? 'The OpenRouter account needs credits for this model. Add credits or choose a free model in OPENROUTER_MODEL.'
          : apiResponse.status === 404
            ? 'The configured model is unavailable. Set OPENROUTER_MODEL in .env to a model listed in your OpenRouter account.'
            : 'The AI service could not complete that request. Try again shortly.';
      json(response, apiResponse.status === 429 ? 429 : 502, { error: message });
      return;
    }
    const answer = extractText(payload);
    if (!answer) {
      json(response, 502, { error: 'The AI service returned an empty answer. Try asking another way.' });
      return;
    }
    json(response, 200, { answer });
  } catch {
    json(response, 502, { error: 'Could not reach the AI service. Check your connection and try again.' });
  }
}

function accessCopilotApi() {
  return {
    name: 'last-100-metres-access-copilot-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if ((request.url || '').split('?')[0] !== '/api/ai') return next();
        void handleAssistantRequest(request, response);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if ((request.url || '').split('?')[0] !== '/api/ai') return next();
        void handleAssistantRequest(request, response);
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (!process.env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY) process.env.OPENROUTER_API_KEY = env.OPENROUTER_API_KEY;
  if (!process.env.OPENROUTER_MODEL && env.OPENROUTER_MODEL) process.env.OPENROUTER_MODEL = env.OPENROUTER_MODEL;
  return { plugins: [accessCopilotApi()] };
});
