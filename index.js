#!/usr/bin/env node
/**
 * SendCraft MCP Server v2.0.0
 * 22 tools + 4 resources for AI agents (Claude, Cursor, Windsurf, etc.)
 *
 * Claude Desktop config:
 * {
 *   "mcpServers": {
 *     "sendcraft": {
 *       "command": "npx",
 *       "args": ["sendcraft-mcp"],
 *       "env": { "SENDCRAFT_API_KEY": "sc_live_..." }
 *     }
 *   }
 * }
 */

const { Server }              = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');

const API_KEY  = process.env.SENDCRAFT_API_KEY;
const BASE_URL = (() => {
  const raw = (process.env.SENDCRAFT_BASE_URL || 'https://api.sendcraft.online/api').replace(/\/$/, '');
  try {
    const u = new URL(raw);
    if (!['https:', 'http:'].includes(u.protocol)) throw new Error('Protocol must be http or https');
  } catch (e) {
    process.stderr.write(`[sendcraft-mcp] Invalid SENDCRAFT_BASE_URL: ${e.message}\n`);
    process.exit(1);
  }
  return raw;
})();

const VALID_ID = /^[a-zA-Z0-9_-]{1,128}$/;
function validateId(value, field) {
  if (typeof value !== 'string' || !VALID_ID.test(value))
    throw new Error(`Invalid ${field}: must be alphanumeric/dash/underscore, max 128 chars`);
  return value;
}

if (!API_KEY) {
  process.stderr.write('[sendcraft-mcp] SENDCRAFT_API_KEY is required\n');
  process.exit(1);
}

const http = axios.create({
  baseURL: BASE_URL,
  headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
  timeout: 30_000,
});

const api = {
  get:    (path, params)  => http({ method: 'get',    url: path, params }).then(r => r.data),
  post:   (path, data)    => http({ method: 'post',   url: path, data   }).then(r => r.data),
  put:    (path, data)    => http({ method: 'put',    url: path, data   }).then(r => r.data),
  patch:  (path, data)    => http({ method: 'patch',  url: path, data   }).then(r => r.data),
  delete: (path)          => http({ method: 'delete', url: path         }).then(r => r.data),
};

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  // ── Emails ──────────────────────────────────────────────────────────────────
  {
    name: 'sendcraft_send_email',
    description: 'Send a single transactional email immediately. Use this for order confirmations, password resets, notifications, and any one-off email triggered by a user action.',
    inputSchema: {
      type: 'object',
      properties: {
        to:         { type: 'string',  description: 'Recipient email address' },
        subject:    { type: 'string',  description: 'Email subject line' },
        html:       { type: 'string',  description: 'HTML email body. Include inline styles for best compatibility.' },
        text:       { type: 'string',  description: 'Plain text fallback body (recommended for deliverability)' },
        from:       { type: 'string',  description: 'Sender email address (uses account default if omitted)' },
        from_name:  { type: 'string',  description: 'Sender display name, e.g. "Acme Support"' },
        reply_to:   { type: 'string',  description: 'Reply-To address if different from sender' },
        cc:         { type: 'string',  description: 'CC address (single email)' },
        bcc:        { type: 'string',  description: 'BCC address (single email)' },
        idempotency_key: { type: 'string', description: 'Unique key to prevent duplicate sends on retry (e.g. "order-123-confirm")' },
      },
      required: ['to', 'subject', 'html'],
    },
  },
  {
    name: 'sendcraft_schedule_email',
    description: 'Schedule an email for future delivery. Use this for reminders, follow-ups, drip messages, or any email that should go out at a specific time.',
    inputSchema: {
      type: 'object',
      properties: {
        to:           { type: 'string', description: 'Recipient email' },
        subject:      { type: 'string', description: 'Subject line' },
        html:         { type: 'string', description: 'HTML body' },
        scheduled_at: { type: 'string', description: 'ISO 8601 datetime, e.g. "2026-04-01T09:00:00Z"' },
        from:         { type: 'string', description: 'Sender email (optional)' },
      },
      required: ['to', 'subject', 'html', 'scheduled_at'],
    },
  },
  {
    name: 'sendcraft_cancel_scheduled_email',
    description: 'Cancel a scheduled email before it is sent. Use when a user cancels an order, changes their preferences, or the scheduled action is no longer needed.',
    inputSchema: {
      type: 'object',
      properties: {
        email_id: { type: 'string', description: 'The ID of the scheduled email to cancel' },
      },
      required: ['email_id'],
    },
  },
  {
    name: 'sendcraft_batch_send',
    description: 'Send up to 100 distinct emails in a single API call. Each email can have a different recipient, subject, and body. More efficient than calling send_email 100 times.',
    inputSchema: {
      type: 'object',
      properties: {
        emails: {
          type: 'array',
          description: 'Array of email objects. Each must have to, subject, and html.',
          items: {
            type: 'object',
            properties: {
              to:      { type: 'string' },
              subject: { type: 'string' },
              html:    { type: 'string' },
              text:    { type: 'string' },
              from:    { type: 'string' },
            },
            required: ['to', 'subject', 'html'],
          },
        },
      },
      required: ['emails'],
    },
  },
  {
    name: 'sendcraft_get_email',
    description: 'Retrieve details and delivery status for a single email by its ID. Use to check whether a specific email was delivered, opened, or bounced.',
    inputSchema: {
      type: 'object',
      properties: {
        email_id: { type: 'string', description: 'Email ID returned from send or list calls' },
      },
      required: ['email_id'],
    },
  },
  {
    name: 'sendcraft_list_emails',
    description: 'List recently sent emails with delivery status. Use to audit what was sent, find a specific email, or monitor deliverability.',
    inputSchema: {
      type: 'object',
      properties: {
        limit:       { type: 'number', description: 'Number of emails to return (default 20, max 100)' },
        page:        { type: 'number', description: 'Page number for pagination (default 1)' },
        status:      { type: 'string', description: 'Filter: sent, delivered, failed, bounced, opened, scheduled, cancelled' },
        campaign_id: { type: 'string', description: 'Filter emails belonging to a specific campaign' },
      },
    },
  },
  {
    name: 'sendcraft_get_stats',
    description: 'Get aggregate email statistics: total sent, open rate, click rate, bounce rate, and complaint rate. Use to understand overall sending health.',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── Campaigns ───────────────────────────────────────────────────────────────
  {
    name: 'sendcraft_list_campaigns',
    description: 'List email marketing campaigns with their status and performance metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        limit:  { type: 'number', description: 'Number to return (default 20)' },
        status: { type: 'string', description: 'Filter: draft, scheduled, sent, sending' },
      },
    },
  },
  {
    name: 'sendcraft_create_campaign',
    description: 'Create a new email marketing campaign. After creating, call sendcraft_send_campaign to send it.',
    inputSchema: {
      type: 'object',
      properties: {
        name:       { type: 'string', description: 'Internal campaign name (not shown to recipients)' },
        subject:    { type: 'string', description: 'Email subject line recipients will see' },
        html:       { type: 'string', description: 'HTML email body' },
        from_email: { type: 'string', description: 'Sender email address' },
        from_name:  { type: 'string', description: 'Sender display name' },
        recipients: {
          type: 'array',
          description: 'Array of recipient email addresses or subscriber list IDs',
          items: { type: 'string' },
        },
      },
      required: ['name', 'subject', 'html', 'recipients'],
    },
  },
  {
    name: 'sendcraft_send_campaign',
    description: 'Send an existing draft campaign immediately, or schedule it for a future time.',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id:  { type: 'string', description: 'Campaign ID to send' },
        scheduled_at: { type: 'string', description: 'ISO 8601 datetime to schedule (omit for immediate send)' },
      },
      required: ['campaign_id'],
    },
  },
  {
    name: 'sendcraft_get_campaign_analytics',
    description: 'Get detailed analytics for a specific campaign: opens, clicks, bounces, unsubscribes, and click heatmap data.',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
      },
      required: ['campaign_id'],
    },
  },

  // ── Subscribers ─────────────────────────────────────────────────────────────
  {
    name: 'sendcraft_list_subscribers',
    description: 'List subscribers/contacts with their status and tags.',
    inputSchema: {
      type: 'object',
      properties: {
        limit:   { type: 'number', description: 'Number to return (default 20, max 100)' },
        page:    { type: 'number', description: 'Page number' },
        status:  { type: 'string', description: 'Filter: active, pending, unsubscribed' },
        list_id: { type: 'string', description: 'Filter by email list ID' },
      },
    },
  },
  {
    name: 'sendcraft_add_subscriber',
    description: 'Add a new subscriber/contact to a list. If the list has double opt-in enabled, a confirmation email is sent automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        email:      { type: 'string', description: 'Subscriber email address' },
        list_id:    { type: 'string', description: 'Email list ID to add them to' },
        first_name: { type: 'string', description: 'First name (optional)' },
        last_name:  { type: 'string', description: 'Last name (optional)' },
        tags:       { type: 'array', items: { type: 'string' }, description: 'Tags to attach, e.g. ["customer", "trial"]' },
      },
      required: ['email', 'list_id'],
    },
  },
  {
    name: 'sendcraft_unsubscribe',
    description: 'Unsubscribe a contact from all marketing emails. Use when processing manual unsubscribe requests or GDPR deletion requests.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email address to unsubscribe' },
      },
      required: ['email'],
    },
  },

  // ── Templates ────────────────────────────────────────────────────────────────
  {
    name: 'sendcraft_list_templates',
    description: 'List saved email templates. Templates can be reused across campaigns and transactional emails.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number to return (default 20)' },
      },
    },
  },
  {
    name: 'sendcraft_create_template',
    description: 'Save an email template for reuse. Templates support {{variable}} placeholders for personalization.',
    inputSchema: {
      type: 'object',
      properties: {
        name:    { type: 'string', description: 'Template name (internal)' },
        subject: { type: 'string', description: 'Default subject line (can include {{variables}})' },
        html:    { type: 'string', description: 'HTML body (can include {{firstName}}, {{companyName}}, etc.)' },
        text:    { type: 'string', description: 'Plain text version (optional)' },
      },
      required: ['name', 'subject', 'html'],
    },
  },

  // ── Domains ──────────────────────────────────────────────────────────────────
  {
    name: 'sendcraft_list_domains',
    description: 'List sender domains and their DNS verification status (SPF, DKIM, DMARC). Emails from unverified domains may land in spam.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'sendcraft_add_domain',
    description: 'Add a new sender domain and get the DNS records (SPF, DKIM, DMARC, BIMI) to configure at your DNS provider.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Domain name to add, e.g. "mystore.com"' },
      },
      required: ['domain'],
    },
  },
  {
    name: 'sendcraft_verify_domain',
    description: 'Check if the DNS records for a domain are correctly configured. Call this after updating DNS records to confirm verification.',
    inputSchema: {
      type: 'object',
      properties: {
        domain_id: { type: 'string', description: 'Domain ID from list_domains' },
      },
      required: ['domain_id'],
    },
  },
  {
    name: 'sendcraft_analyze_dmarc',
    description: 'Analyze the DMARC record for a verified domain. Returns a score (0-100), policy strength, and specific issues to fix.',
    inputSchema: {
      type: 'object',
      properties: {
        domain_id: { type: 'string', description: 'Domain ID from list_domains' },
      },
      required: ['domain_id'],
    },
  },

  // ── Segments ─────────────────────────────────────────────────────────────────
  {
    name: 'sendcraft_list_segments',
    description: 'List subscriber segments. Segments are dynamic groups of subscribers matching specific criteria (country, tags, activity, etc.).',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── SMTP Warmup ──────────────────────────────────────────────────────────────
  {
    name: 'sendcraft_get_warmup_status',
    description: 'Check the IP warmup status for the self-hosted SMTP server. Returns current day, daily send limit, emails sent today, and remaining quota. Important to check before sending large batches.',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── Topics ───────────────────────────────────────────────────────────────────
  {
    name: 'sendcraft_list_topics',
    description: 'List email topics/categories. Topics let subscribers choose which types of emails they receive (e.g. product-updates, weekly-digest, promotions).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'sendcraft_get_subscriber_topics',
    description: 'Get the topic preferences for a specific subscriber — which topics they are opted in or out of.',
    inputSchema: {
      type: 'object',
      properties: {
        subscriber_id: { type: 'string', description: 'Subscriber ID' },
      },
      required: ['subscriber_id'],
    },
  },

  // ── AI / Send-Time ───────────────────────────────────────────────────────────
  {
    name: 'sendcraft_get_send_time',
    description: 'Get AI-powered send-time optimisation. Returns the best day of week and hour of day (UTC) to send campaigns for maximum open rate, based on your subscribers\' historical open patterns.',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── API Keys ─────────────────────────────────────────────────────────────────
  {
    name: 'sendcraft_list_api_keys',
    description: 'List API keys for the account. Returns masked keys (never the full value), permissions scope, and last-used date.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ─── Resources ────────────────────────────────────────────────────────────────
// Resources let Claude load context into its window before answering questions

const RESOURCES = [
  {
    uri:         'sendcraft://stats',
    name:        'Email Statistics',
    description: 'Live email sending stats: open rate, click rate, total sent, bounces',
    mimeType:    'application/json',
  },
  {
    uri:         'sendcraft://domains',
    name:        'Verified Domains',
    description: 'List of sender domains and their SPF/DKIM/DMARC verification status',
    mimeType:    'application/json',
  },
  {
    uri:         'sendcraft://warmup',
    name:        'SMTP Warmup Status',
    description: 'Current IP warmup day, daily limit, and emails sent today',
    mimeType:    'application/json',
  },
  {
    uri:         'sendcraft://segments',
    name:        'Subscriber Segments',
    description: 'All subscriber segments with names and subscriber counts',
    mimeType:    'application/json',
  },
];

// ─── Response Helpers ─────────────────────────────────────────────────────────

function ok(data, summary) {
  const text = summary
    ? `${summary}\n\n${JSON.stringify(data, null, 2)}`
    : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }] };
}

function fail(err) {
  const msg = err.response?.data?.error || 'An error occurred. Check your API key and try again.';
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

function emailSummary(e) {
  return `Status: ${e.status} | To: ${e.toEmail} | Subject: ${e.subject} | Sent: ${e.createdAt || '—'}`;
}

function domainSummary(d) {
  const checks = [
    d.spfVerified  ? '✓ SPF'  : '✗ SPF',
    d.dkimVerified ? '✓ DKIM' : '✗ DKIM',
    d.dmarcVerified? '✓ DMARC': '✗ DMARC',
  ];
  return `${d.domain} — ${d.status} (${checks.join(', ')})`;
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'sendcraft', version: '2.2.0' },
  { capabilities: { tools: {}, resources: {} } }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

// List resources
server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));

// Read resource
server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const { uri } = req.params;
  try {
    let data;
    if (uri === 'sendcraft://stats')    data = await api.get('/emails/stats/summary');
    else if (uri === 'sendcraft://domains')  data = await api.get('/domains');
    else if (uri === 'sendcraft://warmup')   data = await api.get('/smtp/warmup');
    else if (uri === 'sendcraft://segments') data = await api.get('/segments');
    else throw new Error('Unknown resource URI');

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(data, null, 2),
      }],
    };
  } catch (err) {
    throw new Error(err.response?.data?.error || err.message);
  }
});

// Call tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  // Prevent prototype pollution: copy only own enumerable properties
  const raw = request.params.arguments ?? {};
  const a = Object.assign(Object.create(null), raw);

  try {
    switch (name) {

      // ── Emails ──────────────────────────────────────────────────────────────
      case 'sendcraft_send_email': {
        const headers = a.idempotency_key ? { 'X-Idempotency-Key': a.idempotency_key } : {};
        const res = await http({
          method: 'post', url: '/emails/send',
          data: {
            toEmail: a.to, subject: a.subject,
            htmlContent: a.html, plainTextContent: a.text,
            fromEmail: a.from, fromName: a.from_name, replyTo: a.reply_to,
            cc: a.cc, bcc: a.bcc,
          },
          headers,
        }).then(r => r.data);
        return ok(res, `Email queued for delivery to ${a.to}`);
      }

      case 'sendcraft_schedule_email': {
        const res = await api.post('/emails/schedule', {
          toEmail: a.to, subject: a.subject,
          htmlContent: a.html, fromEmail: a.from,
          scheduledTime: a.scheduled_at,
        });
        return ok(res, `Email scheduled for ${a.scheduled_at} → ${a.to}`);
      }

      case 'sendcraft_cancel_scheduled_email': {
        const emailId = validateId(a.email_id, 'email_id');
        const res = await api.delete(`/emails/${emailId}/schedule`);
        return ok(res, `Scheduled email ${emailId} cancelled.`);
      }

      case 'sendcraft_batch_send': {
        if (!Array.isArray(a.emails) || a.emails.length === 0) throw new Error('emails must be a non-empty array');
        if (a.emails.length > 100) throw new Error('emails array exceeds maximum of 100 per batch');
        const mapped = a.emails.map(e => ({
          toEmail: e.to, subject: e.subject,
          htmlContent: e.html, plainTextContent: e.text, fromEmail: e.from,
        }));
        const res = await api.post('/emails/batch', { emails: mapped });
        const total = a.emails.length;
        const ok_count = res.results?.filter(r => r.success)?.length ?? total;
        return ok(res, `Batch send: ${ok_count}/${total} emails queued.`);
      }

      case 'sendcraft_get_email': {
        const res = await api.get(`/emails/${validateId(a.email_id, 'email_id')}`);
        const e = res.email || res;
        return ok(res, emailSummary(e));
      }

      case 'sendcraft_list_emails': {
        const res = await api.get('/emails', {
          limit: a.limit || 20, page: a.page || 1,
          status: a.status, campaignId: a.campaign_id,
        });
        const emails = res.emails || [];
        const summary = `Found ${emails.length} of ${res.total || '?'} emails.`;
        return ok(res, summary);
      }

      case 'sendcraft_get_stats': {
        const res = await api.get('/emails/stats/summary');
        const s = res.stats || res;
        const summary = [
          `Total sent: ${s.totalSent ?? '—'}`,
          `Open rate: ${s.openRate !== null ? `${(s.openRate * 100).toFixed(1)}%` : '—'}`,
          `Click rate: ${s.clickRate !== null ? `${(s.clickRate * 100).toFixed(1)}%` : '—'}`,
          `Bounce rate: ${s.bounceRate !== null ? `${(s.bounceRate * 100).toFixed(1)}%` : '—'}`,
        ].join(' | ');
        return ok(res, summary);
      }

      // ── Campaigns ────────────────────────────────────────────────────────────
      case 'sendcraft_list_campaigns': {
        const res = await api.get('/campaigns', { limit: a.limit || 20, status: a.status });
        const list = res.campaigns || [];
        const summary = `Found ${list.length} campaigns.`;
        return ok(res, summary);
      }

      case 'sendcraft_create_campaign': {
        const res = await api.post('/campaigns', {
          name: a.name, subject: a.subject,
          htmlContent: a.html, fromEmail: a.from_email, fromName: a.from_name,
          recipients: a.recipients,
        });
        const id = res.campaign?._id || '—';
        return ok(res, `Campaign created. ID: ${id}. Call sendcraft_send_campaign to send it.`);
      }

      case 'sendcraft_send_campaign': {
        const body = a.scheduled_at ? { scheduledAt: a.scheduled_at } : {};
        const res = await api.post(`/campaigns/${validateId(a.campaign_id, 'campaign_id')}/send`, body);
        const msg = a.scheduled_at
          ? `Campaign scheduled for ${a.scheduled_at}.`
          : 'Campaign is sending now.';
        return ok(res, msg);
      }

      case 'sendcraft_get_campaign_analytics': {
        const campaignId = validateId(a.campaign_id, 'campaign_id');
        const [analytics, heatmap] = await Promise.allSettled([
          api.get(`/analytics/campaign/${campaignId}`),
          api.get(`/analytics/campaign/${campaignId}/heatmap`),
        ]);
        const data = {
          analytics: analytics.status === 'fulfilled' ? analytics.value : null,
          heatmap:   heatmap.status   === 'fulfilled' ? heatmap.value   : null,
        };
        return ok(data, `Analytics for campaign ${a.campaign_id}`);
      }

      // ── Subscribers ──────────────────────────────────────────────────────────
      case 'sendcraft_list_subscribers': {
        const res = await api.get('/subscribers', {
          limit: a.limit || 20, page: a.page || 1,
          status: a.status, listId: a.list_id,
        });
        const subs = res.subscribers || [];
        return ok(res, `Found ${subs.length} of ${res.total || '?'} subscribers.`);
      }

      case 'sendcraft_add_subscriber': {
        const res = await api.post('/subscribers/add', {
          email: a.email, listId: a.list_id,
          firstName: a.first_name, lastName: a.last_name, tags: a.tags,
        });
        return ok(res, `Subscriber ${a.email} added.`);
      }

      case 'sendcraft_unsubscribe': {
        const res = await api.post('/compliance/unsubscribe', { email: a.email });
        return ok(res, `${a.email} unsubscribed from all marketing emails.`);
      }

      // ── Templates ────────────────────────────────────────────────────────────
      case 'sendcraft_list_templates': {
        const res = await api.get('/templates', { limit: a.limit || 20 });
        const list = res.templates || [];
        return ok(res, `Found ${list.length} templates.`);
      }

      case 'sendcraft_create_template': {
        const res = await api.post('/templates', {
          name: a.name, subject: a.subject,
          htmlContent: a.html, plainTextContent: a.text,
        });
        const id = res.template?._id || '—';
        return ok(res, `Template "${a.name}" created. ID: ${id}`);
      }

      // ── Domains ──────────────────────────────────────────────────────────────
      case 'sendcraft_list_domains': {
        const res = await api.get('/domains');
        const domains = res.domains || [];
        const lines = domains.map(domainSummary).join('\n');
        return ok(res, `${domains.length} domain(s):\n${lines}`);
      }

      case 'sendcraft_add_domain': {
        const res = await api.post('/domains', { domain: a.domain });
        const records = (res.dnsRecords || [])
          .map(r => `${r.purpose}: ${r.name} → ${r.value}`)
          .join('\n');
        return ok(res, `Domain ${a.domain} added. Add these DNS records:\n${records}`);
      }

      case 'sendcraft_verify_domain': {
        const res = await api.post(`/domains/${validateId(a.domain_id, 'domain_id')}/verify`);
        const r = res.results || {};
        const status = [
          `SPF: ${r.spf ? '✓' : '✗'}`,
          `DKIM: ${r.dkim ? '✓' : '✗'}`,
          `DMARC: ${r.dmarc ? '✓' : '✗'}`,
        ].join(' | ');
        const msg = res.verified
          ? `Domain fully verified and ready to send. ${status}`
          : `Verification pending. ${status}. DNS changes can take up to 48h.`;
        return ok(res, msg);
      }

      case 'sendcraft_analyze_dmarc': {
        const res = await api.get(`/domains/${validateId(a.domain_id, 'domain_id')}/dmarc-report`);
        const summary = res.isValid
          ? `DMARC score: ${res.score}/100 | Policy: ${res.policy} | Issues: ${res.issues?.length ? res.issues.join('; ') : 'none'}`
          : `No valid DMARC record found. ${(res.issues || []).join('; ')}`;
        return ok(res, summary);
      }

      // ── Segments ─────────────────────────────────────────────────────────────
      case 'sendcraft_list_segments': {
        const res = await api.get('/segments');
        const segs = res.segments || [];
        const lines = segs.map(s => `${s.name} (${s.subscriberCount ?? '?'} subscribers)`).join('\n');
        return ok(res, `${segs.length} segment(s):\n${lines}`);
      }

      // ── SMTP Warmup ──────────────────────────────────────────────────────────
      case 'sendcraft_get_warmup_status': {
        const res = await api.get('/smtp/warmup');
        const msg = res.isWarmedUp
          ? 'IP is fully warmed up — no daily sending limits.'
          : `Warmup day ${res.warmupDay}: sent ${res.todayCount}/${res.dailyLimit} today. Remaining: ${res.remainingToday}.`;
        return ok(res, msg);
      }

      // ── Topics ───────────────────────────────────────────────────────────────
      case 'sendcraft_list_topics': {
        const res = await api.get('/topics');
        const list = res.topics || [];
        const lines = list.map(t => `${t.name} (${t.displayName}) — ${t.subscriberCount ?? '?'} subscribers`).join('\n');
        return ok(res, `${list.length} topic(s):\n${lines}`);
      }

      case 'sendcraft_get_subscriber_topics': {
        const subId = validateId(a.subscriber_id, 'subscriber_id');
        const res = await api.get(`/subscribers/${subId}/topics`);
        return ok(res, `Topic preferences for subscriber ${subId}`);
      }

      // ── AI / Send-Time ────────────────────────────────────────────────────────
      case 'sendcraft_get_send_time': {
        const res = await api.get('/analytics/send-time');
        const r = res.recommendation;
        const summary = r
          ? `Best time: ${r.bestDay} at ${r.bestHour}:00 UTC (${r.confidence} confidence). ${r.reasoning}`
          : 'Not enough open data yet — send more campaigns to get a recommendation.';
        return ok(res, summary);
      }

      // ── API Keys ─────────────────────────────────────────────────────────────
      case 'sendcraft_list_api_keys': {
        const res = await api.get('/user/keys');
        const keys = res.keys || [];
        const lines = keys.map(k =>
          `${k.name} (${k.permissions}) — last used: ${k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'never'}`
        ).join('\n');
        return ok(res, `${keys.length} key(s):\n${lines}`);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return fail(err);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[sendcraft-mcp] v2.2.0 running — 25 tools, 4 resources\n');
}

main().catch(() => {
  process.stderr.write('[sendcraft-mcp] Fatal startup error. Exiting.\n');
  process.exit(1);
});
