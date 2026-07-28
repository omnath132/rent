import {
  PEOPLE, RENT, RENT_FIRST_MONTH, RENT_LAST_MONTH, DUE_DAY, OWED_LEAD_DAYS,
  UTILITY_MONTHS_BEHIND_RENT, BILLS as BILLS_FILE, WATER_FIXED_MONTHS, PAYMENTS,
  BILL_PAYERS,
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

/* Payments logged with the buttons. */
const PAY_KEY = "rent-tracker-pay-draft";
let payDraft = (() => { try { return JSON.parse(localStorage.getItem(PAY_KEY)) || []; } catch { return []; } })();
const allPayments = () => [...PAYMENTS, ...payDraft];

/* ---------- storage: shared server if available, this device if not ----------
   When the site runs on Vercel with the Redis store configured, /api/data
   holds ONE shared state (bill edits + logged payments) for the whole house —
   no more pasting into data.js. Anywhere else (local preview, store missing)
   it falls back to per-device localStorage exactly like before.            */
let MODE = "local";
export const storeMode = () => MODE;

let pushTimer = null;
function pushServer() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bills: draft, payments: payDraft }),
    }).catch(() => {});
  }, 300);
}

const saveDraft = () => {
  if (MODE === "server") pushServer();
  else localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
};
const savePayDraft = () => {
  if (MODE === "server") pushServer();
  else localStorage.setItem(PAY_KEY, JSON.stringify(payDraft));
};

export async function initStore() {
  try {
    const r = await fetch("/api/data", { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const d = await r.json();
      if (d && typeof d.bills === "object" && d.bills !== null && Array.isArray(d.payments)) {
        MODE = "server";
        draft = d.bills;
        payDraft = d.payments;
        mergeBills();
      }
    }
  } catch { /* offline or no API — stay local */ }
  return MODE;
}

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

/* ---------- 3. balances + who-owes-whom ----------
   Two ledgers:
   · outside — what each person still owes the landlord / utility co
     (accrued dues minus their own payments out of the house)
   · IOUs   — debts between roommates: created when someone fronts a
     whole-house bill (covers), cleared when a payment's "to" is a
     roommate.
   A person's headline balance is outside + net IOUs.               */
const isPerson = (x) => PEOPLE.includes(x);

function computeBalances(schedule) {
  const owedOut = Object.fromEntries(PEOPLE.map((p) => [p, 0]));
  for (const row of schedule) {
    if (!row.isDue) continue;
    for (const p of PEOPLE) owedOut[p] += row.per[p].rent + row.per[p].util;
  }

  const paidOut = Object.fromEntries(PEOPLE.map((p) => [p, 0]));
  const iou = {};                                  // iou[a][b] = a owes b
  const addIou = (a, b, amt) => {
    iou[a] = iou[a] || {};
    iou[a][b] = (iou[a][b] || 0) + amt;
  };
  for (const pay of allPayments()) {
    if (isPerson(pay.to)) {
      addIou(pay.by, pay.to, -pay.amount);         // paying a roommate back
    } else if (pay.covers) {
      for (const [p, amt] of Object.entries(pay.covers)) {
        if (!isPerson(p)) continue;
        paidOut[p] += amt;                          // their share is now paid
        if (p !== pay.by) addIou(p, pay.by, amt);   // ...and they owe the payer
      }
    } else {
      paidOut[pay.by] += pay.amount;                // paying your own share
    }
  }

  /* net pairwise moves */
  const moves = [];
  for (let i = 0; i < PEOPLE.length; i++) {
    for (let j = i + 1; j < PEOPLE.length; j++) {
      const a = PEOPLE[i], b = PEOPLE[j];
      const net = r2((iou[a]?.[b] || 0) - (iou[b]?.[a] || 0));
      if (net > 0.005) moves.push({ from: a, to: b, amt: net });
      else if (net < -0.005) moves.push({ from: b, to: a, amt: -net });
    }
  }

  const balances = PEOPLE.map((p) => {
    const owesRoom = moves.filter((m) => m.from === p).reduce((s, m) => s + m.amt, 0);
    const owedRoom = moves.filter((m) => m.to === p).reduce((s, m) => s + m.amt, 0);
    const outside = r2(owedOut[p] - paidOut[p]);
    return {
      name: p,
      owed: r2(owedOut[p]),
      paid: r2(paidOut[p]),
      outside,
      out: r2(outside + owesRoom - owedRoom),
    };
  });

  return { balances, moves };
}


/* ---------- shared with ui.js ---------- */
export const KINDS = ["wifi", "gas", "electric", "water"];
export {
  PEOPLE, BILLS, BILLS_FILE, PAYMENTS, BILL_PAYERS,
  draft, DRAFT_KEY, mergeBills, saveDraft,
  payDraft, savePayDraft,
  money, r2, monthLabel, dateLabel, TODAY,
  utilitiesFor, buildSchedule, computeBalances, isPerson,
};
export function setDraft(v) { draft = v; }
export function setPayDraft(v) { payDraft = v; }
