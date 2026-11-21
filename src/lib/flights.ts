export interface FlightOption {
  origin: string | null;
  price: number;
  airlines: string[];
  flightNumbers: string[];
  stops: number;
  layovers: string[];
  durationMin: number;
  departTime: string | null;
  arriveTime: string | null;
}

export interface Combo {
  depart: string;
  return: string;
  nights: number;
  fetchedAt: string;
  googleFlightsUrl: string | null;
  options: FlightOption[];
}

export interface FlightsData {
  updatedAt: string | null;
  combos: Record<string, Combo>;
}

export interface HistoryPoint {
  date: string;
  cheapest: number;
  comboKey: string;
}

/** One bookable row on the page: a flight option plus its trip dates. */
export interface Row extends FlightOption {
  depart: string;
  return: string;
  nights: number;
  fetchedAt: string;
  url: string;
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const formatMoney = (n: number) => money.format(n);

/** "2027-03-12" -> "Fri, Mar 12" */
export function formatDay(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "2027-03-12 06:05" (airport local time) -> "6:05 AM" */
export function formatTime(stamp: string | null) {
  if (!stamp) return '';
  const [h, m] = stamp.slice(11, 16).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function formatDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function timeAgo(iso: string, now = Date.now()) {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function googleFlightsSearchUrl(from: string[], to: string, depart: string, ret: string, adults: number) {
  const q = `Flights from ${from.join(' or ')} to ${to} on ${depart} through ${ret} for ${adults} adults`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=USD&hl=en`;
}
