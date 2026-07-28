/* ============================================================
   THE ONLY FILE YOU EDIT.
   Change a number, save, push to GitHub — the site updates.
   ============================================================ */

export const PEOPLE = ["Aidan", "Brandon", "Simon", "Spence"];

/* Monthly rent (incl. insurance) per person, for the lease term below. */
export const RENT = { Aidan: 985, Brandon: 835, Simon: 785, Spence: 815 };

/* Lease: rent is owed for these months, inclusive. "YYYY-MM" */
export const RENT_FIRST_MONTH = "2026-08";
export const RENT_LAST_MONTH  = "2027-07";

/* Everything falls due on this day of the month. */
export const DUE_DAY = 28;

/* How many days BEFORE the due date the money starts counting as "owed",
   so people can pay early without the site calling them overpaid. */
export const OWED_LEAD_DAYS = 7;

/* Rent is for the month ahead; utilities are for the month just ending.
   So on the 28th of July you pay AUGUST rent + JULY utilities  -> 1.
   (The old spreadsheet lagged utilities by 2, paying the June bill.) */
export const UTILITY_MONTHS_BEHIND_RENT = 1;

/* ------------------------------------------------------------
   UTILITY BILLS — one entry per month the bill COVERS.
   Leave a bill out (or null) if it hasn't arrived yet.
   ------------------------------------------------------------ */
export const BILLS = {
  "2026-06": { wifi: 74.91, gas: 20.61, electric: 38.37, water: 172.30 },
  "2026-07": { wifi: 70.00, gas: 39.07, electric: null,  water: 172.90 },
  "2026-08": { wifi: 70.00 },
  "2026-09": { wifi: 70.00 },
  "2026-10": { wifi: 70.00 },
  "2026-11": { wifi: 70.00 },
  "2026-12": { wifi: 70.00 },
  "2027-01": { wifi: 70.00 },
  "2027-02": { wifi: 70.00 },
  "2027-03": { wifi: 70.00 },
  "2027-04": { wifi: 70.00 },
  "2027-05": { wifi: 70.00 },
  "2027-06": { wifi: 70.00 },
  "2027-07": { wifi: 70.00 },
};

/* ------------------------------------------------------------
   SPLIT RULES
   Default: every bill split evenly 4 ways.
   Exception: in these months, the named people pay a FIXED amount
   of the water bill and the remaining person covers the rest.
   ------------------------------------------------------------ */
export const WATER_FIXED_MONTHS = {
  "2026-06": { fixed: { Aidan: 30, Brandon: 30, Spence: 30 }, remainderPaidBy: "Simon" },
  "2026-07": { fixed: { Aidan: 30, Brandon: 30, Spence: 30 }, remainderPaidBy: "Simon" },
};

/* ------------------------------------------------------------
   PAYMENTS LOG — add a line every time someone pays.
   to: "Outside"  = landlord / utility company
   to: "Aidan"    = paying a roommate back (a reimbursement)
   ------------------------------------------------------------ */
export const PAYMENTS = [
  { date: "2026-06-28", by: "Aidan",   amount: 30,     to: "Outside", note: "June 2026 water" },
  { date: "2026-06-28", by: "Aidan",   amount: 985,    to: "Outside", note: "Rent + insurance" },
  { date: "2026-06-28", by: "Brandon", amount: 30,     to: "Outside", note: "June 2026 water" },
  { date: "2026-06-28", by: "Brandon", amount: 835,    to: "Outside", note: "Rent + insurance" },
  { date: "2026-06-28", by: "Simon",   amount: 82.30,  to: "Outside", note: "June 2026 water" },
  { date: "2026-06-28", by: "Simon",   amount: 785,    to: "Outside", note: "Rent + insurance" },
  { date: "2026-06-28", by: "Spence",  amount: 30,     to: "Outside", note: "June 2026 water" },
  { date: "2026-06-28", by: "Spence",  amount: 815,    to: "Outside", note: "Rent + insurance" },
  { date: "2026-07-16", by: "Aidan",   amount: 133.89, to: "Outside", note: "June 2026 utilities" },
];
