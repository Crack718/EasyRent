const parseSearchQuery = (text) =>
  String(text || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

const matchesSearchText = (title, description, query) => {
  const tokens = Array.isArray(query) ? query : parseSearchQuery(query);
  if (!tokens.length) return true;
  const haystack = `${title || ""} ${description || ""}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
};

export { parseSearchQuery, matchesSearchText };
