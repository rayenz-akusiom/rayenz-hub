// ==UserScript==
// @name         Stock Portfolio Helper <Rayenz>
// @namespace    neopets.stock
// @version      2026-07-21
// @description  Reorganizes the stock portfolio into buy/sell/other sections with quick buy and sell-all actions.
// @author       rayenz-akusiom
// @match        https://www.neopets.com/stockmarket.phtml?type=portfolio
// @match        http://www.neopets.com/stockmarket.phtml?type=portfolio
// @match        https://www.neopets.com/stockmarket.phtml?type=buy*
// @match        http://www.neopets.com/stockmarket.phtml?type=buy*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=neopets.com
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const BUY_PRICE = 15;
    const SELL_PRICE = 60;
    const BUY_AMOUNT = 1000;
    const DAILY_BUY_LIMIT = 1000;
    const DAILY_BUY_STORAGE = 'rayenz_stock_daily_buy';
    const BUY_SUBMITTED_STORAGE = 'rayenz_stock_buy_submitted';
    const HEADER_ROWS = 2;

    const SECTION_STYLE = 'background:#ccccff;font-weight:bold;text-align:left;padding:8px 12px;';
    const BTN_STYLE = 'margin-left:8px;padding:2px 8px;cursor:pointer;';
    const STRIPE_WHITE = '#FFFFFF';
    const STRIPE_BLUE = '#EEEEFF';

    if (location.search.includes('type=buy')) {
        initBuyPage();
        return;
    }

    initPortfolioPage();

    function initBuyPage() {
        const form = document.querySelector('form[action="process_stockmarket.phtml"]');
        if (!form || !form.amount_shares) {
            return;
        }

        const params = new URLSearchParams(location.search);
        const ticker = normalizeTicker(params.get('ticker'));
        if (ticker && form.ticker_symbol) {
            form.ticker_symbol.value = ticker;
        }
        form.amount_shares.value = String(BUY_AMOUNT);

        const pendingBuy = sessionStorage.getItem('rayenz_stock_buy');
        if (pendingBuy && form.ticker_symbol && form.ticker_symbol.value === pendingBuy) {
            sessionStorage.removeItem('rayenz_stock_buy');
            let previousQty;
            try {
                const meta = JSON.parse(sessionStorage.getItem('rayenz_stock_buy_meta') || '{}');
                previousQty = meta.previousQty;
            } catch (error) {
                // ignore malformed storage
            }
            sessionStorage.removeItem('rayenz_stock_buy_meta');
            sessionStorage.setItem(BUY_SUBMITTED_STORAGE, JSON.stringify({
                ticker: pendingBuy,
                amount: BUY_AMOUNT,
                nstDate: getNstDateKey(),
                previousQty,
            }));
            const submitBtn = form.querySelector('input[type="submit"]');
            if (submitBtn) {
                submitBtn.click();
            }
        }
    }

    function getNstDateKey() {
        const nst = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
        return `${nst.getFullYear()}-${nst.getMonth() + 1}-${nst.getDate()}`;
    }

    function loadDailyBuyRecord() {
        try {
            const record = JSON.parse(localStorage.getItem(DAILY_BUY_STORAGE) || '{}');
            if (record.nstDate === getNstDateKey()) {
                return { total: record.total || 0 };
            }
        } catch (error) {
            // ignore malformed storage
        }
        return { total: 0 };
    }

    function saveDailyBuyRecord(record) {
        localStorage.setItem(DAILY_BUY_STORAGE, JSON.stringify({
            nstDate: getNstDateKey(),
            total: record.total,
        }));
    }

    function recordDailyPurchase(amount) {
        const record = loadDailyBuyRecord();
        record.total = Math.min(DAILY_BUY_LIMIT, record.total + amount);
        saveDailyBuyRecord(record);
    }

    function getRemainingDailyBuyQuota() {
        return Math.max(0, DAILY_BUY_LIMIT - loadDailyBuyRecord().total);
    }

    function reconcileSubmittedBuy() {
        const submittedRaw = sessionStorage.getItem(BUY_SUBMITTED_STORAGE);
        if (!submittedRaw) {
            return;
        }

        sessionStorage.removeItem(BUY_SUBMITTED_STORAGE);
        let submitted;
        try {
            submitted = JSON.parse(submittedRaw);
        } catch (error) {
            return;
        }

        if (submitted.nstDate !== getNstDateKey()) {
            return;
        }

        const content = document.querySelector('.content') || document.body;
        if (/Error:\s*Sorry/i.test(content.textContent)) {
            return;
        }

        const form = document.getElementById('postForm');
        const table = form && form.querySelector('table');
        if (table && submitted.previousQty != null && submitted.ticker) {
            const group = collectStockGroups(table).find((g) => g.ticker === submitted.ticker);
            const amount = submitted.amount || BUY_AMOUNT;
            if (!group || group.qty < submitted.previousQty + amount) {
                return;
            }
        }

        recordDailyPurchase(submitted.amount || BUY_AMOUNT);
    }

    function canShowBuyButton() {
        return getRemainingDailyBuyQuota() >= BUY_AMOUNT;
    }

    function initPortfolioPage() {
        reconcileSubmittedBuy();

        const form = document.getElementById('postForm');
        const table = form && form.querySelector('table');
        if (!table) {
            return;
        }

        moveSellControls(table);
        const groups = collectStockGroups(table);
        if (!groups.length) {
            return;
        }

        reorderGroups(table, groups);
        addBuyButtons(groups.filter((g) => g.currentPrice === BUY_PRICE));
    }

    function moveSellControls(table) {
        const sellInput = document.getElementById('show_sell');
        const pinTable = getPinEntryTable();
        const anchor = table.parentNode;

        if (pinTable) {
            anchor.insertBefore(pinTable, table);
            pinTable.style.margin = '16px 0';
        }
        if (sellInput) {
            anchor.insertBefore(sellInput, table);
            sellInput.style.display = 'block';
            sellInput.style.margin = '16px 0';
        }
    }

    function getPinEntryTable() {
        const pinField = document.getElementById('pin_field');
        return pinField && pinField.closest('table');
    }

    function collectStockGroups(table) {
        const tbody = table.tBodies[0] || table;
        const rows = [...tbody.rows];
        const groups = [];

        for (let i = 0; i < rows.length - 1; i++) {
            const dataRow = rows[i];
            const expandRow = rows[i + 1];

            if (i < HEADER_ROWS) {
                continue;
            }
            if (dataRow.classList.contains('rayenz-stock-section-header')) {
                continue;
            }
            if (isFooterRow(dataRow)) {
                break;
            }
            if (!isStockDataRow(dataRow) || !isStockExpandRow(expandRow)) {
                continue;
            }

            groups.push(parseStockGroup(dataRow, expandRow));
            i++;
        }

        return groups;
    }

    function isStockDataRow(row) {
        return row.cells.length >= 7;
    }

    function isStockExpandRow(row) {
        return row.cells.length === 1 && !!row.querySelector('table');
    }

    function isFooterRow(row) {
        return /totals/i.test(row.textContent);
    }

    function normalizeTicker(raw) {
        if (!raw) {
            return '';
        }

        let text = String(raw).trim();
        const boldMatch = text.match(/^([A-Za-z]{2,5})\b/);
        if (boldMatch) {
            return boldMatch[1].toUpperCase();
        }

        text = text.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
        const token = text.split(/\s+/)[0] || '';
        const tickerMatch = token.match(/^([A-Za-z]{2,5})/);
        return tickerMatch ? tickerMatch[1].toUpperCase() : token.toUpperCase();
    }

    function extractTicker(cell) {
        const bold = cell.querySelector('b');
        return normalizeTicker(bold ? bold.textContent : cell.textContent);
    }

    function parseStockGroup(dataRow, expandRow) {
        const cells = dataRow.cells;
        const ticker = extractTicker(cells[1]);
        return {
            ticker,
            currentPrice: parseNumber(cells[3].textContent),
            qty: parseNumber(cells[5].textContent),
            mktValue: parseNumber(cells[7].textContent),
            dataRow,
            expandRow,
        };
    }

    function parseNumber(text) {
        return parseInt(String(text).replace(/[^\d-]/g, ''), 10) || 0;
    }

    function countRowColumns(row) {
        return [...row.cells].reduce((sum, cell) => sum + (cell.colSpan || 1), 0);
    }

    function getTableColspan(table, groups) {
        if (groups[0]) {
            const expandCell = groups[0].expandRow.cells[0];
            if (expandCell && expandCell.colSpan > 1) {
                return expandCell.colSpan;
            }
            return groups[0].dataRow.cells.length;
        }

        const tbody = table.tBodies[0] || table;
        const detailHeaderRow = tbody.rows[1];
        if (detailHeaderRow) {
            return countRowColumns(detailHeaderRow);
        }

        return 9;
    }

    function reorderGroups(table, groups) {
        const tbody = table.tBodies[0] || table;
        const allRows = [...tbody.rows];
        const headerRows = allRows.slice(0, HEADER_ROWS);
        const footerRows = allRows.filter((row) => isFooterRow(row));
        const colspan = getTableColspan(table, groups);

        const atBuyPrice = groups
            .filter((g) => g.currentPrice === BUY_PRICE)
            .sort((a, b) => a.qty - b.qty);
        const atSellPriceMulti = groups
            .filter((g) => g.currentPrice >= SELL_PRICE && g.qty > 1)
            .sort((a, b) => b.qty - a.qty);
        const atSellPriceSingle = groups
            .filter((g) => g.currentPrice >= SELL_PRICE && g.qty <= 1)
            .sort((a, b) => b.qty - a.qty);
        const rest = groups
            .filter((g) => g.currentPrice !== BUY_PRICE && g.currentPrice < SELL_PRICE)
            .sort((a, b) => b.mktValue - a.mktValue);

        const orderedSections = [
            { title: `Stocks at ${BUY_PRICE} NP (least owned first)`, items: atBuyPrice },
            {
                title: `Stocks at or above ${SELL_PRICE} NP with more than 1 share (most owned first)`,
                items: atSellPriceMulti,
                sellAll: true,
            },
            {
                title: `Stocks at or above ${SELL_PRICE} NP with 1 share`,
                items: atSellPriceSingle,
            },
            { title: 'Other stocks (highest market value first)', items: rest },
        ];

        while (tbody.firstChild) {
            tbody.removeChild(tbody.firstChild);
        }

        for (const row of headerRows) {
            tbody.appendChild(row);
        }

        for (const section of orderedSections) {
            if (!section.items.length) {
                continue;
            }
            tbody.appendChild(createSectionHeader(section.title, colspan, {
                table,
                sellAll: section.sellAll,
                sellAllEnabled: section.sellAll && canSellAllButOne(section.items),
            }));
            for (const group of section.items) {
                tbody.appendChild(group.dataRow);
                tbody.appendChild(group.expandRow);
            }
        }

        for (const row of footerRows) {
            tbody.appendChild(row);
        }

        applySectionStriping(table);
    }

    function setRowBgcolor(row, color) {
        for (const cell of row.cells) {
            cell.bgColor = color;
            cell.style.backgroundColor = color;
        }
    }

    function applySectionStriping(table) {
        const tbody = table.tBodies[0] || table;
        let stripeIndex = 0;

        for (let i = HEADER_ROWS; i < tbody.rows.length; i++) {
            const row = tbody.rows[i];

            if (row.classList.contains('rayenz-stock-section-header')) {
                stripeIndex = 0;
                continue;
            }

            if (isFooterRow(row)) {
                break;
            }

            if (!isStockDataRow(row)) {
                continue;
            }

            const color = stripeIndex % 2 === 0 ? STRIPE_WHITE : STRIPE_BLUE;
            setRowBgcolor(row, color);

            const expandRow = tbody.rows[i + 1];
            if (expandRow && isStockExpandRow(expandRow)) {
                setRowBgcolor(expandRow, color);
                i++;
            }

            stripeIndex++;
        }
    }

    function canSellAllButOne(groups) {
        return groups.some((g) => g.currentPrice >= SELL_PRICE && g.qty > 1);
    }

    function getSellAllGroups(table) {
        return collectStockGroups(table).filter(
            (g) => g.currentPrice >= SELL_PRICE && g.qty > 1
        );
    }

    function createSectionHeader(title, colspan, options = {}) {
        const row = document.createElement('tr');
        row.className = 'rayenz-stock-section-header';
        const cell = document.createElement('td');
        cell.colSpan = colspan || 9;
        cell.style.cssText = SECTION_STYLE;
        cell.textContent = title;

        if (options.sellAll && options.table) {
            const btn = document.createElement('button');
            btn.id = 'rayenz-stock-sell-all';
            btn.type = 'button';
            btn.textContent = 'Sell all but 1';
            btn.style.cssText = 'float:right;padding:2px 8px;font-weight:normal;';

            if (options.sellAllEnabled) {
                btn.style.cursor = 'pointer';
                btn.addEventListener('click', () => sellAllAboveSellPoint(options.table));
            } else {
                btn.disabled = true;
                btn.style.cursor = 'not-allowed';
                btn.style.opacity = '0.6';
                btn.title = `No stocks at ${SELL_PRICE} NP or above with more than 1 share to sell.`;
            }

            cell.appendChild(btn);
        }

        row.appendChild(cell);
        return row;
    }

    function addBuyButtons(groups) {
        if (!canShowBuyButton()) {
            return;
        }

        for (const group of groups) {
            const cell = group.dataRow.cells[1];
            if (cell.querySelector('.rayenz-stock-buy-btn')) {
                continue;
            }
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'rayenz-stock-buy-btn';
            btn.textContent = `Buy ${BUY_AMOUNT}`;
            btn.style.cssText = BTN_STYLE;
            btn.addEventListener('click', () => buyStock(group.ticker, group.qty, btn));
            cell.appendChild(btn);
        }
    }

    function buyStock(ticker, previousQty, btn) {
        const cost = BUY_PRICE * BUY_AMOUNT;
        if (!window.confirm(`Buy ${BUY_AMOUNT} shares of ${ticker} for ${cost.toLocaleString()} NP?`)) {
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Buying...';
        sessionStorage.setItem('rayenz_stock_buy', ticker);
        sessionStorage.setItem('rayenz_stock_buy_meta', JSON.stringify({ previousQty }));
        location.href = `https://www.neopets.com/stockmarket.phtml?type=buy&ticker=${encodeURIComponent(ticker)}`;
    }

    function sellAllAboveSellPoint(table) {
        const groups = getSellAllGroups(table);

        if (!groups.length) {
            window.alert(`No stocks at ${SELL_PRICE} NP or above with more than 1 share to sell.`);
            return;
        }

        let filled = 0;
        for (const group of groups) {
            openExpandRow(group.dataRow, group.expandRow);
            if (fillSellKeepingOne(group.expandRow, group.qty)) {
                filled += 1;
            }
        }

        const sellInput = document.getElementById('show_sell');
        if (sellInput) {
            sellInput.style.display = 'block';
        }

        window.alert(
            filled
                ? `Filled sell quantities for ${filled} stock(s). Enter your PIN and click Sell Shares.`
                : 'Could not fill sell quantities. Expand a stock row manually and try again.'
        );

        if (sellInput) {
            sellInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function openExpandRow(dataRow, expandRow) {
        if (expandRow.style.display !== 'none' && expandRow.offsetParent !== null) {
            return;
        }

        const disclosure = dataRow.querySelector('img[id$="disclosure"]');
        if (disclosure) {
            disclosure.click();
            return;
        }

        const onclick = dataRow.querySelector('[onclick*="disclose"]');
        if (onclick) {
            onclick.click();
            return;
        }

        expandRow.style.display = '';
    }

    function fillSellKeepingOne(expandRow, totalQty) {
        const nestedTable = expandRow.querySelector('table');
        if (!nestedTable) {
            return false;
        }

        let remaining = totalQty - 1;
        const batchRows = [...nestedTable.rows].slice(1);

        for (const row of batchRows) {
            const input = row.querySelector('input[type="text"], input:not([type="hidden"])');
            if (!input) {
                continue;
            }

            const batchQty = parseNumber(row.cells[0] && row.cells[0].textContent);
            const sellQty = Math.min(batchQty, remaining);
            input.value = sellQty > 0 ? String(sellQty) : '';
            remaining -= sellQty;
        }

        return remaining === 0;
    }
})();
