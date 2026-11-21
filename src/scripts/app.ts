import { formatDay, formatDuration, formatMoney, formatTime, timeAgo, type Row } from '../lib/flights';

const PAGE_SIZE = 20;
type ListKey = 'nights' | 'time' | 'origin';
const STORAGE_KEY = 'becky-flight-filters';

interface Filters {
  sort: 'price' | 'duration' | 'date';
  day: string;
  airline: string;
  nonstop: boolean;
  nights: string[];
  time: string[];
  origin: string[];
}

interface Origin {
  code: string;
  name: string;
  drive: string | null;
}

const dataEl = document.getElementById('flight-data');
const list = document.getElementById('list');

document.querySelectorAll<HTMLElement>('[data-ago]').forEach((el) => {
  el.textContent = timeAgo(el.dataset.ago!);
});

if (dataEl && list) init(JSON.parse(dataEl.textContent || '{}'), list);

function init({ rows, adults, origins }: { rows: Row[]; adults: number; origins: Origin[] }, list: HTMLElement) {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const sortEl = $<HTMLSelectElement>('sort');
  const dayEl = $<HTMLSelectElement>('day');
  const airlineEl = $<HTMLSelectElement>('airline');
  const countEl = $('count');
  const emptyEl = $('empty');
  const moreEl = $('more');
  const clearEl = $('clear');
  const chips = [...document.querySelectorAll<HTMLButtonElement>('[data-filter]')];

  // Hide trips whose departure day has passed since the page was built.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  rows = rows.filter((r) => r.depart >= today);
  const lowest = Math.min(...rows.map((r) => r.price));

  const defaults: Filters = { sort: 'price', day: '', airline: '', nonstop: false, nights: [], time: [], origin: [] };
  let filters: Filters = { ...defaults };
  try {
    filters = { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    // Ignore saved filters that can't be read.
  }
  // Drop saved choices that no longer exist in the data.
  if (![...dayEl.options].some((o) => o.value === filters.day)) filters.day = '';
  if (![...airlineEl.options].some((o) => o.value === filters.airline)) filters.airline = '';

  let shown = PAGE_SIZE;

  const timeBucket = (stamp: string | null) => {
    const h = stamp ? Number(stamp.slice(11, 13)) : -1;
    return h < 0 ? '' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  };

  const matches = (r: Row) =>
    (!filters.day || r.depart === filters.day) &&
    (!filters.airline || r.airlines.includes(filters.airline)) &&
    (!filters.nonstop || r.stops === 0) &&
    (!filters.nights.length || filters.nights.includes(String(r.nights))) &&
    (!filters.time.length || filters.time.includes(timeBucket(r.departTime))) &&
    (!filters.origin.length || filters.origin.includes(r.origin ?? ''));

  const sorters: Record<Filters['sort'], (a: Row, b: Row) => number> = {
    price: (a, b) => a.price - b.price || a.durationMin - b.durationMin,
    duration: (a, b) => a.durationMin - b.durationMin || a.price - b.price,
    date: (a, b) => a.depart.localeCompare(b.depart) || a.nights - b.nights || a.price - b.price,
  };

  function render() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    sortEl.value = filters.sort;
    dayEl.value = filters.day;
    airlineEl.value = filters.airline;
    for (const chip of chips) {
      const { filter, value = '' } = chip.dataset;
      const on =
        filter === 'nonstop' ? filters.nonstop : (filters[filter as ListKey] ?? []).includes(value);
      chip.setAttribute('aria-pressed', String(on));
    }

    const results = rows.filter(matches).sort(sorters[filters.sort]);
    const label = { price: 'cheapest first', duration: 'shortest first', date: 'earliest first' }[filters.sort];
    countEl.textContent = `${results.length} flight${results.length === 1 ? '' : 's'} · ${label}`;
    const active = JSON.stringify({ ...filters, sort: 'price' }) !== JSON.stringify(defaults);
    clearEl.classList.toggle('hidden', !active);
    emptyEl.classList.toggle('hidden', results.length > 0);
    moreEl.classList.toggle('hidden', results.length <= shown);
    list.innerHTML = results.slice(0, shown).map(card).join('');
  }

  function originBadge(code: string | null) {
    const o = origins.find((x) => x.code === code);
    if (!o) return '';
    const cls = o.drive ? 'bg-violet-100 text-violet-800' : 'bg-gray-100 text-gray-800';
    const label = o.drive ? `From ${o.code} · ${o.drive}` : `From ${o.code}`;
    return `<span class="rounded-full px-2 py-0.5 font-semibold ${cls}">${esc(label)}</span><span aria-hidden="true">·</span>`;
  }

  function card(r: Row) {
    const nextDay = r.departTime && r.arriveTime && r.arriveTime.slice(0, 10) > r.departTime.slice(0, 10);
    const stops =
      r.stops === 0
        ? '<span class="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">Nonstop</span>'
        : `<span>${r.stops} stop${r.stops > 1 ? 's' : ''}${r.layovers.length ? ` · ${esc(r.layovers.join(', '))}` : ''}</span>`;
    return `
      <li class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-orange-100">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-base font-semibold">${formatDay(r.depart)} → ${formatDay(r.return)}</p>
            <p class="text-sm text-gray-600">${r.nights} nights</p>
          </div>
          <div class="text-right">
            <p class="text-2xl font-extrabold leading-none tracking-tight">${formatMoney(r.price)}</p>
            <p class="mt-1 text-sm text-gray-600">${formatMoney(Math.round(r.price / adults))}/person</p>
          </div>
        </div>
        ${r.price === lowest ? '<p class="mt-2 inline-block rounded-full bg-orange-100 px-2 py-0.5 text-sm font-semibold text-orange-800">Lowest price</p>' : ''}
        <div class="mt-3 flex items-center gap-2 text-base">
          <span class="font-semibold">${formatTime(r.departTime)}</span>
          <span class="h-px flex-1 bg-gray-300" aria-hidden="true"></span>
          <span class="text-sm text-gray-500">${formatDuration(r.durationMin)}</span>
          <span class="h-px flex-1 bg-gray-300" aria-hidden="true"></span>
          <span class="font-semibold">${formatTime(r.arriveTime)}${nextDay ? '<sup class="text-rose-600">+1</sup>' : ''}</span>
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-700">
          ${originBadge(r.origin)}
          <span class="font-medium">${esc(r.airlines.join(' + '))}</span>
          <span aria-hidden="true">·</span>
          ${stops}
        </div>
        <p class="mt-2 text-xs text-gray-500">Outbound flight shown · price checked ${timeAgo(r.fetchedAt)}</p>
        <a href="${esc(r.url)}" target="_blank" rel="noopener"
          class="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-orange-600 text-base font-semibold text-white active:bg-orange-700">
          Book on Google Flights ↗
        </a>
      </li>`;
  }

  sortEl.addEventListener('change', () => {
    filters.sort = sortEl.value as Filters['sort'];
    shown = PAGE_SIZE;
    render();
  });
  dayEl.addEventListener('change', () => {
    filters.day = dayEl.value;
    shown = PAGE_SIZE;
    render();
  });
  airlineEl.addEventListener('change', () => {
    filters.airline = airlineEl.value;
    shown = PAGE_SIZE;
    render();
  });
  for (const chip of chips) {
    chip.addEventListener('click', () => {
      const { filter, value = '' } = chip.dataset;
      if (filter === 'nonstop') filters.nonstop = !filters.nonstop;
      else {
        const key = filter as ListKey;
        filters[key] = filters[key].includes(value) ? filters[key].filter((v) => v !== value) : [...filters[key], value];
      }
      shown = PAGE_SIZE;
      render();
    });
  }
  clearEl.addEventListener('click', () => {
    filters = { ...defaults, sort: filters.sort };
    shown = PAGE_SIZE;
    render();
  });
  moreEl.addEventListener('click', () => {
    shown += PAGE_SIZE;
    render();
  });

  render();
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
