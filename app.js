import {
  PEOPLE, RENT, RENT_FIRST_MONTH, RENT_LAST_MONTH, DUE_DAY, OWED_LEAD_DAYS,
  UTILITY_MONTHS_BEHIND_RENT, BILLS as BILLS_FILE, WATER_FIXED_MONTHS, PAYMENTS,
} from "./data.js";

/* Local unsaved edits to the bills, layered on top of data.js.
   They live in this browser until you paste them back into data.js. */
const DRAFT_KEY = "rent-tracker-bill-draft";
const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {}; } catch { return {}; } };
let draft = loadDraft();
const BILLS = {};
const mergeBills = () => {
  for (const k of Object.keys(BILLS)) delete BILLS[k];
  for (const [mk, b] of Object.entries(BILLS_FILE)) BILLS[mk] = { ...b };
  for (const [mk, b] of Object.entries(draft)) BILLS[mk] = { ...(BILLS[mk] || {}), ...b };
};
mergeBills();

/* Payments logged with the buttons, until they're pasted into data.js. */
const PAY_KEY = "rent-tracker-pay-draft";
let payDraft = (() => { try { return JSON.parse(localStorage.getItem(PAY_KEY)) || []; } catch { return []; } })();
const savePayDraft = () => localStorage.setItem(PAY_KEY, JSON.stringify(payDraft));
const allPayments = () => [...PAYMENTS, ...payDraft];

/* ---------- tiny helpers ---------- */
const money = (n) =>
  (n < 0 ? "-$" : "$") +
  Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;
const monthKey = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
const parseMonth = (k) => ({ y: +k.slice(0, 4), m: +k.slice(5, 7) });
const addMonths = (k, delta) => {
  const { y, m } = parseMonth(k);
  const t = y * 12 + (m - 1) + delta;
  return monthKey(Math.floor(t / 12), (t % 12) + 1);
};
const monthLabel = (k) => {
  const { y, m } = parseMonth(k);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
};
const dateLabel = (d) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

/* ---------- 1. utilities: what each person owes for a given bill month ---------- */
function utilitiesFor(mk) {
  const bill = BILLS[mk] || {};
  const lines = [];
  const share = Object.fromEntries(PEOPLE.map((p) => [p, 0]));
  const water = Object.fromEntries(PEOPLE.map((p) => [p, 0]));   // water only
  const other = Object.fromEntries(PEOPLE.map((p) => [p, 0]));   // wifi + gas + electric
  let total = 0;

  for (const kind of ["wifi", "gas", "electric", "water"]) {
    const amt = bill[kind];
    if (amt == null) continue;
    total += amt;
    const bucket = kind === "water" ? water : other;

    const rule = kind === "water" ? WATER_FIXED_MONTHS[mk] : null;
    if (rule) {
      let rest = amt;
      for (const [p, v] of Object.entries(rule.fixed)) { share[p] += v; bucket[p] += v; rest -= v; }
      share[rule.remainderPaidBy] += rest;
      bucket[rule.remainderPaidBy] += rest;
      lines.push({ kind, amt, note: `split: ${Object.entries(rule.fixed).map(([p, v]) => `${p} ${money(v)}`).join(", ")}, ${rule.remainderPaidBy} ${money(rest)}` });
    } else {
      const each = amt / PEOPLE.length;
      for (const p of PEOPLE) { share[p] += each; bucket[p] += each; }
      lines.push({ kind, amt, note: `${money(each)} each` });
    }
  }
  return { total: r2(total), share, water, other, lines, hasAny: lines.length > 0 };
}

/* ---------- 2. the due schedule ---------- */
/* On the 28th of month M you owe: rent for M+1, and utilities for M-1. */
function buildSchedule() {
  const rows = [];
  const firstDue = addMonths(RENT_FIRST_MONTH, -1);      // first rent payment
  const start = addMonths(firstDue, -2);                  // show a little history
  const end = addMonths(RENT_LAST_MONTH, 1);              // trailing utility bills

  for (let mk = start; mk <= end; mk = addMonths(mk, 1)) {
    const { y, m } = parseMonth(mk);
    const dueDate = new Date(y, m - 1, DUE_DAY);
    dueDate.setHours(0, 0, 0, 0);

    const rentMonth = addMonths(mk, 1);
    const rentApplies = rentMonth >= RENT_FIRST_MONTH && rentMonth <= RENT_LAST_MONTH;
    const utilMonth = addMonths(rentMonth, -UTILITY_MONTHS_BEHIND_RENT);
    const util = utilitiesFor(utilMonth);

    const per = Object.fromEntries(PEOPLE.map((p) => [
      p,
      {
        rent: rentApplies ? RENT[p] : 0,
        util: util.share[p] || 0,
        water: util.water[p] || 0,
        other: util.other[p] || 0,
      },
    ]));
    const total = r2(PEOPLE.reduce((s, p) => s + per[p].rent + per[p].util, 0));
    if (total === 0) continue;

    /* Owed as soon as we're inside the lead window before the due date. */
    const accrueFrom = new Date(dueDate);
    accrueFrom.setDate(accrueFrom.getDate() - OWED_LEAD_DAYS);

    rows.push({
      dueDate,
      rentMonth: rentApplies ? rentMonth : null,
      utilMonth: util.hasAny ? utilMonth : null,
      per, total,
      isDue: accrueFrom <= TODAY,
      isPast: dueDate < TODAY,
    });
  }
  return rows;
}

/* ---------- 3. balances ---------- */
function computeBalances(schedule) {
  const owed = Object.fromEntries(PEOPLE.map((p) => [p, 0]));
  for (const row of schedule) {
    if (!row.isDue) continue;
    for (const p of PEOPLE) owed[p] += row.per[p].rent + row.per[p].util;
  }

  const paid = Object.fromEntries(PEOPLE.map((p) => [p, 0]));
  for (const pay of allPayments()) {
    paid[pay.by] = (paid[pay.by] || 0) + pay.amount;
    if (pay.to !== "Outside" && paid[pay.to] !== undefined) paid[pay.to] -= pay.amount;
  }

  return PEOPLE.map((p) => ({
    name: p,
    owed: r2(owed[p]),
    paid: r2(paid[p] || 0),
    out: r2((owed[p] || 0) - (paid[p] || 0)),
  }));
}

/* ---------- 4. who pays whom (proportional settle) ----------
   Each creditor's credit is split across the debtors in proportion
   to what they owe, so everyone who owes chips in on the payback. */
function settle(balances) {
  const debtors = balances.filter((b) => b.out > 0.005);
  const creditors = balances.filter((b) => b.out < -0.005);
  const totalDebt = debtors.reduce((s, d) => s + d.out, 0);
  if (!debtors.length || !creditors.length || totalDebt <= 0) return [];

  const moves = [];
  for (const c of creditors) {
    const credit = -c.out;
    let allocated = 0;
    debtors.forEach((d, i) => {
      let amt = i === debtors.length - 1
        ? r2(credit - allocated)                    // last debtor absorbs rounding
        : r2(credit * (d.out / totalDebt));
      allocated = r2(allocated + amt);
      if (amt > 0.005) moves.push({ from: d.name, to: c.name, amt });
    });
  }
  return moves;
}


/* ---------- shared with ui.js ---------- */
export const KINDS = ["wifi", "gas", "electric", "water"];
export {
  PEOPLE, BILLS, BILLS_FILE, PAYMENTS,
  draft, DRAFT_KEY, mergeBills,
  payDraft, savePayDraft,
  money, r2, monthLabel, dateLabel, TODAY,
  utilitiesFor, buildSchedule, computeBalances, settle,
};
export function setDraft(v) { draft = v; }
export function setPayDraft(v) { payDraft = v; }
