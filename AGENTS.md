## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Project notes

- Trip settings (airports, dates, travelers, refresh budget) live in `src/data/trip.json`.
- `src/data/flights.json` and `src/data/history.json` are written by `scripts/fetch-flights.mjs` in CI. Don't hand-edit.
- The site is used almost entirely on phones: keep it mobile-first, with 44px tap targets and 16px inputs.

Full documentation: https://docs.astro.build
