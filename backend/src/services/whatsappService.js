const { normalizeWhatsAppNumber } = require('../utils/whatsappPhone');

function isWhatsAppConfigured() {
  return (
    process.env.WHATSAPP_ENABLED === 'true' &&
    Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim()) &&
    Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()) &&
    Boolean(process.env.WHATSAPP_TEMPLATE_NAME?.trim())
  );
}

function getWhatsAppConfig() {
  return {
    enabled: process.env.WHATSAPP_ENABLED === 'true',
    graphVersion: process.env.WHATSAPP_GRAPH_API_VERSION || 'v25.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN?.trim() || '',
    templateName: process.env.WHATSAPP_TEMPLATE_NAME?.trim() || 'daily_attendance_update',
    templateLang: process.env.WHATSAPP_TEMPLATE_LANG?.trim() || 'en',
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send approved utility template with body parameters ({{1}}..{{n}}).
 * @param {string} toE164Digits - e.g. 919600844041
 * @param {string[]} bodyParameters - ordered template variables
 */
async function sendTemplateMessage(toE164Digits, bodyParameters) {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled || !cfg.accessToken || !cfg.phoneNumberId) {
    throw new Error('WhatsApp API is not configured on the server');
  }

  const to = normalizeWhatsAppNumber(toE164Digits);
  if (!to) {
    throw new Error('Invalid recipient phone number');
  }

  const parameters = (bodyParameters || []).map((text) => ({
    type: 'text',
    text: String(text ?? ''),
  }));

  const url = `https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: cfg.templateName,
      language: { code: cfg.templateLang },
      components: [
        {
          type: 'body',
          parameters,
        },
      ],
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `WhatsApp API error (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.details = json?.error;
    throw err;
  }

  return json;
}

async function sendTemplateMessageWithRetry(toE164Digits, bodyParameters, retries = 1) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await sendTemplateMessage(toE164Digits, bodyParameters);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await sleep(2000);
      }
    }
  }
  throw lastErr;
}

module.exports = {
  isWhatsAppConfigured,
  getWhatsAppConfig,
  sendTemplateMessage,
  sendTemplateMessageWithRetry,
  normalizeWhatsAppNumber,
};
