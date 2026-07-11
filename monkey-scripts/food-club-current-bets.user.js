// ==UserScript==
// @name         Food Club Current Bets <Rayenz>
// @namespace    neopets.foodclub
// @version      2026-07-11-3
// @description  X/10 bet status row, total spent summary, and winnings-sorted rows on Food Club current bets page.
// @author       rayenz-akusiom
// @match        *://*.neopets.com/pirates/foodclub.phtml?*type=current_bets*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=neopets.com
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const MAX_BETS = 10;
    const STATUS_ID = 'rayenz-fc-status';
    const PLACE_BETS_URL = 'https://www.neopets.com/pirates/foodclub.phtml?type=bet';
    const ARENA_MARKERS = ['Shipwreck', 'Lagoon', 'Treasure', 'Hidden', 'Harpoon'];

    GM_addStyle(`
        #${STATUS_ID} {
            box-sizing: border-box;
            width: 100%;
            max-width: 600px;
            margin: 0 auto 12px;
            padding: 10px 14px;
            border: 2px solid #ccc;
            border-radius: 6px;
            font-size: 14px;
            font-weight: bold;
            text-align: center;
        }
        #${STATUS_ID}.rayenz-fc-status--complete {
            background: #e8f5e9;
            border-color: #4caf50;
            color: #1b5e20;
        }
        #${STATUS_ID}.rayenz-fc-status--partial {
            background: #fff8e1;
            border-color: #ffb300;
            color: #e65100;
        }
        #${STATUS_ID}.rayenz-fc-status--empty {
            background: #ffebee;
            border-color: #e57373;
            color: #b71c1c;
        }
        #${STATUS_ID} a {
            color: inherit;
            text-decoration: underline;
        }
        tr.rayenz-fc-status-row td {
            text-align: center;
            font-weight: bold;
            padding: 6px 8px;
        }
        tr.rayenz-fc-status-row .rayenz-fc-status-icon {
            display: inline-block;
            margin-right: 6px;
            font-size: 16px;
            line-height: 1;
        }
        tr.rayenz-fc-status-row.rayenz-fc-status--complete td {
            background: #e8f5e9;
            color: #1b5e20;
        }
        tr.rayenz-fc-status-row.rayenz-fc-status--complete .rayenz-fc-status-icon {
            color: #2e7d32;
        }
        tr.rayenz-fc-status-row.rayenz-fc-status--partial td {
            background: #fff8e1;
            color: #e65100;
        }
        tr.rayenz-fc-status-row.rayenz-fc-status--partial .rayenz-fc-status-icon {
            color: #f57c00;
        }
        tr.rayenz-fc-status-row.rayenz-fc-status--empty td {
            background: #ffebee;
            color: #b71c1c;
        }
        tr.rayenz-fc-status-row.rayenz-fc-status--empty .rayenz-fc-status-icon {
            color: #c62828;
        }
        tr.rayenz-fc-status-row a {
            color: inherit;
            text-decoration: underline;
        }
    `);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    }
    else {
        main();
    }

    function main() {
        const parsed = parseCurrentBets(document);
        if (!parsed.recognized) {
            console.info('[Food Club Current Bets] Page structure not recognized; skipping enhancement.');
            return;
        }

        const count = parsed.bets.length;
        const table = parsed.table;

        if (table) {
            removeExternalStatusBanner();
            stripPayoffSpans(table);
            renderStatusRow(count, table);
            insertTotalSpentRow(parsed.bets, table);
            reorderBetRows(parsed.bets);
            formatNpNumbersInTable(table);
        }
        else {
            renderStatusBanner(count);
        }
    }

    function parseCurrentBets(doc) {
        const legacy = parseLegacyCurrentBets(doc);
        if (legacy.bets.length > 0 || legacy.recognized) {
            return legacy;
        }
        return parseModernCurrentBets(doc);
    }

    function findCurrentBetsTable(doc) {
        // Anchor on the "Current Bets" title cell and take its closest table so we
        // get the innermost bets table, not an outer Neopets layout table that
        // merely contains it (which would place injected rows in the page body).
        const cells = doc.querySelectorAll('td, th');
        for (const cell of cells) {
            if (/^\s*current bets\s*$/i.test(cell.textContent || '')) {
                const table = cell.closest('table');
                if (table) {
                    return table;
                }
            }
        }

        // Fallback: pick the innermost table whose text mentions Current Bets.
        const matches = [...doc.querySelectorAll('table')].filter(t => /current bets/i.test(t.textContent || ''));
        return matches.length ? matches[matches.length - 1] : null;
    }

    function parseLegacyCurrentBets(doc) {
        const table = findCurrentBetsTable(doc);
        if (!table) {
            return { recognized: false, round: null, bets: [], table: null };
        }

        const rows = [...table.querySelectorAll('tr[bgcolor="white"], tr[bgcolor="#ffffff"], tr[bgcolor="#FFFFFF"]')];
        if (rows.length === 0) {
            return { recognized: true, round: null, bets: [], table };
        }

        let round = null;
        const bets = [];

        rows.forEach((row, index) => {
            const cells = [...row.children].filter(el => el.tagName === 'TD' || el.tagName === 'TH');
            if (cells.length < 2) {
                return;
            }

            const rowText = row.textContent || '';
            if (/total possible winnings/i.test(rowText) || /total spent/i.test(rowText)) {
                return;
            }

            const piratesCell = cells[1];
            const piratesHtml = piratesCell ? piratesCell.innerHTML : '';

            if (!looksLikeBetRow(piratesHtml, rowText)) {
                return;
            }

            if (round == null) {
                const firstText = (cells[0].textContent || '').trim().replace(/,/g, '');
                if (/^\d+$/.test(firstText)) {
                    round = firstText;
                }
            }

            const oddsText = findOddsTextInCells(cells) || findOddsTextInString(rowText);
            const oddsMultiplier = parseOddsMultiplier(oddsText);
            const betAmountNp = findBetAmountInCells(cells) || findBetAmountInString(rowText);
            const winningsNp = cells.length >= 5 ? parseNpAmount(cells[4].textContent) : 0;

            bets.push({
                index: bets.length + 1,
                rowEl: row,
                tbodyEl: row.parentElement,
                piratesHtml,
                oddsText: oddsText || '',
                oddsMultiplier,
                betAmountNp,
                winningsNp,
                payoff: winningsNp > 0 ? winningsNp : betAmountNp * oddsMultiplier,
            });
        });

        return { recognized: true, round, bets: bets.slice(0, MAX_BETS), table };
    }

    function parseModernCurrentBets(doc) {
        const content = doc.querySelector('#content') || doc.querySelector('.content');
        if (!content) {
            return { recognized: false, round: null, bets: [], table: null };
        }

        const candidateRows = [...content.querySelectorAll('tr')].filter(row => {
            const text = row.textContent || '';
            return ARENA_MARKERS.some(marker => text.includes(marker)) && /\d+\s*:\s*1/.test(text);
        });

        if (candidateRows.length === 0) {
            const emptyMsg = /no bets|have not placed|haven't placed/i.test(content.textContent || '');
            return {
                recognized: emptyMsg || /current bets/i.test(content.textContent || ''),
                round: null,
                bets: [],
                table: null,
            };
        }

        const tbody = candidateRows[0].parentElement;
        const table = tbody ? tbody.closest('table') : null;
        const bets = [];

        candidateRows.slice(0, MAX_BETS).forEach((row, index) => {
            const cells = [...row.children].filter(el => el.tagName === 'TD' || el.tagName === 'TH');
            const rowText = row.textContent || '';
            const piratesHtml = cells.length > 1 ? cells[1].innerHTML : row.innerHTML;
            const oddsText = findOddsTextInCells(cells) || findOddsTextInString(rowText);
            const oddsMultiplier = parseOddsMultiplier(oddsText);
            const betAmountNp = findBetAmountInCells(cells) || findBetAmountInString(rowText);
            const winningsNp = cells.length >= 5 ? parseNpAmount(cells[4].textContent) : 0;

            bets.push({
                index: index + 1,
                rowEl: row,
                tbodyEl: tbody,
                piratesHtml,
                oddsText: oddsText || '',
                oddsMultiplier,
                betAmountNp,
                winningsNp,
                payoff: winningsNp > 0 ? winningsNp : betAmountNp * oddsMultiplier,
            });
        });

        let round = null;
        const roundMatch = (content.textContent || '').match(/round\s*#?\s*(\d+)/i);
        if (roundMatch) {
            round = roundMatch[1];
        }

        return { recognized: true, round, bets, table };
    }

    function looksLikeBetRow(piratesHtml, rowText) {
        if (!piratesHtml && !rowText) {
            return false;
        }
        const combined = piratesHtml + rowText;
        return ARENA_MARKERS.some(marker => combined.includes(marker));
    }

    function findOddsTextInCells(cells) {
        for (let i = cells.length - 1; i >= 0; i--) {
            const text = (cells[i].textContent || '').trim();
            if (/^\d+\s*:\s*1$/.test(text)) {
                return text;
            }
        }
        for (const cell of cells) {
            const match = (cell.textContent || '').match(/(\d+)\s*:\s*1/);
            if (match) {
                return match[0].trim();
            }
        }
        return '';
    }

    function findOddsTextInString(text) {
        const matches = String(text || '').match(/\d+\s*:\s*1/g);
        if (!matches || matches.length === 0) {
            return '';
        }
        return matches[matches.length - 1].replace(/\s+/g, ' ').trim();
    }

    function parseOddsMultiplier(oddsText) {
        const match = String(oddsText || '').match(/(\d+)\s*:\s*1/);
        if (!match) {
            return 1;
        }
        const value = parseInt(match[1], 10);
        return isNaN(value) || value < 1 ? 1 : value;
    }

    function findBetAmountInCells(cells) {
        if (cells.length >= 4) {
            const legacyAmount = parseNpAmount(cells[2].textContent);
            if (legacyAmount > 0) {
                return legacyAmount;
            }
        }

        for (const cell of cells) {
            const text = cell.textContent || '';
            if (/^\d+\s*:\s*1$/.test(text.trim())) {
                continue;
            }
            const amount = parseNpAmount(text);
            if (amount > 0) {
                return amount;
            }
        }
        return 0;
    }

    function findBetAmountInString(text) {
        return parseNpAmount(text);
    }

    function parseNpAmount(text) {
        const raw = String(text || '');
        const npMatch = raw.replace(/,/g, '').match(/(\d+)\s*NP/i);
        if (npMatch) {
            return parseInt(npMatch[1], 10) || 0;
        }

        const numbers = raw.replace(/,/g, '').match(/\b(\d{2,7})\b/g);
        if (!numbers) {
            return 0;
        }

        const oddsNumbers = new Set();
        for (const odds of raw.match(/\d+\s*:\s*1/g) || []) {
            const m = odds.match(/(\d+)/);
            if (m) {
                oddsNumbers.add(parseInt(m[1], 10));
            }
        }

        const candidates = numbers
            .map(n => parseInt(n, 10))
            .filter(n => !oddsNumbers.has(n) && n >= 50);

        if (candidates.length === 0) {
            return 0;
        }

        return Math.max(...candidates);
    }

    function formatNp(value) {
        if (!value || isNaN(value)) {
            return '0 NP';
        }
        return Number(value).toLocaleString('en-US') + ' NP';
    }

    function getStatusState(count) {
        if (count >= MAX_BETS) {
            return 'complete';
        }
        if (count > 0) {
            return 'partial';
        }
        return 'empty';
    }

    function getStatusContent(count) {
        if (count >= MAX_BETS) {
            return {
                icon: '✓',
                message: MAX_BETS + '/' + MAX_BETS + ' bets placed',
            };
        }
        if (count > 0) {
            const missing = MAX_BETS - count;
            return {
                icon: '⚠',
                message: count + '/' + MAX_BETS + ' bets placed — ' + missing + ' missing',
            };
        }
        return {
            icon: '✗',
            message: '0/' + MAX_BETS + ' bets placed — '
                + '<a href="' + PLACE_BETS_URL + '">Place bets</a>',
        };
    }

    function renderStatusRow(count, table) {
        const state = getStatusState(count);
        const content = getStatusContent(count);
        let row = table.querySelector('tr.rayenz-fc-status-row');

        if (!row) {
            row = document.createElement('tr');
            row.className = 'rayenz-fc-status-row';
            row.setAttribute('bgcolor', 'white');

            const cell = document.createElement('td');
            cell.setAttribute('colspan', '5');
            cell.setAttribute('align', 'center');
            row.appendChild(cell);

            const titleRow = table.querySelector('tr[bgcolor="darkred"]') || table.querySelector('tr');
            if (titleRow && titleRow.parentElement) {
                titleRow.insertAdjacentElement('afterend', row);
            }
            else {
                table.querySelector('tbody')?.prepend(row);
            }
        }

        row.className = 'rayenz-fc-status-row rayenz-fc-status--' + state;
        const cell = row.querySelector('td');
        if (cell) {
            cell.innerHTML = '<span class="rayenz-fc-status-icon">' + content.icon + '</span>' + content.message;
        }
    }

    function renderStatusBanner(count) {
        let banner = document.getElementById(STATUS_ID);
        if (!banner) {
            banner = document.createElement('div');
            banner.id = STATUS_ID;
            const anchor = document.querySelector('#content') || document.querySelector('.content') || document.body;
            anchor.insertBefore(banner, anchor.firstChild);
        }

        const state = getStatusState(count);
        const content = getStatusContent(count);
        banner.className = 'rayenz-fc-status--' + state;
        banner.innerHTML = '<span class="rayenz-fc-status-icon">' + content.icon + '</span>' + content.message;
    }

    function removeExternalStatusBanner() {
        const banner = document.getElementById(STATUS_ID);
        if (banner) {
            banner.remove();
        }
    }

    function stripPayoffSpans(root) {
        root.querySelectorAll('.rayenz-fc-payoff').forEach(el => el.remove());
    }

    function insertTotalSpentRow(bets, table) {
        if (!bets || bets.length === 0) {
            return;
        }

        if (table.querySelector('tr.rayenz-fc-total-spent')) {
            return;
        }

        const totalSpent = bets.reduce((sum, bet) => sum + (bet.betAmountNp || 0), 0);
        const summaryRow = [...table.querySelectorAll('tr')].find(row => {
            // Skip layout rows that only contain the text via a nested table.
            if (row.querySelector('table')) {
                return false;
            }
            return /total possible winnings/i.test(row.textContent || '');
        });

        if (!summaryRow) {
            return;
        }

        const spentRow = document.createElement('tr');
        spentRow.className = 'rayenz-fc-total-spent';
        spentRow.setAttribute('bgcolor', 'white');
        spentRow.innerHTML =
            '<td colspan="4" align="right"><b>Total Spent</b></td>'
            + '<td align="center"><b>' + formatNp(totalSpent) + '</b></td>';

        summaryRow.insertAdjacentElement('beforebegin', spentRow);
    }

    function reorderBetRows(bets) {
        if (!bets || bets.length === 0) {
            return;
        }

        const tbody = bets[0].tbodyEl;
        if (!tbody || tbody.tagName !== 'TBODY') {
            return;
        }

        bets.forEach(bet => {
            if (bet.rowEl) {
                stripPayoffSpans(bet.rowEl);
            }
        });

        const sorted = [...bets].sort((a, b) => {
            if (b.payoff !== a.payoff) {
                return b.payoff - a.payoff;
            }
            if (b.oddsMultiplier !== a.oddsMultiplier) {
                return b.oddsMultiplier - a.oddsMultiplier;
            }
            return a.index - b.index;
        });

        sorted.forEach(bet => {
            if (bet.rowEl && bet.rowEl.parentElement === tbody) {
                tbody.appendChild(bet.rowEl);
            }
        });
    }

    function formatNpNumbersInTable(table) {
        table.querySelectorAll('td').forEach(td => {
            td.innerHTML = td.innerHTML.replace(/(\d[\d,]*)(\s*NP)/gi, function (all, num, suffix) {
                const value = Number(String(num).replace(/,/g, ''));
                if (isNaN(value)) {
                    return all;
                }
                return value.toLocaleString('en-US') + suffix;
            });
        });
    }
})();
