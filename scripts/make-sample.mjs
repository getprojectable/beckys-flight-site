// Writes made-up sample data used only by `npm run dev` before real prices have been fetched.
import { readFile, writeFile } from 'node:fs/promises';

const dataDir = new URL('../src/data/', import.meta.url);
const trip = JSON.parse(await readFile(new URL('trip.json', dataDir), 'utf8'));

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const addDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const pad = (n) => String(n).padStart(2, '0');

const routes = [
  { airlines: ['American'], via: ['DFW'], code: 'AA' },
  { airlines: ['American'], via: ['PHX'], code: 'AA' },
  { airlines: ['United'], via: ['DEN'], code: 'UA' },
  { airlines: ['United'], via: ['ORD'], code: 'UA' },
  { airlines: ['Delta'], via: ['MSP'], code: 'DL' },
  { airlines: ['Delta'], via: ['SLC'], code: 'DL' },
  { airlines: ['Allegiant'], via: [], code: 'G4' },
  { airlines: ['United', 'Alaska'], via: ['DEN', 'SEA'], code: 'UA' },
];

const combos = {};
const now = Date.now();
let i = 0;
for (let depart = trip.firstDepart; depart <= trip.lastDepart; depart = addDays(depart, 1)) {
  for (const nights of trip.nights) {
    const options = Array.from({ length: 6 + Math.floor(rand() * 4) }, () => {
      const r = pick(routes);
      const origin = pick(['CID', 'CID', 'MLI', 'DSM']);
      const hour = 5 + Math.floor(rand() * 15);
      const durationMin = r.via.length === 0 ? 235 : 300 + r.via.length * 90 + Math.floor(rand() * 180);
      const arrive = new Date(`${depart}T${pad(hour)}:${pad(Math.floor(rand() * 4) * 15)}:00Z`);
      const departTime = arrive.toISOString().slice(0, 16).replace('T', ' ');
      // CID is UTC-5 and PSP is UTC-7 in March, so local arrival is duration minus 2 hours.
      arrive.setUTCMinutes(arrive.getUTCMinutes() + durationMin - 120);
      return {
        origin,
        price: Math.round((900 + rand() * 900 - (r.via.length === 0 ? 150 : 0)) / 3) * 3,
        airlines: r.airlines,
        flightNumbers: [r.via, '-'].flat().map(() => `${r.code} ${100 + Math.floor(rand() * 2800)}`),
        stops: r.via.length,
        layovers: r.via,
        durationMin,
        departTime,
        arriveTime: arrive.toISOString().slice(0, 16).replace('T', ' '),
      };
    }).sort((a, b) => a.price - b.price);
    combos[`${depart}_${nights}`] = {
      depart,
      return: addDays(depart, nights),
      nights,
      fetchedAt: new Date(now - (i++ % 5) * 86400000 - 3600000).toISOString(),
      googleFlightsUrl: null,
      options,
    };
  }
}

const history = Array.from({ length: 21 }, (_, d) => ({
  date: new Date(now - (20 - d) * 86400000).toISOString().slice(0, 10),
  cheapest: Math.round(780 + Math.sin(d / 3) * 60 + rand() * 40 - d * 2),
  comboKey: `${trip.firstDepart}_5`,
}));

await writeFile(new URL('sample-flights.json', dataDir), JSON.stringify({ updatedAt: new Date(now).toISOString(), combos }, null, 2) + '\n');
await writeFile(new URL('sample-history.json', dataDir), JSON.stringify(history, null, 2) + '\n');
console.log('Sample data written.');
