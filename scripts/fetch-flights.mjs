// Refreshes flight prices from SerpApi (Google Flights) into src/data/flights.json and src/data/history.json.
// Run: SERPAPI_KEY=... node scripts/fetch-flights.mjs
// Optional env: FETCH_LIMIT, RETURN_LIMIT (lower per-run caps), FETCH_ALL=1 (refresh every combo).
import { readFile, writeFile } from 'node:fs/promises';
// Node 22.18+ runs TypeScript directly, so the site's own ranking is reused here.
import { bestScore, tripMinutes } from '../src/lib/picks.ts';
import { searchAllowance, selectRefreshQueue } from './refresh-policy.mjs';

const dataDir = new URL('../src/data/', import.meta.url);
const trip = JSON.parse(await readFile(new URL('trip.json', dataDir), 'utf8'));
const flightsFile = new URL('flights.json', dataDir);
const historyFile = new URL('history.json', dataDir);

const key = process.env.SERPAPI_KEY;
if (!key) {
  console.error('SERPAPI_KEY is not set. Cannot refresh prices.');
  process.exit(1);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

const addDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Trip dates are compared against the date in Iowa, not UTC.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());

const allCombos = [];
for (let depart = trip.firstDepart; depart <= trip.lastDepart; depart = addDays(depart, 1)) {
  for (const nights of trip.nights) {
    allCombos.push({ key: `${depart}_${nights}`, depart, return: addDays(depart, nights), nights });
  }
}
const upcoming = allCombos.filter((c) => c.depart >= today);

const flights = await readJson(flightsFile, { updatedAt: null, combos: {} });
const history = await readJson(historyFile, []);

if (upcoming.length === 0) {
  console.log('Every departure date has passed. Nothing to refresh.');
  flights.combos = {};
  await writeFile(flightsFile, JSON.stringify(flights, null, 2) + '\n');
  process.exit(0);
}

function lowerLimit(name, maximum) {
  const value = process.env[name] === undefined ? maximum : Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${name} must be an integer between 0 and ${maximum}.`);
  }
  return value;
}

const outboundLimit = lowerLimit('FETCH_LIMIT', trip.refreshPerRun);
const returnLimit = lowerLimit('RETURN_LIMIT', trip.returnsPerRun);
const accountUrl = new URL('https://serpapi.com/account.json');
accountUrl.searchParams.set('api_key', key);
const accountResponse = await fetch(accountUrl);
if (!accountResponse.ok) throw new Error(`SerpApi account check failed (HTTP ${accountResponse.status}).`);
const account = await accountResponse.json();
const allowance = searchAllowance(account.total_searches_left);
const fullRefresh = process.env.FETCH_ALL === '1';
if (fullRefresh && allowance < upcoming.length + returnLimit) {
  throw new Error(`Full refresh needs ${upcoming.length + returnLimit} searches plus the 10-credit reserve; ${account.total_searches_left} remain.`);
}
if (!allowance) throw new Error('No SerpApi searches are available after the 10-credit reserve.');

for (const k of Object.keys(flights.combos)) {
  if (!upcoming.some((c) => c.key === k)) delete flights.combos[k];
  else flights.combos[k].options = flights.combos[k].options.filter((o) => o.origin === trip.from);
}

const optionId = (o) => `${o.origin}|${o.flightNumbers.join('-')}`;
const allRows = () =>
  Object.entries(flights.combos)
    .flatMap(([comboKey, c]) => c.options.map((o) => ({ comboKey, combo: c, o })))
    .sort((a, b) => a.o.price - b.o.price);
// Return flights are looked up for the trips Becky is most likely to book: the cheapest few, plus the
// "Best pick" and "Shortest" trips shown at the top of the page.
const topRows = () => {
  const rows = allRows();
  const byBest = [...rows].sort((a, b) => bestScore(a.o) - bestScore(b.o));
  const byShortest = [...rows].sort((a, b) => tripMinutes(a.o) - tripMinutes(b.o) || a.o.price - b.o.price);
  return [...new Set([...byBest.slice(0, 2), ...byShortest.slice(0, 1), ...rows.slice(0, trip.returnTop)])];
};
// The trips on the top card (Cheapest, Shortest, Best pick).
const topCardRows = () => {
  const rows = allRows();
  if (!rows.length) return [];
  const best = [...rows].sort((a, b) => bestScore(a.o) - bestScore(b.o))[0];
  const shortest = [...rows].sort((a, b) => tripMinutes(a.o) - tripMinutes(b.o) || a.o.price - b.o.price)[0];
  return [rows[0], shortest, best];
};
const chicagoDay = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(iso));

const topCard = topCardRows()
  .filter((r) => chicagoDay(r.combo.fetchedAt) !== today)
  .map((r) => r.comboKey);
const queue = fullRefresh
  ? upcoming
  : selectRefreshQueue(upcoming, flights.combos, topCard, Math.min(outboundLimit, allowance));

function normalize(item) {
  const legs = item.flights ?? [];
  if (!legs.length || typeof item.price !== 'number') return null;
  return {
    origin: legs[0].departure_airport?.id ?? null,
    destination: legs.at(-1).arrival_airport?.id ?? null,
    price: item.price,
    airlines: [...new Set(legs.map((l) => l.airline).filter(Boolean))],
    flightNumbers: legs.map((l) => l.flight_number).filter(Boolean),
    stops: legs.length - 1,
    layovers: (item.layovers ?? []).map((l) => l.id).filter(Boolean),
    durationMin: item.total_duration ?? legs.reduce((sum, l) => sum + (l.duration ?? 0), 0),
    departTime: legs[0].departure_airport?.time ?? null,
    arriveTime: legs.at(-1).arrival_airport?.time ?? null,
    departureToken: item.departure_token ?? null,
  };
}

async function search(combo, extra = {}) {
  const params = new URLSearchParams({
    engine: 'google_flights',
    departure_id: trip.from,
    arrival_id: trip.to,
    outbound_date: combo.depart,
    return_date: combo.return,
    type: '1',
    adults: String(trip.adults),
    currency: trip.currency,
    hl: 'en',
    gl: 'us',
    ...extra,
    api_key: key,
  });
  const res = await fetch(`https://serpapi.com/search.json?${params}`);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.fatal = res.status === 401 || res.status === 403 || res.status === 429;
    throw err;
  }
  const body = await res.json();
  if (body.error && /hasn't returned any results/i.test(body.error)) {
    return { options: [], url: body.search_metadata?.google_flights_url };
  }
  if (body.error) {
    const err = new Error(body.error);
    err.fatal = /run out of searches|invalid api key/i.test(err.message);
    throw err;
  }
  const seen = new Set();
  const options = [...(body.best_flights ?? []), ...(body.other_flights ?? [])]
    .map(normalize)
    .filter((o) => {
      if (!o) return false;
      const id = `${optionId(o)}|${o.price}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => a.price - b.price);
  return { options, url: body.search_metadata?.google_flights_url };
}

let searches = 0;
let stopped = false;
let failed = false;
async function guarded(label, fn) {
  if (stopped || searches >= allowance) return false;
  try {
    searches++;
    await fn();
    return true;
  } catch (err) {
    failed = true;
    console.warn(`  ${label}: failed (${err.message})`);
    if (err.fatal) {
      console.warn('Stopping early because the API key or search quota is unusable.');
      stopped = true;
    }
    return false;
  }
}

console.log(`Refreshing ${queue.length} of ${upcoming.length} date combinations...`);
let refreshed = 0;
for (const combo of queue) {
  // On failure the combo keeps its previous data so prices don't disappear.
  const ok = await guarded(combo.key, async () => {
    const { options, url } = await search(combo);
    const previous = new Map((flights.combos[combo.key]?.options ?? []).map((o) => [optionId(o), o]));
    const kept = options.filter((o) => o.origin === trip.from).slice(0, trip.optionsPerCombo).map((o) => {
      // Keep a return flight found earlier for the same outbound flight.
      const old = previous.get(optionId(o));
      return old?.returnFlight ? { ...o, returnFlight: old.returnFlight, returnUrl: old.returnUrl } : o;
    });
    flights.combos[combo.key] = {
      depart: combo.depart,
      return: combo.return,
      nights: combo.nights,
      fetchedAt: new Date().toISOString(),
      googleFlightsUrl: url ?? null,
      options: kept,
    };
    console.log(`  ${combo.key}: ${kept.length} options${kept[0] ? `, from $${kept[0].price}` : ''}`);
  });
  if (ok) refreshed++;
}

const needReturn = topRows()
  .filter((r) => r.o.departureToken && !r.o.returnFlight)
  .slice(0, Math.min(returnLimit, allowance - searches));
if (needReturn.length) console.log(`Looking up return flights for ${needReturn.length} of the top trips...`);
for (const { comboKey, combo, o } of needReturn) {
  await guarded(`${comboKey} return`, async () => {
    const { options, url } = await search(combo, { departure_token: o.departureToken });
    // Prefer a return to the airport she left from, since that's where the car is.
    const best = options.find((r) => r.destination === o.origin) ?? options[0];
    if (!best) {
      console.log(`  ${comboKey}: no return flights found`);
      return;
    }
    const { departureToken: _unused, ...returnFlight } = best;
    o.returnFlight = returnFlight;
    o.returnUrl = url ?? null;
    // The round-trip total depends on the chosen return flight.
    o.price = best.price;
    console.log(`  ${comboKey} ${o.flightNumbers.join('>')}: back ${best.flightNumbers.join('>')} to ${best.destination}, total $${best.price}`);
  });
}
for (const c of Object.values(flights.combos)) c.options.sort((a, b) => a.price - b.price);

if (refreshed > 0) flights.updatedAt = new Date().toISOString();

const cheapest = allRows()[0];
if (cheapest) {
  const point = { date: today, cheapest: cheapest.o.price, comboKey: cheapest.comboKey };
  const i = history.findIndex((h) => h.date === today);
  if (i >= 0) history[i] = point;
  else history.push(point);
}

await writeFile(flightsFile, JSON.stringify(flights, null, 2) + '\n');
await writeFile(historyFile, JSON.stringify(history, null, 2) + '\n');
console.log(`Done. Refreshed ${refreshed} of ${queue.length} date combinations using ${searches} searches.`);
if (failed || (refreshed === 0 && queue.length > 0)) process.exitCode = 1;