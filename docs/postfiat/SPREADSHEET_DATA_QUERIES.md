# Spreadsheet Data Queries

PFDocs spreadsheets expose two asynchronous worksheet functions: the preferred
provider-neutral `CORBANU` contract and the provider-first `PFDATA`
compatibility contract.
The worksheet contract is provider-neutral: Tiingo is the server default, so a
normal formula contains no provider name or credential. The Tiingo token never
enters the spreadsheet, browser storage, document content, or exported workbook.

## Formula contract

Use a US ticker and a quote field for current market data:

```text
=CORBANU("msft us","px last")
=CORBANU("V US","px volume")
```

Use a fiscal period as the third argument for historical fundamentals:

```text
=CORBANU("msft us","revenue","3Q 2024")
=CORBANU("msft us","net income","FY 2024")
=CORBANU("msft us","diluted eps","latest")
```

The source is an optional fourth argument. Most users should omit it and let the
server apply its configured default:

```text
=CORBANU("msft us","revenue","3Q 2024","tiingo")
=CORBANU("msft us","px last","","tiingo")
```

Existing provider-first formulas remain supported. `PFDATA` takes the source
first, followed by the security, field, and optional fiscal period:

```text
=PFDATA("tiingo","V US Equity","PX_LAST")
=PFDATA("tiingo","MSFT US Equity","REVENUE","3Q 2024")
```

Both functions use the same normalized provider adapters, server endpoint, and
browser cache.

Plain tickers, `MSFT US`, and `MSFT US Equity` are accepted for US equities.
Fiscal periods accept `3Q 2024`, `Q3 2024`, `Q3-24`, `2024 Q3`, `FY 2024`, a
bare annual year such as `2024`, and `latest`. Periods are the company's reported
fiscal periods, not inferred calendar quarters.

## Quote fields

The Tiingo adapter queries the IEX top-of-book/last endpoint and supports these
normalized fields:

| CORBANU field | Tiingo source field |
| --- | --- |
| `PX_LAST`, `LAST_PRICE` | `tngoLast`, then entitled `last` |
| `TNGO_LAST` | `tngoLast` |
| `LAST` | `last` |
| `PX_OPEN`, `OPEN` | `open` |
| `PX_HIGH`, `HIGH` | `high` |
| `PX_LOW`, `LOW` | `low` |
| `PX_VOLUME`, `VOLUME` | `volume` |
| `PX_BID`, `BID_PRICE`, `BID_SIZE` | `bidPrice`, `bidSize` |
| `PX_ASK`, `ASK_PRICE`, `ASK_SIZE` | `askPrice`, `askSize` |
| `PX_MID`, `MID` | `mid` |
| `PREV_CLOSE` | `prevClose` |
| `LAST_UPDATE_DT` | `timestamp` |
| `QUOTE_TIMESTAMP` | `quoteTimestamp` |
| `LAST_SALE_TIMESTAMP` | `lastSaleTimestamp` |
| `TICKER` | `ticker` |

Tiingo documents `tngoLast` as its derived real-time reference price. Raw IEX
last, bid, and ask values can be null unless the account has the required IEX
entitlement. These formulas provide reference data, not executable prices or
order instructions.

## Historical fundamental fields

Readable aliases cover the usual model lines:

- Income statement: `revenue`, `sales`, `cost of revenue`, `gross profit`,
  `operating expenses`, `research and development`, `sga`, `operating income`,
  `ebit`, `ebitda`, `pretax income`, `income tax expense`, `net income`,
  `basic eps`, `diluted eps`, `basic shares`, and `diluted shares`.
- Cash flow: `operating cash flow`, `cash from investing`, `cash from financing`,
  `capital expenditures`, `free cash flow`, `stock based compensation`,
  `depreciation and amortization`, `dividends paid`, `share repurchases`, and
  debt or equity issuance/repayment.
- Balance sheet: `cash`, `accounts receivable`, `inventory`, `current assets`,
  `total assets`, `accounts payable`, `current liabilities`, `total liabilities`,
  `current debt`, `long term debt`, `total debt`, and `shareholders equity`.
- Ratios and valuation: `gross margin`, `operating margin`, `net margin`,
  `current ratio`, `return on assets`, `return on equity`, `debt to equity`,
  `price to earnings`, `price to book`, `market capitalization`, and
  `enterprise value`.

Every raw data code currently returned by Tiingo's definitions endpoint is also
accepted, including camel-case codes such as `cashAndEq`, `shareswaDil`, and
`freeCashFlow`. The adapter's current definitions set contains 85 codes; the
source-of-truth list is `TIINGO_FUNDAMENTAL_CODES` in
`lib/postfiat-data-query.js`.

## HTTP contract

The worksheet calls the same-origin endpoint. Omitting `source` selects the
server's default provider:

```http
POST /api/postfiat/data/query
Content-Type: application/json

{
  "security": "MSFT US",
  "field": "REVENUE",
  "period": "3Q 2024"
}
```

A successful historical response includes the resolved fiscal period:

```json
{
  "ok": true,
  "provider": "tiingo",
  "security": "MSFT US",
  "normalizedSecurity": "MSFT US EQUITY",
  "symbol": "MSFT",
  "field": "REVENUE",
  "value": 61858000000,
  "sourceField": "revenue",
  "period": "3Q 2024",
  "fiscalYear": 2024,
  "fiscalQuarter": 3,
  "asOf": "2024-03-31",
  "cacheStatus": "miss"
}
```

The endpoint accepts structured provider queries only. It is not a general URL
fetcher. Browser calls from origins other than the configured PFDocs main,
sandbox, or explicitly permitted embedder origins are rejected.

## Refresh and failure behavior

- Equivalent formulas share a 10-second browser cache.
- Each server worker coalesces concurrent quote requests and caches one Tiingo
  quote snapshot per symbol for 15 seconds. A fetched quote can be used for up
  to five minutes when Tiingo is temporarily unavailable.
- Historical statement snapshots are coalesced and cached for 15 minutes, with
  a 24-hour stale-if-error window. Many model fields for one ticker therefore
  share one upstream statement response.
- A formula failure renders a bounded `#CORBANU! ...` or `#PFDATA! ...`
  message in the cell.
- `CORBANU` and `PFDATA` are registered whenever a PFDocs spreadsheet opens, and existing
  custom formulas are recalculated after registration.

## Microsoft model and live verification

`scripts/lib/msft-corbanu-model.mjs` defines a basic historical Microsoft model
with quarterly and annual income statement, cash-flow, balance-sheet, margin,
growth, and leverage lines. The production smoke check creates a clean encrypted
spreadsheet, pastes the complete model, verifies every formula is numeric, waits
for persistence, reloads the sheet, and verifies every formula again:

```sh
npm run smoke:data-query:live
```

Chrome must be running with DevTools on port `9223`. Override
`PFDOCS_MAIN_ORIGIN`, `PFDOCS_SANDBOX_ORIGIN`, or `CDP_PORT` when checking a
non-production deployment.

## Deployment

Set the Tiingo token only as a server secret:

```sh
TIINGO_API_KEY=... node server.js
```

For Fly.io, use the `TIINGO_API_KEY` application secret. Do not put a token in
`config/config.js`, a formula, a document, or `/api/config`. Non-secret defaults
live under `postFiat.data`, including `defaultProvider`, and under
`postFiat.data.tiingo` for endpoint and cache settings.

Before making the feature available beyond the licensed audience, verify that
the Tiingo account's plan and IEX agreement permit the intended display or
redistribution.

Official references:

- [Tiingo fundamentals API](https://www.tiingo.com/documentation/fundamentals)
- [Tiingo IEX product and fields](https://www.tiingo.com/products/iex-api)
- [Tiingo API authentication](https://www.tiingo.com/documentation/general/connecting)
- [Tiingo general API policy](https://www.tiingo.com/documentation/general)
- [Tiingo terms of use](https://api.tiingo.com/tos/)

## Adding a provider

Add a provider adapter in `lib/postfiat-data-query.js` with:

- a stable lowercase `id`;
- an optional `normalizeSecurity(value)` implementation;
- an asynchronous `query({ security, field, period, options })` implementation;
- bounded upstream hosts, responses, timeouts, and credentials;
- regression tests proving field mapping, error behavior, and request
  coalescing where appropriate.

Users can select the adapter with `CORBANU`'s optional fourth argument without
changing the normal provider-neutral formula contract.
