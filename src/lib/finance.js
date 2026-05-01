// ─── Shared Finance Helpers ───────────────────────────────────────────

export const RM  = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { maximumFractionDigits: 0 });
export const RM2 = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const USD = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function calcInstallment(principal, annualRatePct, tenureYears) {
  if (!principal || !tenureYears) return 0;
  const r = annualRatePct / 100 / 12;
  const n = tenureYears * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export function calcFd(fd) {
  const p = parseFloat(fd.principal) || 0;
  const r = parseFloat(fd.rate) || 0;
  const t = parseInt(fd.tenureMonths) || 0;
  if (!p || !r || !t) return null;
  const interest = p * (r / 100) * (t / 12);
  const maturityValue = p + interest;
  let maturityDate = null;
  if (fd.startDate) {
    const d = new Date(fd.startDate + "-01");
    d.setMonth(d.getMonth() + t);
    maturityDate = d.toLocaleDateString("en-MY", { month: "short", year: "numeric" });
  }
  return { interest, maturityValue, maturityDate, effectiveAnnual: (r / 100) };
}

export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

export function newProperty() {
  return {
    id: uid(), name: "My Property", developer: "", address: "",
    type: "under_construction",
    purchasePrice: 500000, interestRate: 4.0, tenure: 35,
    spaDate: "", vpDate: "",
    downpaymentRecords: [], progressiveRecords: [],
  };
}

export const COIN_IDS = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", BNB: "binancecoin",
  XRP: "ripple", ADA: "cardano", AVAX: "avalanche-2", DOGE: "dogecoin",
  MATIC: "matic-network", POL: "matic-network", DOT: "polkadot",
  SHIB: "shiba-inu", LTC: "litecoin", LINK: "chainlink", UNI: "uniswap",
  ATOM: "cosmos", XLM: "stellar", ALGO: "algorand", VET: "vechain",
  FIL: "filecoin", NEAR: "near", APT: "aptos", ARB: "arbitrum",
  OP: "optimism", SUI: "sui", INJ: "injective-protocol", TRX: "tron",
  TON: "the-open-network", PEPE: "pepe", WIF: "dogwifcoin", BONK: "bonk",
  USDT: "tether", USDC: "usd-coin", DAI: "dai",
  HBAR: "hedera-hashgraph", ICP: "internet-computer", IMX: "immutable-x",
  SAND: "the-sandbox", MANA: "decentraland", AXS: "axie-infinity",
};

export function fmtCoin(n) {
  if (n == null) return "—";
  if (n >= 1000) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1)    return "$" + n.toFixed(2);
  if (n >= 0.01) return "$" + n.toFixed(4);
  if (n >= 0.000001) return "$" + n.toFixed(6);
  return "$" + n.toPrecision(4);
}

export const FD_EMPTY = { id: null, bank: "", principal: "", rate: "", tenureMonths: "12", startDate: "", notes: "" };

export const EXPENSE_CATS = ["Rent / Housing", "Food & Dining", "Transport", "Utilities & Bills", "Insurance", "Entertainment", "Subscriptions", "Loan Repayments", "Others"];
export const EXPENSE_CAT_COLORS = ["#6ee7b7", "#6366f1", "#f59e0b", "#f472b6", "#38bdf8", "#34d399", "#fbbf24", "#f87171", "#a78bfa"];
