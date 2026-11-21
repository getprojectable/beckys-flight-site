import type { Row } from './flights';

export interface Origin {
  code: string;
  name: string;
  drive: string | null;
  driveHours?: number;
}

export interface Pick {
  id: 'cheapest' | 'shortest' | 'best';
  label: string;
  emoji: string;
  blurb: string;
  row: Row;
  reasons: string[];
}

const hour = (stamp: string | null) => (stamp ? Number(stamp.slice(11, 13)) : 12);

const driveMinutes = (code: string | null | undefined, origins: Origin[]) =>
  (origins.find((o) => o.code === code)?.driveHours ?? 0) * 60;

/**
 * Door-to-door travel time from Cedar Rapids, both ways: flights plus the drive to and from a farther airport.
 * The return is estimated from the outbound flight when it hasn't been checked yet.
 */
export function tripMinutes(r: Row, origins: Origin[]) {
  const back = r.returnFlight;
  const out = r.durationMin + driveMinutes(r.origin, origins);
  const ret = back ? back.durationMin + driveMinutes(back.destination ?? r.origin, origins) : out;
  return out + ret;
}

/** Door-to-door time for the trip there: the drive to the airport plus the flight. */
export const outboundMinutes = (r: Row, origins: Origin[]) => r.durationMin + driveMinutes(r.origin, origins);

/**
 * "Best pick" score in dollars: the price plus a cost for things that make the trip harder.
 * Lower is better.
 */
export function bestScore(r: Row, origins: Origin[]) {
  const back = r.returnFlight;
  let score = r.price;
  score += (tripMinutes(r, origins) / 60) * 25;
  score += (r.stops + (back?.stops ?? r.stops)) * 60;
  // Very early departures or late-night arrivals are hard with teens.
  for (const leg of back ? [r, back] : [r]) {
    if (hour(leg.departTime) < 6) score += 75;
    if (hour(leg.arriveTime) >= 23 || leg.arriveTime?.slice(0, 10) !== leg.departTime?.slice(0, 10)) score += 100;
  }
  // Gas and parking for a farther airport, on top of the drive time already counted above.
  score += ((driveMinutes(r.origin, origins) * 2) / 60) * 15;
  if (!back) score += 60;
  else if (back.destination && back.destination !== r.origin) score += 150;
  return score;
}

function bestReasons(r: Row, cheapest: Row, origins: Origin[]) {
  const reasons: string[] = [];
  const back = r.returnFlight;
  const extra = r.price - cheapest.price;
  reasons.push(extra <= 0 ? 'Lowest price' : `Only $${extra} more than the cheapest`);
  const totalStops = r.stops + (back?.stops ?? 0);
  if (r.stops === 0 && back?.stops === 0) reasons.push('Nonstop both ways');
  else if (back && totalStops <= 2) reasons.push(`${totalStops} stop${totalStops === 1 ? '' : 's'} total`);
  if (hour(r.departTime) >= 7 && (!back || hour(back.departTime) >= 7)) reasons.push('No early-morning flights');
  const origin = origins.find((o) => o.code === r.origin);
  if (origin && !origin.drive) reasons.push(`Leaves from ${origin.name}`);
  return reasons.slice(0, 3);
}

const hm = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
};

function shortestReasons(r: Row, origins: Origin[]) {
  const drive = driveMinutes(r.origin, origins) > 0;
  const reasons = [`${hm(outboundMinutes(r, origins))} door to door there`];
  if (r.returnFlight) {
    const back = r.returnFlight.durationMin + driveMinutes(r.returnFlight.destination ?? r.origin, origins);
    reasons.push(`${hm(back)} back`);
  }
  if (drive) reasons.push('Includes the drive from Cedar Rapids');
  return reasons;
}

export function makePicks(rows: Row[], origins: Origin[]): Pick[] {
  if (!rows.length) return [];
  const trip = (r: Row) => tripMinutes(r, origins);
  const cheapest = [...rows].sort((a, b) => a.price - b.price || trip(a) - trip(b))[0];
  const shortest = [...rows].sort((a, b) => trip(a) - trip(b) || a.price - b.price)[0];
  const best = [...rows].sort((a, b) => bestScore(a, origins) - bestScore(b, origins))[0];
  return [
    { id: 'cheapest', label: 'Cheapest', emoji: '💰', blurb: 'Lowest round-trip price', row: cheapest, reasons: [] },
    {
      id: 'shortest',
      label: 'Shortest',
      emoji: '⚡',
      blurb: 'Least travel time from Cedar Rapids',
      row: shortest,
      reasons: shortestReasons(shortest, origins),
    },
    {
      id: 'best',
      label: 'Best pick',
      emoji: '⭐',
      blurb: 'Best mix of price and comfort',
      row: best,
      reasons: bestReasons(best, cheapest, origins),
    },
  ];
}
