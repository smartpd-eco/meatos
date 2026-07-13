const DEFAULT_SCHEMA = "public";

export function createSupabaseRestClient(config = {}) {
  const baseUrl = String(config.url ?? "").replace(/\/+$/, "");
  const anonKey = String(config.anonKey ?? "");
  const defaultSchema = config.schema ?? DEFAULT_SCHEMA;

  if (!baseUrl || !anonKey) return null;

  return {
    schema(schemaName = defaultSchema) {
      return {
        from(tableName) {
          return createQueryBuilder({
            baseUrl,
            anonKey,
            schemaName,
            tableName
          });
        }
      };
    }
  };
}

function createQueryBuilder({ baseUrl, anonKey, schemaName, tableName }) {
  const state = {
    selectColumns: "*",
    filters: [],
    order: null,
    limit: null
  };

  return {
    select(columns = "*") {
      state.selectColumns = columns;
      return this;
    },
    eq(column, value) {
      state.filters.push({ column, operator: "eq", value });
      return this;
    },
    order(column, options = {}) {
      state.order = { column, ascending: options.ascending !== false };
      return this;
    },
    limit(value) {
      state.limit = value;
      return this;
    },
    then(onFulfilled, onRejected) {
      return executeQuery({
        baseUrl,
        anonKey,
        schemaName,
        tableName,
        state
      }).then(onFulfilled, onRejected);
    }
  };
}

async function executeQuery({ baseUrl, anonKey, schemaName, tableName, state }) {
  const params = new URLSearchParams();
  params.set("select", state.selectColumns);

  for (const filter of state.filters) {
    params.set(filter.column, `${filter.operator}.${String(filter.value)}`);
  }

  if (state.order) {
    params.set("order", `${state.order.column}.${state.order.ascending ? "asc" : "desc"}`);
  }

  if (state.limit !== null && state.limit !== undefined) {
    params.set("limit", String(state.limit));
  }

  const schemaPrefix = schemaName && schemaName !== "public" ? `${schemaName}.` : "";
  const url = `${baseUrl}/rest/v1/${schemaPrefix}${tableName}?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: "application/json"
    }
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : [];
  } catch {
    data = text;
  }

  if (!response.ok) {
    return {
      data: null,
      error: {
        message: extractMessage(data, response.statusText),
        status: response.status,
        details: data
      }
    };
  }

  return { data, error: null };
}

function extractMessage(data, fallback) {
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object") {
    return data.message || data.error || data.details || fallback;
  }
  return fallback;
}
