import "server-only";

export const CRYPTO_ADDRESSES = {
  TRC20: { asset: "USDT", address: "TScypKhj7VmE9CrXAFn2EAKLcBG9qjwYoL" },
  BEP20: { asset: "USDT", address: "0xebc426c64ee3434d5e824e926b627039a21b48a1" },
  SOL: { asset: "USDT", address: "3jgQ5Grn9awRoq1tux6zamrKaw91jQCgSRH6puE1Fokj" },
  BTC: { asset: "BTC", address: "17Z41xvrwHRJtNNtFv1apomwHn6yAjKFnQ" }
} as const;

export type CryptoNetwork = keyof typeof CRYPTO_ADDRESSES;

async function fetchJson(url: string) {
  const response = await fetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Rate source returned ${response.status}.`);
  return response.json() as Promise<Record<string, unknown>>;
}

export async function getCryptoQuote(amountNgn: number, network: CryptoNetwork) {
  const fallback = Number(process.env.CRYPTO_USD_NGN_FALLBACK_RATE ?? 1500);
  const discount = Math.max(0, Number(process.env.CRYPTO_RATE_DISCOUNT_NGN ?? 150));
  const rates = await Promise.allSettled([
    fetchJson("https://open.er-api.com/v6/latest/USD").then((data) => Number((data.rates as Record<string, unknown>)?.NGN)),
    fetchJson("https://api.exchangerate-api.com/v4/latest/USD").then((data) => Number((data.rates as Record<string, unknown>)?.NGN))
  ]);
  const validRates = rates.flatMap((rate) => rate.status === "fulfilled" && Number.isFinite(rate.value) && rate.value > 0 ? [rate.value] : []);
  const marketRateNgn = validRates.length ? Math.min(...validRates) : fallback;
  const appliedRateNgn = Math.max(1, marketRateNgn - discount);
  const surchargePercent = 2;
  const usdAmount = amountNgn * (1 + surchargePercent / 100) / appliedRateNgn;
  let cryptoAmount = usdAmount;

  if (network === "BTC") {
    const btc: Record<string, unknown> = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd").catch(() => ({}));
    const btcUsd = Number((btc["bitcoin"] as Record<string, unknown> | undefined)?.usd ?? process.env.CRYPTO_BTC_USD_FALLBACK_RATE ?? 100000);
    cryptoAmount = usdAmount / btcUsd;
  }

  return {
    ...CRYPTO_ADDRESSES[network],
    network,
    amountNgn,
    marketRateNgn,
    appliedRateNgn,
    surchargePercent,
    cryptoAmount: Number(cryptoAmount.toFixed(network === "BTC" ? 8 : 2))
  };
}

export function validCryptoHash(network: CryptoNetwork, value: string) {
  const hash = value.trim();
  if (network === "BEP20") return /^0x[a-fA-F0-9]{64}$/.test(hash);
  if (network === "TRC20") return /^[a-fA-F0-9]{64}$/.test(hash);
  if (network === "SOL") return /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(hash);
  return /^[a-fA-F0-9]{64}$/.test(hash);
}
