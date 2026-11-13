# InboxDeal AI — 1-Click Gmail Quote & Ghosted Deal Tracker to Google Sheets (MCP Server)

[![Website](https://img.shields.io/badge/Live_Sandbox-aurashot.justfancynow.com%2Finboxdeal-d97706)](https://aurashot.justfancynow.com/inboxdeal)
[![MCP Protocol](https://img.shields.io/badge/MCP-2024--11--05-10b981)](https://github.com/hugocodehugo/inboxdeal-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-slate.svg)](https://opensource.org/licenses/MIT)

**InboxDeal AI** (`@inboxdeal/mcp-server`) is a zero-dependency **Model Context Protocol (MCP) Server** for **Claude Desktop, Cursor, Windsurf, and Gmail/Outlook RevOps workflows**. It scans B2B email threads to extract quoted deal amounts (`$14,500`), flag ghosted/unreplied prospects (`🔴 GHOSTED_RISK`), generate **3-sentence high-EQ follow-up drafts**, and export clean **Google Sheets CRM TSV/CSV** in 1 click.

- 🌐 **Try Live Interactive Web Sandbox**: [https://aurashot.justfancynow.com/inboxdeal](https://aurashot.justfancynow.com/inboxdeal)
- 📦 **Download Chrome Extension (.zip v1.0.0)**: [https://aurashot.justfancynow.com/downloads/inboxdeal-ai-v1.0.0.zip](https://aurashot.justfancynow.com/downloads/inboxdeal-ai-v1.0.0.zip)
- 🔒 **Privacy Policy**: [https://aurashot.justfancynow.com/sheetpulse/privacy](https://aurashot.justfancynow.com/sheetpulse/privacy)

---

## 🚀 10-Second Setup (Claude Desktop / Cursor)

```json
{
  "mcpServers": {
    "inboxdeal-ai": {
      "command": "npx",
      "args": ["-y", "@inboxdeal/mcp-server"]
    }
  }
}
```
