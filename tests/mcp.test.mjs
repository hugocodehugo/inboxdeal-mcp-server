import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  handleJsonRpc,
   evaluateDailyScanCircuitBreaker,
} = require('../index.js');

test('InboxDeal MCP Server responds to initialize and tools/list over JSON-RPC 2.0', () => {
  const initRes = handleJsonRpc({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  assert.equal(initRes.result.serverInfo.name, 'inboxdeal-ai-mcp');
  assert.equal(initRes.result.serverInfo.version, '1.0.0');

  const listRes = handleJsonRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(listRes.result.tools.length, 2);
  assert.equal(listRes.result.tools[0].name, 'inboxdeal_scan_threads');
  assert.equal(listRes.result.tools[1].name, 'inboxdeal_b2b_expense_pack');
});

test('inboxdeal_scan_threads extracts quote amounts, flags ghosted deals, builds 3-line follow-up & exports TSV/CSV', () => {
  const callRes = handleJsonRpc({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'inboxdeal_scan_threads',
      arguments: {
        threads: [
          {
            from: 'vp.procurement@acme.io',
            subject: 'Annual Enterprise Seat Quote — $14,500',
            snippet: 'Attached is the $14,500 annual agreement for 25 seats.',
            ghostedDays: 6,
          },
          {
            from: 'founder@linear.app',
            subject: 'Q4 Pilot Proposal ($4,800)',
            snippet: 'Looking forward to kicking off the $4,800 pilot.',
            ghostedDays: 1,
          },
        ],
      },
    },
  });

  const payload = JSON.parse(callRes.result.content[0].text);
  assert.equal(payload.dealCount, 2);
  assert.equal(payload.totalPipelineValue, 19300);
  assert.equal(payload.ghostedCount, 1);
  assert.equal(payload.deals[0].status, '🔴 GHOSTED_RISK');
  assert.ok(payload.deals[0].followUpDraft.includes('$14,500'));
  assert.ok(payload.tsv.includes('acme.io\tvp.procurement@acme.io'));
});

test('CFO Daily 3 Free Scans Circuit Breaker trips on 4th run and resets next day', () => {
  let state = { tier: 'free', lastDate: '2026-11-13', usedToday: 0 };
  for (let i = 1; i <= 3; i++) {
    const res = evaluateDailyScanCircuitBreaker(state, '2026-11-13');
    assert.equal(res.allowed, true);
    assert.equal(res.remainingToday, 3 - i);
    state = res.nextState;
  }
  const blocked = evaluateDailyScanCircuitBreaker(state, '2026-11-13');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'CFO_DAILY_3_SCANS_CIRCUIT_BREAKER_TRIPPED');

  const nextDay = evaluateDailyScanCircuitBreaker(state, '2026-11-14');
  assert.equal(nextDay.allowed, true);
  assert.equal(nextDay.remainingToday, 2);
});

test('inboxdeal_b2b_expense_pack detects @company.com and generates <$50 ($29/mo) invoice + Slack pitch', () => {
  const callRes = handleJsonRpc({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'inboxdeal_b2b_expense_pack',
      arguments: { email: 'ae.lead@hubspot.com' },
    },
  });
  const data = JSON.parse(callRes.result.content[0].text);
  assert.equal(data.domainInspection.isCorporate, true);
  assert.equal(data.domainInspection.domain, 'hubspot.com');
  assert.ok(data.managerSlackPitch.includes('$29/mo'));
  assert.ok(data.expenseInvoiceHtml.includes('$29.00'));
  assert.ok(data.expenseInvoiceHtml.includes('InboxDeal AI Inc.'));
});
