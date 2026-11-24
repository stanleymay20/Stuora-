import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/backend/externalFeedReply.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { decodeExternalFeed, externalFeedOutcome, safeExternalFeedUrl } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const tm = { id: 'ticketmaster', label: 'Ticketmaster', url: 'https://www.ticketmaster.de', status: 'ok' };
const event = {
  id: 'ticketmaster:test', source: 'ticketmaster', title: 'Test event', subtitle: 'Test venue',
  location: 'Berlin', startsAt: '2026-12-01', postedAt: null, url: 'https://www.ticketmaster.de/event/test',
};
const adzuna = { id: 'adzuna', label: 'Adzuna', url: 'https://www.adzuna.de', status: 'ok' };
const ba = { id: 'bundesagentur', label: 'Bundesagentur', url: 'https://www.arbeitsagentur.de/jobsuche/', status: 'error' };

test('successful zero results, provider outages and partial replies are different outcomes', () => {
  assert.equal(externalFeedOutcome(decodeExternalFeed({ sources: [tm], items: [] }, 'events')), 'empty');
  assert.equal(externalFeedOutcome(decodeExternalFeed({ sources: [{ ...tm, status: 'error' }], items: [] }, 'events')), 'unavailable');
  assert.equal(externalFeedOutcome(decodeExternalFeed({ sources: [adzuna, ba], items: [] }, 'jobs')), 'partial');
  assert.equal(externalFeedOutcome(decodeExternalFeed({ sources: [tm], items: [event] }, 'events')), 'results');
});

test('only HTTPS provider destinations can open', () => {
  for (const url of ['javascript:alert(1)', 'intent://ticketmaster.de', 'http://www.ticketmaster.de/',
    'https://www.ticketmaster.de.example.com/', 'https://user@example.com/', 'https://user@ticketmaster.de/',
    'https://ticketmaster.de:4433/']) {
    assert.equal(safeExternalFeedUrl('ticketmaster', url), null, url);
  }
  assert.equal(safeExternalFeedUrl('ticketmaster', event.url), event.url);
  assert.equal(safeExternalFeedUrl('toString', event.url), null);
  assert.equal(safeExternalFeedUrl('bundesagentur', 'https://www.arbeitsagentur.de/jobsuche/jobdetail/test'), 'https://www.arbeitsagentur.de/jobsuche/jobdetail/test');
});

test('wrong-domain rows, malformed sources and results from failed sources are not valid empty feeds', () => {
  for (const value of [
    null, {}, { items: [], sources: [] },
    { items: [event], sources: [{ ...tm, status: 'error' }] },
    { items: [{ ...event, url: 'https://example.com' }], sources: [tm] },
    { items: [], sources: [{ ...tm, url: 'https://example.com' }] },
    { items: [{ ...event, startsAt: 'not a date' }], sources: [tm] },
    { items: [event, event], sources: [tm] },
    { items: [event], sources: [adzuna] },
  ]) assert.equal(decodeExternalFeed(value, 'events'), null);
  assert.equal(decodeExternalFeed({ items: [event], sources: [tm] }, 'jobs'), null);
});
