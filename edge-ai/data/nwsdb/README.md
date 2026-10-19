# NWSDB monthly billing data (real households)

Real monthly bills for **106 domestic connections** (route 10/37, Kaduwela area), January 2023 to
August/September 2026, from NWSDB "Customer Billing Summary For Adjustments" reports
(`../nwsdb_raw/*.pdf`). `extract_nwsdb.py` turns them into two anonymised tables:

| File | One row per | Contents |
|---|---|---|
| `nwsdb_monthly.csv` | household × billing month (4,724) | units (m³), reading, reading date, period days, litres/day, charges, quality flags |
| `nwsdb_households.csv` | household (106) | months, median / mean / p90 litres per day, zero months, spikes, flag counts |

Households are `HH001…`; names, NIC, addresses, account / meter / connection numbers, balances and
payments are not in the outputs. The account → id key is written to `private/` (git-ignored).

```
cd edge-ai/data/nwsdb
pip install pdfplumber pandas
python extract_nwsdb.py
```

## Cleaning

* **litres_per_day** = units × 1000 / days since the previous reading, only for **usable** months:
  normal bill and reading type (`N`), a 20–45-day period, no meter reset, not inside a run of ≥ 3 zero
  months. 85 % of bill-months are usable.
* **Estimated bills** (bill/reading type `E`, 407 months) are kept but not usable: their units often
  differ from the meter difference, and the next actual reading corrects them.
* Type `X` (14 months) is undocumented in the report; treated as not usable.
* **Reading codes** (`C.Code`: 4, 5, 6, 2, 9, 25, …) are kept as `code_flag`; their meanings are not
  in the report (ask NWSDB). They do not affect `usable`.
* **spike**: a month ≥ 2 × the household's median non-zero month and ≥ 10 m³ — a candidate leak or
  unusual use, as a utility would see it a month later.
* Two PDFs in `nwsdb_raw/` are byte-identical copies under other file names
  (`10-37-800-023-19.pdf` = `10-37-800-015-19.pdf`, `10-37-751-03.pdf` = `10-37-751-030-15.pdf`);
  rows are de-duplicated by the account number inside the PDF.
