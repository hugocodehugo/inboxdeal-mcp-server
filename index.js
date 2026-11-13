#!/usr/bin/env node
/**
 * InboxDeal AI — Standard Model Context Protocol (MCP) Server v1.0.0
 * #3 Blue-Ocean Ecosystem Agent (Highest ARPU B2B Sales/RevOps tool: Gmail Quote & Follow-up Tracker to Sheets).
 * Zero external dependencies. Scans email threads or messages to extract:
 *   1) Quoted Deal Value ($12,500, €8,400, etc.) & Normalized USD/Number
 *   2) Ghosted / Unreplied Days & Risk Status (🔴 GHOSTED_RISK / 🟡 FOLLOWUP_DUE / 🟢 ACTIVE)
 *   3) 3-Sentence High-EQ Follow-Up Draft
 *   4) 1-Click Google Sheets CRM TSV & UTF-8 CSV Export
 * Includes CFO Daily 3 Free Scans Circuit Breaker & Sales @company.com <$50 ($29/mo) Expense Invoice Engine.
 */
'use strict';

const readline = require('node:readline');

const SERVER_INFO = {
  name: 'inboxdeal-ai-mcp',
  version: '1.0.0',
};

const MAX_FREE_DAILY_SCANS = 3;
const MAX_FREE_THREADS_PER_SCAN = 25;

const PUBLIC_AND_EDU_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'msn.com', 'yahoo.com', 'ymail.com', 'icloud.com', 'me.com', 'mac.com',
  'qq.com', 'vip.qq.com', '163.com', '126.com', 'yeah.net', 'foxmail.com',
  'sina.com', 'sohu.com', 'aliyun.com', 'proton.me', 'protonmail.com',
  'zoho.com', 'aol.com', 'gmx.com', 'mail.com', 'yandex.com', 'hey.com',
  'fastmail.com', 'tutanota.com'
]);

function extractQuoteAmount(text) {
  const str = String(text || '');
  const m = str.match(/([$€£¥]\s*[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?(?:\s*[KMBkmb])?)/);
  if (!m) return { rawQuote: '$0', normalizedAmount: 0 };
  const rawQuote = m[1].replace(/\s+/g, '');
  let numStr = rawQuote.replace(/^[$€£¥]/, '').replace(/,/g, '');
  let multiplier = 1;
  if (/k$/i.test(numStr)) {
    multiplier = 1000;
    numStr = numStr.slice(0, -1);
  } else if (/m$/i.test(numStr)) {
    multiplier = 1000000;
    numStr = numStr.slice(0, -1);
  }
  const normalizedAmount = Math.round(( parseFloat(numStr) || 0 ) * multiplier * 100) / 100;
  return { rawQuote, normalizedAmount };
}

function classifyDealStatus(ghostedDays) {
  const days = Math.max(0, Number(ghostedDays) || 0);
  if (days >= 5) return '🔴 GHOSTED_RISK';
  if (days >= 3) return '🟡 FOLLOWUP_DUE';
  return '🟢 ACTIVE_THREAD';
}

function generateFollowUpDraft(deal) {
  const contact = deal.contactName || deal.prospectEmail || 'there';
  const company = deal.company || 'your team';
  const quote = deal.rawQuote && deal.rawQuote !== '$0' ? ` (${deal.rawQuote} proposal)` : '';
  return [
    `Hi ${contact}, hope your week at ${company} is going smoothly!`,
    `Wanted to quickly float our ${deal.subject || 'partnership'}${quote} back to the top of your inbox in case you had any questions on scope or timeline.`,
    `Would a quick 5-minute async check-in this Thursday help lock in next steps, or should I adjust anything on the quote for your finance review?`
  ].join(' ');
}

function analyzeEmailThreads(threads = [], options = {}) {
  const enforceFreeCap = Boolean(options.enforceFreeCap);
  const source = Array.isArray(threads)
    ? (enforceFreeCap ? threads.slice(0, MAX_FREE_THREADS_PER_SCAN) : threads)
    : [];

  const deals = source.map((t, idx) => {
    const body = String(t.snippet || t.body || t.subject || '');
    const { rawQuote, normalizedAmount } = extractQuoteAmount(`${t.subject || ''} ${body}`);
    const ghostedDays = Number(t.ghostedDays ?? t.daysSinceLastReply ?? 0);
    const status = classifyDealStatus(ghostedDays);
    const prospectEmail = String(t.from || t.prospectEmail || `prospect${idx + 1}@client.com`).trim();
    const company = t.company || (prospectEmail.includes('@') ? prospectEmail.split('@')[1] : 'Client Co');
    const contactName = t.contactName || prospectEmail.split('@')[0];

    const record = {
      id: `deal-${idx + 1}`,
      prospectEmail,
      contactName,
      company,
      subject: String(t.subject || 'B2B Proposal & Quote').trim(),
      rawQuote,
      normalizedAmount,
      ghostedDays,
      status,
    };
    record.followUpDraft = generateFollowUpDraft(record);
    return record;
  });

  const headers = ['Deal ID', 'Company', 'Prospect Email', 'Subject', 'Quote Amount', 'Ghosted Days', 'Status', '3-Line Follow-Up Draft'];
  const rows = [
    headers,
    ...deals.map((d) => [
      d.id,
      d.company,
      d.prospectEmail,
      d.subject,
      String(d.normalizedAmount),
      String(d.ghostedDays),
      d.status,
      d.followUpDraft,
    ]),
  ];

  const tsv = rows.map((r) => r.map((c) => String(c).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
  const csv = rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c);
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
    .join('\r\n');

  const totalPipelineValue = deals.reduce((acc, d) => acc + d.normalizedAmount, 0);
  const ghostedCount = deals.filter((d) => d.ghostedDays >= 3).length;

  return {
    dealCount: deals.length,
    totalPipelineValue,
    ghostedCount,
    deals,
    tsv,
    csv,
  };
}

function evaluateDailyScanCircuitBreaker(state = {}, todayStr = new Date().toISOString().slice(0, 10)) {
  const isPaid = state.tier === 'pro' || state.tier === 'team';
  if (isPaid) {
    return {
      allowed: true,
      remainingToday: Infinity,
      maxThreadsPerScan: 500,
      reason: 'PAID_UNLIMITED',
      nextState: { ...state, lastDate: todayStr },
    };
  }

  const usedToday = state.lastDate === todayStr ? Number(state.usedToday || 0) : 0;
  const dailyRemaining = Math.max(0, MAX_FREE_DAILY_SCANS - usedToday);

  if (dailyRemaining <= 0) {
    return {
      allowed: false,
      remainingToday: 0,
      maxThreadsPerScan: MAX_FREE_THREADS_PER_SCAN,
      reason: 'CFO_DAILY_3_SCANS_CIRCUIT_BREAKER_TRIPPED',
      nextState: { ...state, lastDate: todayStr, usedToday },
    };
  }

  return {
    allowed: true,
    remainingToday: dailyRemaining - 1,
    maxThreadsPerScan: MAX_FREE_THREADS_PER_SCAN,
    reason: 'FREE_QUOTA_OK',
    nextState: {
      ...state,
      lastDate: todayStr,
      usedToday: usedToday + 1,
    },
  };
}

function inspectCorporateEmail(email) {
  const clean = String(email || '').trim().toLowerCase();
  const m = clean.match(/^[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})$/i);
  if (!m) {
    return { isValid: false, isCorporate: false, domain: '' };
  }
  const domain = m[1].toLowerCase();
  const isEduOrGov = /\.(edu|ac\.[a-z]{2}|gov|mil)$/i.test(domain);
  const isPublic = PUBLIC_AND_EDU_DOMAINS.has(domain) || isEduOrGov;
  const isCorporate = !isPublic;

  return {
    isValid: true,
    isCorporate,
    domain,
    recommendedPlan: isCorporate
      ? `Team Workspace Plan ($29/mo — No-Approval <$50 Expense Ready for @${domain})`
      : 'Pro Individual Plan ($9.90/mo)',
    checkoutPriceUsd: isCorporate ? 29.0 : 9.9,
  };
}

function generateManagerSlackPitch(params = {}) {
  const domain = params.domain || 'our team';
  return [
    `Hi! I'm using InboxDeal AI to automatically extract B2B email quotes into Google Sheets CRM and flag ghosted deals before they slip (recovers ~2-3 stalled deals/month for @${domain}).`,
    `The Team Workspace plan is $29/mo (under our $50 auto-approval software expense limit) and includes 5 shared sales/ops seats.`,
    `I've attached the standard Cloud CRM & Revenue Intelligence tax receipt — putting this on the team card for this month!`
  ].join(' ');
}

function generateExpenseInvoiceHtml(params = {}) {
  const email = params.email || 'user@company.com';
  const domain = params.domain || email.split('@')[1] || 'company.com';
  const dateStr = params.dateStr || new Date().toISOString().slice(0, 10);
  const invoiceNo = params.invoiceNo || `INV-ID-${dateStr.replace(/-/g, '')}-2900`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tax Invoice ${invoiceNo} — InboxDeal AI Revenue Intelligence</title>
</head>
<body style="font-family:sans-serif;max-width:680px;margin:32px auto;padding:28px;border:1px solid #cbd5e1;border-radius:10px;color:#0f172a;">
  <div style="display:flex;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:16px;margin-bottom:20px;">
    <div>
      <h2 style="margin:0;">InboxDeal AI Inc.</h2>
      <div style="font-size:12px;color:#475569;">Category: Cloud CRM Pipeline &amp; Email Revenue Intelligence Software</div>
    </div>
    <div style="text-align:right;">
      <span style="background:#fef3c7;color:#92400e;font-weight:700;font-size:12px;padding:4px 10px;border-radius:999px;">PAID / EXPENSE-READY (&lt;$50 AUTO-APPROVAL)</span>
      <div style="font-size:12px;color:#475569;margin-top:6px;"><strong>Invoice #:</strong> ${invoiceNo}<br><strong>Date:</strong> ${dateStr}</div>
    </div>
  </div>
  <div style="font-size:12px;color:#475569;line-height:1.6;">
    <strong>Billed To Organization:</strong> @${domain} (${email})<br>
    <strong>Expense Policy Compliance:</strong> Under $50.00 USD Monthly SaaS Micro-Purchase Threshold (Ramp / Brex / Expensify Ready)
  </div>
  <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:13px;">
    <thead>
      <tr style="background:#f8fafc;">
        <th style="border-bottom:1px solid #e2e8f0;padding:10px 8px;text-align:left;">Description</th>
        <th style="border-bottom:1px solid #e2e8f0;padding:10px 8px;text-align:left;">Seats</th>
        <th style="border-bottom:1px solid #e2e8f0;padding:10px 8px;text-align:left;">Billing Cycle</th>
        <th style="border-bottom:1px solid #e2e8f0;padding:10px 8px;text-align:left;">Amount (USD)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="border-bottom:1px solid #e2e8f0;padding:10px 8px;"><strong>InboxDeal AI — Team Workspace License</strong><br><span style="font-size:12px;color:#475569;">Automated Gmail Quote Extraction, Ghosted Deal Radar &amp; Google Sheets CRM Sync</span></td>
        <td style="border-bottom:1px solid #e2e8f0;padding:10px 8px;">Up to 5 (@${domain})</td>
        <td style="border-bottom:1px solid #e2e8f0;padding:10px 8px;">Monthly</td>
        <td style="border-bottom:1px solid #e2e8f0;padding:10px 8px;">$29.00</td>
      </tr>
    </tbody>
  </table>
  <div style="font-size:18px;font-weight:800;text-align:right;">Total Amount: $29.00 USD</div>
</body>
</html>`;
}

const TOOLS = [
  {
    name: 'inboxdeal_scan_threads',
    description:
      'Scans B2B email threads to extract quoted deal amounts ($12,500 -> 12500), detect ghosted days, generate 3-sentence high-EQ follow-up drafts, and export Google Sheets CRM TSV/CSV.',
    inputSchema: {
      type: 'object',
      properties: {
        threads: {
          type: 'array',
          description: 'List of email threads ({ from, subject, snippet, ghostedDays })',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string' },
              subject: { type: 'string' },
              snippet: { type: 'string' },
              ghostedDays: { type: 'number' },
            },
          },
        },
      },
      required: ['threads'],
    },
  },
  {
    name: 'inboxdeal_b2b_expense_pack',
    description:
      'Inspects a user work email (@company.com), evaluates CFO daily free scan quota, and generates a <$50 No-Approval $29/mo Team Expense Invoice HTML + 3-sentence Manager Slack Pitch.',
    inputSchema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'User corporate email (e.g. head.sales@hubspot.com)',
        },
      },
      required: ['email'],
    },
  },
];

let serverQuotaState = {
  tier: 'free',
  lastDate: new Date().toISOString().slice(0, 10),
  usedToday: 0,
};

function handleJsonRpc(req) {
  if (!req || typeof req !== 'object') {
    return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } };
  }

  const { id, method, params } = req;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: SERVER_INFO,
        capabilities: { tools: {} },
      },
    };
  }

  if (method === 'notifications/initialized') {
    return null;
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: TOOLS },
    };
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    if (toolName === 'inboxdeal_scan_threads') {
      const check = evaluateDailyScanCircuitBreaker(serverQuotaState);
      if (!check.allowed) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'CFO_DAILY_3_SCANS_CIRCUIT_BREAKER_TRIPPED',
                  message:
                    'Daily 3 Free AI Deal Scans reached! Call inboxdeal_b2b_expense_pack with your @company.com email to unlock the $29/mo (<$50 No-Approval) Team Workspace.',
                }),
              },
            ],
          },
        };
      }
      serverQuotaState = check.nextState;

      const report = analyzeEmailThreads(args.threads || [], {
        enforceFreeCap: serverQuotaState.tier === 'free',
      });

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ...report,
                  quotaRemainingToday: check.remainingToday,
                },
                null,
                2
              ),
            },
          ],
        },
      };
    }

    if (toolName === 'inboxdeal_b2b_expense_pack') {
      const info = inspectCorporateEmail(args.email || '');
      const pitch = generateManagerSlackPitch({ domain: info.domain || 'our team' });
      const invoiceHtml = generateExpenseInvoiceHtml({
        email: args.email || 'user@company.com',
        domain: info.domain || 'company.com',
      });

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  domainInspection: info,
                  managerSlackPitch: pitch,
                  expenseInvoiceHtml: invoiceHtml,
                },
                null,
                2
              ),
            },
          ],
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Unknown tool: ${toolName}` },
    };
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

if (require.main === module) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const req = JSON.parse(trimmed);
      const resp = handleJsonRpc(req);
      if (resp) {
        process.stdout.write(JSON.stringify(resp) + '\n');
      }
    } catch {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        }) + '\n'
      );
    }
  });
}

module.exports = {
  handleJsonRpc,
  extractQuoteAmount,
  classifyDealStatus,
  generateFollowUpDraft,
  analyzeEmailThreads,
  evaluateDailyScanCircuitBreaker,
  inspectCorporateEmail,
  generateManagerSlackPitch,
  generateExpenseInvoiceHtml,
  TOOLS,
  SERVER_INFO,
};
