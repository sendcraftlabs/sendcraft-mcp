# sendcraft-mcp

<p align="center">
  <img src="https://sendcraft.online/logo.png" alt="SendCraft" width="72" />
</p>

<p align="center">
  <strong>Official MCP server for <a href="https://sendcraft.online">SendCraft</a> — lets AI agents send emails natively</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/sendcraft-mcp"><img src="https://img.shields.io/npm/v/sendcraft-mcp?color=6366f1&label=npm" alt="npm version" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="node" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT" />
  <img src="https://img.shields.io/badge/MCP-compatible-8b5cf6" alt="MCP" />
</p>

---

## What is this?

This is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that connects AI agents (Claude, Cursor, Windsurf, etc.) directly to the SendCraft email API. Once configured, your AI assistant can send emails, manage campaigns, check analytics, and more — all without leaving the chat.

**25 tools · 4 resources**

---

## Setup

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "sendcraft": {
      "command": "npx",
      "args": ["sendcraft-mcp"],
      "env": {
        "SENDCRAFT_API_KEY": "sc_live_..."
      }
    }
  }
}
```

### Cursor / Windsurf

Add to your MCP settings:

```json
{
  "sendcraft": {
    "command": "npx",
    "args": ["sendcraft-mcp"],
    "env": {
      "SENDCRAFT_API_KEY": "sc_live_..."
    }
  }
}
```

Get your API key from the [SendCraft Dashboard](https://sendcraft.online/dashboard/settings).

---

## Self-hosted

```json
{
  "env": {
    "SENDCRAFT_API_KEY": "your_key",
    "SENDCRAFT_BASE_URL": "https://api.yourinstance.com/api"
  }
}
```

---

## Tools

### Emails
| Tool | Description |
|------|-------------|
| `sendcraft_send_email` | Send a transactional email |
| `sendcraft_schedule_email` | Schedule an email for later |
| `sendcraft_cancel_scheduled_email` | Cancel a scheduled email |
| `sendcraft_batch_send` | Send up to 100 emails at once |
| `sendcraft_get_email` | Get email details by ID |
| `sendcraft_list_emails` | List sent emails |
| `sendcraft_get_stats` | Get delivery stats |

### Campaigns
| Tool | Description |
|------|-------------|
| `sendcraft_list_campaigns` | List all campaigns |
| `sendcraft_create_campaign` | Create a new campaign |
| `sendcraft_send_campaign` | Send or schedule a campaign |
| `sendcraft_get_campaign_analytics` | Open/click/bounce stats + heatmap |

### Subscribers
| Tool | Description |
|------|-------------|
| `sendcraft_list_subscribers` | List subscribers |
| `sendcraft_add_subscriber` | Add a subscriber to a list |
| `sendcraft_unsubscribe` | Unsubscribe an email address |
| `sendcraft_get_subscriber_topics` | Get topic preferences |

### Templates
| Tool | Description |
|------|-------------|
| `sendcraft_list_templates` | List email templates |
| `sendcraft_create_template` | Create a new template |

### Domains
| Tool | Description |
|------|-------------|
| `sendcraft_list_domains` | List sending domains |
| `sendcraft_add_domain` | Add a new domain |
| `sendcraft_verify_domain` | Trigger DNS verification |
| `sendcraft_analyze_dmarc` | Analyze DMARC configuration |

### Other
| Tool | Description |
|------|-------------|
| `sendcraft_list_segments` | List contact segments |
| `sendcraft_get_warmup_status` | SMTP IP warmup progress |
| `sendcraft_list_topics` | List mailing topics |
| `sendcraft_get_send_time` | AI-optimized send time |
| `sendcraft_list_api_keys` | List API keys |

---

## Resources

| URI | Description |
|-----|-------------|
| `sendcraft://stats` | Account-level email stats |
| `sendcraft://domains` | All verified domains |
| `sendcraft://warmup` | SMTP warmup status |
| `sendcraft://segments` | All contact segments |

---

## Example prompts

```
Send a welcome email to alice@example.com from hello@myapp.com

Create a campaign called "April Newsletter" and send it to subscribers

Show me the open rate for my last campaign

What's the best time to send emails based on my audience?

Add subscriber bob@example.com to my main list
```

---

## Related

| Package | Description |
|---------|-------------|
| [`@sendcraft/cli`](https://www.npmjs.com/package/@sendcraft/cli) | Official CLI |
| [`sendcraft-sdk`](https://www.npmjs.com/package/sendcraft-sdk) | Node.js SDK |
| [`sendcraft-sdk` (PyPI)](https://pypi.org/project/sendcraft-sdk/) | Python SDK |

---

## License

MIT © [SendCraft](https://sendcraft.online)
