// SPDX-FileCopyrightText: 2026 Post Fiat contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

export const SECURITY = "msft us";
export const QUARTERLY_PERIODS = [
    "3Q 2024",
    "4Q 2024",
    "1Q 2025",
    "2Q 2025",
    "3Q 2025",
    "4Q 2025",
    "1Q 2026",
    "2Q 2026",
];
export const ANNUAL_PERIODS = ["FY 2024", "FY 2025"];
export const PERIOD_COLUMNS = [...QUARTERLY_PERIODS, "", ...ANNUAL_PERIODS];

const columnName = (index) => {
    let value = index;
    let result = "";
    while (value > 0) {
        value -= 1;
        result = String.fromCharCode(65 + (value % 26)) + result;
        value = Math.floor(value / 26);
    }
    return result;
};

const reportedRow = (label, field, divisor = 1) => {
    return [label, ...PERIOD_COLUMNS.map((period, index) => {
        if (!period) return "";
        const column = columnName(index + 2);
        const formula = `=CORBANU($B$2,"${field}",${column}$6)`;
        return divisor === 1 ? formula : `${formula}/${divisor}`;
    })];
};

const calculatedRow = (label, makeFormula) => {
    return [label, ...PERIOD_COLUMNS.map((period, index) => {
        if (!period) return "";
        return makeFormula(columnName(index + 2), index);
    })];
};

export const MODEL_ROWS = [
    ["Microsoft Historical Financial Model"],
    ["Security", SECURITY],
    ["Live Price", '=CORBANU($B$2,"px last")'],
    ["USD in millions except per-share data; periods are Microsoft fiscal periods"],
    ["Historical Income Statement"],
    ["Metric", ...PERIOD_COLUMNS],
    reportedRow("Revenue", "revenue", 1_000_000),
    calculatedRow("Revenue YoY Growth (%)", (column, index) => {
        if (index === 10) return "=(L7/K7-1)*100";
        if (index < 4 || index >= 8) return "";
        const priorColumn = columnName(index - 2);
        return `=(${column}7/${priorColumn}7-1)*100`;
    }),
    reportedRow("Cost of Revenue", "cost of revenue", 1_000_000),
    reportedRow("Gross Profit", "gross profit", 1_000_000),
    calculatedRow("Gross Margin (%)", (column) => `=${column}10/${column}7*100`),
    reportedRow("Operating Expenses", "operating expenses", 1_000_000),
    reportedRow("Research & Development", "research and development", 1_000_000),
    reportedRow("SG&A", "sga", 1_000_000),
    reportedRow("Operating Income", "operating income", 1_000_000),
    calculatedRow("Operating Margin (%)", (column) => `=${column}15/${column}7*100`),
    reportedRow("EBITDA", "ebitda", 1_000_000),
    reportedRow("Net Income", "net income", 1_000_000),
    calculatedRow("Net Margin (%)", (column) => `=${column}18/${column}7*100`),
    reportedRow("Diluted EPS", "diluted eps"),
    reportedRow("Diluted Shares", "diluted shares", 1_000_000),
    [],
    ["Cash Flow Statement"],
    reportedRow("Operating Cash Flow", "operating cash flow", 1_000_000),
    reportedRow("Capital Expenditures", "capital expenditures", 1_000_000),
    reportedRow("Free Cash Flow", "free cash flow", 1_000_000),
    calculatedRow("FCF Margin (%)", (column) => `=${column}26/${column}7*100`),
    reportedRow("Stock-Based Compensation", "stock based compensation", 1_000_000),
    [],
    ["Balance Sheet"],
    reportedRow("Cash & Equivalents", "cash", 1_000_000),
    reportedRow("Total Debt", "total debt", 1_000_000),
    calculatedRow("Net Debt", (column) => `=${column}32-${column}31`),
    reportedRow("Total Assets", "total assets", 1_000_000),
    reportedRow("Current Assets", "current assets", 1_000_000),
    reportedRow("Total Liabilities", "total liabilities", 1_000_000),
    reportedRow("Current Liabilities", "current liabilities", 1_000_000),
    reportedRow("Shareholders' Equity", "shareholders equity", 1_000_000),
    calculatedRow("Current Ratio", (column) => `=${column}35/${column}37`),
    calculatedRow("Debt / Equity", (column) => `=${column}32/${column}38`),
];

export const MODEL_TSV = MODEL_ROWS.map((row) => row.join("\t")).join("\n");

export const MODEL_CHECKS = Object.freeze({
    livePrice: "B3",
    revenue3Q2024: "B7",
    revenue3Q2025: "F7",
    revenueFY2024: "K7",
    grossMargin3Q2024: "B11",
    netIncome3Q2024: "B18",
    dilutedEps3Q2024: "B20",
    operatingCashFlow3Q2024: "B24",
    freeCashFlow3Q2024: "B26",
    netDebt3Q2024: "B33",
    currentRatioFY2024: "K39",
    debtToEquityFY2024: "K40",
});
