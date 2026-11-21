// Refreshes flight prices from SerpApi (Google Flights) into src/data/flights.json and src/data/history.json.
// Run: SERPAPI_KEY=... node scripts/fetch-flights.mjs
// Optional env: FETCH_LIMIT (combos to refresh this run), FETCH_ALL=1 (refresh every combo).
import { readFile, writeFile } from 'node:fs/promises';

const dataDir = new URL('../src/data/', import.meta.url);
const trip = JSON.parse(await readFile(new URL('trip.json', dataDir), 'utf8'));
const flightsFile = new URL('flights.json', dataDir);
const historyFile = new URL('history.json', dataDir);

const key = process.env.SERPAPI_KEY;
if (!key) {
  console.log('SERPAPI_KEY is not set. Skipping the price refresh.');
  process.exit(0);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
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

for (const k of Object.keys(flights.combos)) {
  if (!upcoming.some((c) => c.key === k)) delete flights.combos[k];
}

if (upcoming.length === 0) {
  console.log('Every departure date has passed. Nothing to refresh.');
  await writeFile(flightsFile, JSON.stringify(flights, null, 2) + '\n');
  process.exit(0);
}

const neverFetched = upcoming.filter((c) => !flights.combos[c.key]);
let queue;
if (process.env.FETCH_ALL === '1') {
  queue = upcoming;
} else if (neverFetched.length > 0) {
  queue = neverFetched;
} else {
  const limit = Number(process.env.FETCH_LIMIT) || trip.refreshPerRun;
  queue = [...upcoming]
    .sort((a, b) => flights.combos[a.key].fetchedAt.localeCompare(flights.combos[b.key].fetchedAt))
    .slice(0, limit);
}

function normalize(item) {
  const legs = item.flights ?? [];
  if (!legs.length || typeof item.price !== 'number') return null;
  return {
    origin: legs[0].departure_airport?.id ?? null,
    price: item.price,
    airlines: [...new Set(legs.map((l) => l.airline).filter(Boolean))],
    flightNumbers: legs.map((l) => l.flight_number).filter(Boolean),
    stops: legs.length - 1,
    layovers: (item.layovers ?? []).map((l) => l.id).filter(Boolean),
    durationMin: item.total_duration ?? legs.reduce((sum, l) => sum + (l.duration ?? 0), 0),
    departTime: legs[0].departure_airport?.time ?? null,
    arriveTime: legs.at(-1).arrival_airport?.time ?? null,
  };
}

async function search(combo) {
  const params = new URLSearchParams({
    engine: 'google_flights',
    // One search covers every nearby airport, so extra airports cost no extra searches.
    departure_id: trip.origins.map((o) => o.code).join(','),
    arrival_id: trip.to,
    outbound_date: combo.depart,
    return_date: combo.return,
    type: '1',
    adults: String(trip.adults),
    currency: trip.currency,
    hl: 'en',
    gl: 'us',
    api_key: key,
  });
  const res = await fetch(`https://serpapi.com/search.json?${params}`);
  const body = await res.json().catch(() => ({}));
  if (body.error && /hasn't returned any results/i.test(body.error)) {
    return { options: [], url: body.search_metadata?.google_flights_url };
  }
  if (!res.ok || body.error) {
    const err = new Error(body.error ?? `HTTP ${res.status}`);
    err.fatal = res.status === 401 || res.status === 429 || /run out of searches|invalid api key/i.test(err.message);
    throw err;
  }
  const seen = new Set();
  const options = [...(body.best_flights ?? []), ...(body.other_flights ?? [])]
    .map(normalize)
    .filter((o) => {
      if (!o) return false;
      const id = `${o.origin}|${o.flightNumbers.join('-')}|${o.price}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => a.price - b.price)
    .slice(0, trip.optionsPerCombo);
  return { options, url: body.search_metadata?.google_flights_url };
}

console.log(`Refreshing ${queue.length} of ${upcoming.length} date combinations...`);
let refreshed = 0;
for (const combo of queue) {
  try {
    const { options, url } = await search(combo);
    flights.combos[combo.key] = {
      depart: combo.depart,
      return: combo.return,
      nights: combo.nights,
      fetchedAt: new Date().toISOString(),
      googleFlightsUrl: url ?? null,
      options,
    };
    refreshed++;
    console.log(`  ${combo.key}: ${options.length} options${options[0] ? `, from $${options[0].price}` : ''}`);
  } catch (err) {
    // Keep the combo's previous data so prices don't disappear.
    console.warn(`  ${combo.key}: failed (${err.message})`);
    if (err.fatal) {
      console.warn('Stopping early because the API key or search quota is unusable.');
      break;
    }
  }
}

if (refreshed > 0) flights.updatedAt = new Date().toISOString();

let cheapest = null;
for (const [comboKey, combo] of Object.entries(flights.combos)) {
  for (const o of combo.options) {
    if (!cheapest || o.price < cheapest.cheapest) cheapest = { date: today, cheapest: o.price, comboKey };
  }
}
if (cheapest) {
  const i = history.findIndex((h) => h.date === today);
  if (i >= 0) history[i] = cheapest;
  else history.push(cheapest);
}

await writeFile(flightsFile, JSON.stringify(flights, null, 2) + '\n');
await writeFile(historyFile, JSON.stringify(history, null, 2) + '\n');
console.log(`Done. Refreshed ${refreshed} of ${queue.length}.`);
if (refreshed === 0 && queue.length > 0) process.exitCode = 1;
