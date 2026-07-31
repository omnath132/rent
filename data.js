/* ============================================================
   THE ONLY FILE YOU EDIT.
   Change a number, save, push — the site updates.
   ============================================================ */

export const PEOPLE = ["Aidan", "Brandon", "Simon", "Spence"];

/* Google sign-in. Paste your OAuth client ID here (Google Cloud Console →
   APIs & Services → Credentials → OAuth client ID, type "Web application",
   authorized JavaScript origin = your vercel.app URL). Leave "" to disable
   sign-in. The same value must also be set as the GOOGLE_CLIENT_ID
   environment variable on Vercel. */
export const GOOGLE_CLIENT_ID = 41680497963-7vpavv2ne7n3epknj8pcjdecbogohn72.apps.googleusercontent.com;

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

/* The pay window stays open until this day of the FOLLOWING month
   (due the 28th → payable through the 7th of the next month). */
export const PAY_UNTIL_DAY = 7;

/* Rent is for the month ahead; utilities are for the month just ending.
   So on the 28th of July you pay AUGUST rent + JULY utilities. */
export const UTILITY_MONTHS_BEHIND_RENT = 1;

/* Who fronts each bill for the whole house. Their Pay tab gets the
   "pay for the whole house" card; everyone else just settles up with them. */
export const BILL_PAYERS = {
  rentWater: "Simon",       // rent + water → landlord
  otherUtilities: "Aidan",  // wifi, gas, electric → utility co
};

/* ------------------------------------------------------------
   UTILITY BILLS — one entry per month the bill COVERS.
   Leave a bill out (or null) if it hasn't arrived yet.
   ------------------------------------------------------------ */
export const BILLS = {
  "2026-06": { wifi: 74.91, gas: 20.61, electric: 38.37 },   // water settled separately, everyone paid their own
  "2026-07": { wifi: 70.00 },
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
   To make some people pay a FIXED amount of a month's water bill
   (like summer 2026), add an entry here:
     "2027-06": { fixed: { Aidan: 30, Brandon: 30, Spence: 30 }, remainderPaidBy: "Simon" },
   ------------------------------------------------------------ */
export const WATER_FIXED_MONTHS = {};

/* ------------------------------------------------------------
   PAYMENTS LOG — add a line every time someone pays.
   to: "Landlord" / "Utility co"  = money leaving the house
   to: "Aidan" (a name)           = paying a roommate back
   covers: (optional) whose shares a whole-house payment covered —
           everyone listed except the payer then owes the payer.
   Examples:
     { date: "2026-07-28", by: "Simon", amount: 802.50, to: "Landlord", note: "Rent + water — Simon's share" },
     { date: "2026-07-29", by: "Brandon", amount: 33.47, to: "Aidan", note: "Settle up" },
   ------------------------------------------------------------ */
export const PAYMENTS = [
  { date: "2026-07-16", by: "Aidan", amount: 133.89, to: "Utility co",
    note: "June 2026 utilities — whole house",
    covers: { Aidan: 33.4725, Brandon: 33.4725, Simon: 33.4725, Spence: 33.4725 } },
];
