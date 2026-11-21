# Becky's Flight Site

A small, phone-first website listing round-trip flights from the **Cedar Rapids area (CID, plus nearby MLI and DSM)** to
**Palm Desert (Palm Springs airport, PSP)**, sorted from cheapest to most expensive.

- Leave any day **Mar 12–21, 2027** and stay **4–6 nights** (30 date combinations)
- **3 travelers** (Becky + 2 teens). Google Flights counts anyone 12 or older as an adult, so searches use 3 adults
- Filters: nonstop, departure airport, nights, time of day, departure day and airline. Sort by cheapest, shortest or earliest
- Each card shows the flight out and, for the cheapest trips, the flight back. A warning appears if the return lands at a different airport
- Price-trend chart, how old each price is, and a **Book on Google Flights** button on every flight
- Can be added to a phone's home screen like an app

Built with **Astro** + **Tailwind CSS**, the same stack as the Kelley Properties site. It's a static site on GitHub Pages
with no server or database.

## How prices stay up to date

Prices come from the [SerpApi Google Flights API](https://serpapi.com/google-flights-api). A single search covers all
three departure airports.

`.github/workflows/deploy.yml` runs every day:

1. `scripts/fetch-flights.mjs` refreshes the **5 date combinations with the oldest prices**. The first run loads all 30.
   Every combination is refreshed about every 6 days.
2. It then looks up return flights for up to **3 of the 6 cheapest trips** that don't have one yet. It prefers a return to
   the airport she left from. Each lookup costs one search, so the total is at most 8 searches a day, under SerpApi's free
   250 a month.
3. The results are committed to `src/data/flights.json`, and the daily cheapest price goes into `src/data/history.json`.
4. The site is rebuilt and published to the `gh-pages` branch.

If a search fails, that combination keeps its previous prices. Once every departure date has passed, the script stops
using searches.

To refresh everything now, open **Actions → Update prices and deploy → Run workflow** and tick *Refresh every date
combination*. That uses about 30 searches.

## Setup

1. Create a free account at [serpapi.com](https://serpapi.com) and copy your API key.
2. Create the GitHub repo `beckys-flight-site` and push this folder to `main`.
3. In the repo, open **Settings → Secrets and variables → Actions** and add a secret named `SERPAPI_KEY`.
4. In **Settings → Pages**, set the source to **Deploy from a branch → `gh-pages` / root**.
5. Run the workflow once from the Actions tab. The site is served at `https://getprojectable.github.io/beckys-flight-site/`.

GitHub pauses scheduled workflows after 60 days with no repository activity. The daily price commits count as activity,
but if prices ever stop updating, re-enable the workflow in the Actions tab.

## Develop

```bash
npm install
npm run dev        # http://localhost:4321/beckys-flight-site/ (shows sample prices until real ones are fetched)
npm run build      # outputs dist/
npm run check      # type-check
SERPAPI_KEY=... npm run fetch   # refresh prices locally
```

Node 22+ is required. `node scripts/make-sample.mjs` regenerates the made-up sample data used by `npm run dev`.

## Changing the trip

Airports, dates, nights, travelers and the number of combinations refreshed per day are in `src/data/trip.json`.
Keep `(number of departure days × nights options)` and `refreshPerRun` within your SerpApi plan. Photos are in
`src/assets/`.

## Notes

- Prices are the round-trip total for all travelers in economy. Fares change often, so check the price on Google Flights
  before booking.
- Each return-flight lookup costs a search, so only the cheapest trips have them. Other cards say the return is "not
  checked yet", and Google Flights shows those options.
- The site is marked `noindex`, so search engines won't list it. It is still public to anyone who has the link, and the
  GitHub repo is public unless you make it private.
