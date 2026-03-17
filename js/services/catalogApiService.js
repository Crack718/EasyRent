const resolveFunctionsBaseUrl = () => {
  const config = window.EASYRENT_CONFIG || {};
  const explicit = String(config.functionsBaseUrl || "").trim();
  return explicit ? explicit.replace(/\/+$/, "") : "";
};

const fetchProjectedListings = async ({ filters = {}, cursor = null, pageSize = 12 } = {}) => {
  const config = window.EASYRENT_CONFIG || {};
  const enabled = config.enableCatalogApi === true;
  const baseUrl = resolveFunctionsBaseUrl();
  if (!enabled || !baseUrl) {
    const disabledError = new Error("Catalog API disabled");
    disabledError.code = "catalog-api-disabled";
    throw disabledError;
  }

  const response = await fetch(`${baseUrl}/catalogQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filters,
      cursor,
      pageSize
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) {
    const message =
      payload?.error || `Не удалось загрузить данные каталога (${response.status || "нет статуса"})`;
    const error = new Error(message);
    error.code = payload?.code || "catalog-query-failed";
    throw error;
  }

  return {
    docs: Array.isArray(payload.docs) ? payload.docs : [],
    hasMore: Boolean(payload.hasMore)
  };
};

export { fetchProjectedListings };
