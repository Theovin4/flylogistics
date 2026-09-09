const baseUrl = (process.env.BASE_URL || "https://flylogistics.com.ng").replace(/\/+$/, "");
const concurrency = Math.max(1, Number(process.env.CONCURRENCY || 4));
const rounds = Math.max(1, Number(process.env.ROUNDS || 3));
const authToken = process.env.AUTH_TOKEN || "";

const endpoints = [
  { method: "GET", path: "/tracking", public: true },
  { method: "GET", path: "/quote", public: true },
  { method: "GET", path: "/customer", public: false },
  { method: "GET", path: "/api/customer/overview", public: false },
  { method: "GET", path: "/api/shipments", public: false },
  { method: "GET", path: "/api/admin/analytics", public: false }
];

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

async function hit(endpoint) {
  const startedAt = performance.now();
  const headers = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  try {
    const response = await fetch(`${baseUrl}${endpoint.path}`, {
      method: endpoint.method,
      headers,
      redirect: "manual"
    });
    await response.arrayBuffer();
    return {
      endpoint: endpoint.path,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt)
    };
  } catch (error) {
    return {
      endpoint: endpoint.path,
      status: 0,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function worker(queue, results) {
  while (queue.length) {
    const endpoint = queue.shift();
    if (!endpoint) return;
    results.push(await hit(endpoint));
  }
}

const queue = [];
for (let round = 0; round < rounds; round += 1) {
  queue.push(...endpoints);
}

const results = [];
await Promise.all(Array.from({ length: concurrency }, () => worker(queue, results)));

const grouped = new Map();
for (const result of results) {
  const list = grouped.get(result.endpoint) ?? [];
  list.push(result);
  grouped.set(result.endpoint, list);
}

console.log(`Fly Logistics load test: ${baseUrl}`);
console.log(`Rounds: ${rounds}; concurrency: ${concurrency}; auth: ${authToken ? "yes" : "no"}`);
for (const [endpoint, rows] of grouped.entries()) {
  const durations = rows.map((row) => row.durationMs);
  const statuses = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    JSON.stringify({
      endpoint,
      requests: rows.length,
      statuses,
      p50Ms: percentile(durations, 50),
      p95Ms: percentile(durations, 95),
      maxMs: Math.max(...durations)
    })
  );
}
