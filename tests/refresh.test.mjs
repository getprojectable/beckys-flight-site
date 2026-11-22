import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { searchAllowance, selectRefreshQueue } from '../scripts/refresh-policy.mjs';

test('rotation reserves old dates, deduplicates top picks, and handles never-fetched dates', () => {
  const upcoming = ['a', 'b', 'c', 'd', 'e', 'f'].map((key) => ({ key }));
  const combos = {
    a: { fetchedAt: '2026-01-01' },
    b: { fetchedAt: '2026-01-02' },
    c: { fetchedAt: '2026-01-03' },
    d: { fetchedAt: '2026-01-04' },
    e: { fetchedAt: '2026-01-05' },
  };
  assert.deepEqual(selectRefreshQueue(upcoming, combos, ['e', 'e', 'd'], 4).map((c) => c.key), ['d', 'e', 'f', 'a']);
  assert.deepEqual(selectRefreshQueue(upcoming, {}, [], 4).map((c) => c.key), ['a', 'b', 'c', 'd']);
  assert.deepEqual(selectRefreshQueue(upcoming, combos, ['e'], 0), []);
});

test('quota requires a valid account balance and preserves the reserve', () => {
  assert.equal(searchAllowance(12), 2);
  assert.equal(searchAllowance(8), 0);
  assert.throws(() => searchAllowance(undefined), /total_searches_left/);
  assert.throws(() => searchAllowance(-1), /total_searches_left/);
});

const mockFetch = `
import { appendFileSync } from 'node:fs';
globalThis.fetch = async (input) => {
  const url = new URL(input);
  if (url.pathname === '/account.json') {
    if (process.env.MOCK_ACCOUNT_ERROR) return { ok: false, status: 401 };
    return { ok: true, json: async () => ({ total_searches_left: Number(process.env.MOCK_BALANCE) }) };
  }
  const isReturn = url.searchParams.has('departure_token');
  appendFileSync(process.env.MOCK_LOG, (isReturn ? 'return' : 'outbound') + ':' + url.searchParams.get('departure_id') + '\\n');
  if (process.env.MOCK_RATE_LIMIT) return { ok: false, status: 429 };
  const origin = isReturn ? 'PSP' : 'CID';
  const destination = isReturn ? 'CID' : 'PSP';
  const leg = { departure_airport: { id: origin, time: '2099-03-01 10:00' }, arrival_airport: { id: destination, time: '2099-03-01 12:00' }, airline: 'Test', flight_number: 'T 123', duration: 120 };
  const item = { flights: [leg], total_duration: 120, price: 500, departure_token: 'token' };
  const other = { ...item, flights: [{ ...leg, departure_airport: { id: 'DSM' } }], price: 400 };
  return { ok: true, json: async () => ({ best_flights: isReturn ? [item] : [other, item] }) };
};
`;

async function fixture(t, { populated = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'becky-refresh-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts'), { recursive: true });
  await mkdir(join(root, 'src', 'data'), { recursive: true });
  await mkdir(join(root, 'src', 'lib'), { recursive: true });
  for (const file of ['scripts/fetch-flights.mjs', 'scripts/refresh-policy.mjs', 'src/lib/picks.ts', 'src/lib/flights.ts']) {
    await copyFile(new URL(`../${file}`, import.meta.url), join(root, ...file.split('/')));
  }
  const trip = {
    from: 'CID', to: 'PSP', firstDepart: '2099-03-01', lastDepart: '2099-03-07',
    nights: [4], adults: 3, currency: 'USD', refreshPerRun: 4, returnsPerRun: 2,
    returnTop: 6, optionsPerCombo: 15,
  };
  const combos = {};
  if (populated) {
    for (let day = 1; day <= 7; day++) {
      const depart = `2099-03-0${day}`;
      const option = { origin: 'DSM', price: 100, airlines: ['Test'], flightNumbers: ['T 1'], stops: 0, layovers: [], durationMin: 120, departTime: `${depart} 10:00`, arriveTime: `${depart} 12:00` };
      combos[`${depart}_4`] = { depart, return: '2099-03-10', nights: 4, fetchedAt: '2026-01-01T00:00:00Z', options: [option] };
    }
  }
  await writeFile(join(root, 'src', 'data', 'trip.json'), JSON.stringify(trip));
  await writeFile(join(root, 'src', 'data', 'flights.json'), JSON.stringify({ updatedAt: null, combos }));
  await writeFile(join(root, 'src', 'data', 'history.json'), '[]');
  await writeFile(join(root, 'mock.mjs'), mockFetch);
  const log = join(root, 'calls.log');
  await writeFile(log, '');
  return {
    async run(env = {}) {
      const result = spawnSync(process.execPath, ['--import', pathToFileURL(join(root, 'mock.mjs')).href, join(root, 'scripts', 'fetch-flights.mjs')], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, SERPAPI_KEY: 'test-key', MOCK_BALANCE: '250', MOCK_LOG: log, FETCH_ALL: '', FETCH_LIMIT: '', RETURN_LIMIT: '', ...env },
      });
      return {
        ...result,
        calls: (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean),
        flights: JSON.parse(await readFile(join(root, 'src', 'data', 'flights.json'), 'utf8')),
      };
    },
  };
}

test('first run respects daily limits and stores only CID outbound flights', async (t) => {
  const f = await fixture(t);
  const result = await f.run({ FETCH_LIMIT: '4', RETURN_LIMIT: '2' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.filter((call) => call === 'outbound:CID').length, 4);
  assert.equal(result.calls.filter((call) => call === 'return:CID').length, 2);
  assert.equal(Object.keys(result.flights.combos).length, 4);
  assert.ok(Object.values(result.flights.combos).flatMap((c) => c.options).every((o) => o.origin === 'CID'));
});

test('limited quota caps all requests and prunes old non-CID options', async (t) => {
  const f = await fixture(t, { populated: true });
  const result = await f.run({ FETCH_LIMIT: '4', RETURN_LIMIT: '2', MOCK_BALANCE: '12' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 2);
  assert.ok(Object.values(result.flights.combos).flatMap((c) => c.options).every((o) => o.origin === 'CID'));
});

test('full refresh requires sufficient balance before any data is changed', async (t) => {
  const f = await fixture(t, { populated: true });
  const result = await f.run({ FETCH_ALL: '1', FETCH_LIMIT: '4', RETURN_LIMIT: '2', MOCK_BALANCE: '18' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Full refresh needs 9 searches/);
  assert.equal(result.calls.length, 0);
  assert.equal(Object.values(result.flights.combos)[0].options[0].origin, 'DSM');
});

test('eligible full refresh searches every date and at most two returns', async (t) => {
  const f = await fixture(t);
  const result = await f.run({ FETCH_ALL: '1', FETCH_LIMIT: '4', RETURN_LIMIT: '2', MOCK_BALANCE: '19' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.filter((call) => call === 'outbound:CID').length, 7);
  assert.equal(result.calls.filter((call) => call === 'return:CID').length, 2);
});

test('account errors stop before any searches or data changes', async (t) => {
  const f = await fixture(t, { populated: true });
  const result = await f.run({ FETCH_LIMIT: '4', RETURN_LIMIT: '2', MOCK_ACCOUNT_ERROR: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /account check failed/);
  assert.equal(result.calls.length, 0);
  assert.equal(Object.values(result.flights.combos)[0].options[0].origin, 'DSM');
});

test('a rate limit stops further outbound and return searches and reports failure', async (t) => {
  const f = await fixture(t);
  const result = await f.run({ FETCH_LIMIT: '4', RETURN_LIMIT: '2', MOCK_RATE_LIMIT: '1' });
  assert.notEqual(result.status, 0);
  assert.equal(result.calls.length, 1);
  assert.match(result.stderr, /HTTP 429/);
});
