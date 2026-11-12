<!-- made by scripts/perf.mjs on 2026-11-12 against http://localhost:3600, median of 5 runs -->

| Page | Client ms | Server ms | DB calls in the code | Round trips to Supabase | sign-in | table queries | functions | Round-trip ms added up |
|---|---|---|---|---|---|---|---|---|
| Home | 1600 | 1105 | 20 | 8 | 1 | 7 | 0 | 2715 |
| Sell | 1302 | 1038 | 8 | 4 | 1 | 3 | 0 | 1329 |
| Reorder | 1275 | 947 | 20 | 8 | 1 | 7 | 0 | 2167 |
| Stock | 1054 | 796 | 17 | 7 | 1 | 6 | 0 | 1673 |
| Why this number | 992 | 753 | 17 | 7 | 1 | 6 | 0 | 1590 |
| Scorecard | 1499 | 1252 | 27 | 11 | 1 | 10 | 0 | 2579 |
