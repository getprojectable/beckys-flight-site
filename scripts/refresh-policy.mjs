export function selectRefreshQueue(upcoming, combos, topCardKeys, limit) {
  const oldest = [...upcoming].sort((a, b) => {
    const aTime = combos[a.key]?.fetchedAt ?? '';
    const bTime = combos[b.key]?.fetchedAt ?? '';
    return aTime.localeCompare(bTime) || a.key.localeCompare(b.key);
  });
  const byKey = new Map(upcoming.map((combo) => [combo.key, combo]));
  const top = [...new Set(topCardKeys)]
    .filter((key) => byKey.has(key) && combos[key])
    .sort((a, b) => combos[a].fetchedAt.localeCompare(combos[b].fetchedAt));
  const selected = new Set(top.slice(0, Math.floor(limit / 2)));
  for (const combo of oldest) {
    if (selected.size >= limit) break;
    selected.add(combo.key);
  }
  return [...selected].map((key) => byKey.get(key));
}

export function searchAllowance(totalSearchesLeft, reserve = 10) {
  if (!Number.isSafeInteger(totalSearchesLeft) || totalSearchesLeft < 0) {
    throw new Error('SerpApi account response has no valid total_searches_left.');
  }
  return Math.max(0, totalSearchesLeft - reserve);
}
