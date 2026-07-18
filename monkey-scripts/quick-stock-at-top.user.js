// ==UserScript==
// @name         Quick Stock At Top <Rayenz>
// @namespace    neopets.quickstock
// @version      2026-07-18
// @description  Quick Stock toolbar at the top (submit, check-all) plus default-action sorting for common items.
// @author       rayenz-akusiom
// @match        https://www.neopets.com/quickstock.phtml*
// @match        http://www.neopets.com/quickstock.phtml*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=neopets.com
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /** Map sets to keep in inventory for turn-in (not auto-deposit). */
    const SDB_EXCLUDED_MAP_PREFIXES = [
        'Secret Laboratory Map ',
        'Petpet Laboratory Map ',
        'Forgotten Shore Map',
    ];

    /**
     * Items matching these rules get "Deposit" selected; everything else gets "Stock".
     * Extend nameIncludes, namePatterns, or exactNames as your routine changes.
     */
    const DEFAULT_SDB_RULES = {
        nameIncludes: [
            'Codestone',
            'Dubloon',
            'Paint Brush',
            'Business Card',
        ],
        namePatterns: [
            /\b(Strength|Defence|Defense|Endurance|Level(?:\s|-)?Up|Hit Points)\b.*\b(Potion|Elixir|Serum|Negg|Drink|Smoothie|Soda|Juice|Shake|Slushie|Cocktail|Tea|Coffee|Chocolate|Cookie|Candy|Bar|Soup|Tonic|Flask|Vial|Beverage|Milkshake|Fizz|Pop|Cola|Muffin|Cake|Grog|Brew|Draught|Mixture|Concoction|Remedy|Medicine|Tablet|Capsule|Powder|Nectar|Ambrosia|Punch|Gummy|Lolly|Marshmallow|Truffle|Bonbon|Ice Cream)/i,
            /\b(Potion|Elixir|Serum|Negg|Drink|Smoothie|Soda|Juice|Shake|Slushie|Cocktail|Tea|Coffee|Chocolate|Cookie|Candy|Bar|Soup|Tonic|Flask|Vial|Beverage|Milkshake|Fizz|Pop|Cola|Muffin|Cake|Grog|Brew|Draught|Mixture|Concoction|Remedy|Medicine|Tablet|Capsule|Powder|Nectar|Ambrosia|Punch|Gummy|Lolly|Marshmallow|Truffle|Bonbon|Ice Cream)\b.*\b(Strength|Defence|Defense|Endurance|Level(?:\s|-)?Up|Hit Points)\b/i,
        ],
        exactNames: [
            'Potion of Void Speed',
            'Therapeutic Swamp Water',
        ],
    };

    const QUICKSTOCK_ACTIONS = [
        'stock',
        'deposit',
        'donate',
        'discard',
        'gallery',
        'closet',
        'storage_shed',
        'chamber',
    ];

    const CHECKALL_TOP_CLASS = 'rayenz-qs-checkall-top';
    const SUBMIT_TOP_ID = 'rayenz-qs-submit-top';
    const DEFAULT_BTN_ID = 'rayenz-qs-default-btn';

    GM_addStyle(`
        #${SUBMIT_TOP_ID} {
            display: flex;
            flex-direction: row;
            justify-content: center;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            width: 100%;
        }
        #${DEFAULT_BTN_ID} {
            color: inherit;
            cursor: pointer;
            font-weight: inherit;
            text-decoration: underline;
        }
        #${DEFAULT_BTN_ID}:hover {
            opacity: 0.85;
        }
        #${DEFAULT_BTN_ID}.applied {
            font-weight: bold;
            text-decoration: none;
        }
    `);

    observeQuickstock();

    function observeQuickstock() {
        const observer = new MutationObserver(() => tryEnhance());
        observer.observe(document.documentElement, { childList: true, subtree: true });
        tryEnhance();
    }

    function tryEnhance() {
        const form = document.forms.quickstock;
        if (!form) {
            return;
        }

        injectTopSubmitRow(form);
        injectDefaultActionsHeader(form);
        injectTopCheckAllRow(form);
    }

    function injectTopSubmitRow(form) {
        if (document.getElementById(SUBMIT_TOP_ID)) {
            return;
        }

        const original = document.getElementById('quickstock-submit-row');
        if (!original) {
            return;
        }

        const topRow = original.cloneNode(true);
        topRow.id = SUBMIT_TOP_ID;

        const originalSubmit = original.querySelector('button[type="submit"]');
        const originalClear = original.querySelector('button[type="button"]');
        const topSubmit = topRow.querySelector('button[type="submit"]');
        const topClear = topRow.querySelector('button[type="button"]');

        if (topSubmit && originalSubmit) {
            topSubmit.type = 'button';
            topSubmit.addEventListener('click', () => originalSubmit.click());
        }

        if (topClear && originalClear) {
            topClear.addEventListener('click', () => originalClear.click());
        }

        const anchor = document.getElementById('quickstock-table-container')
            || form.querySelector('.quickstock-table')
            || form.querySelector('table');

        if (anchor?.parentNode) {
            anchor.parentNode.insertBefore(topRow, anchor);
        }
    }

    function injectDefaultActionsHeader(form) {
        if (form.querySelector(`#${DEFAULT_BTN_ID}`)) {
            return;
        }

        const headerCells = form.querySelectorAll('thead th, thead td');
        const nameHeader = [...headerCells].find((cell) => /object name/i.test(cell.textContent.trim()));
        if (!nameHeader) {
            return;
        }

        nameHeader.textContent = '';

        const link = document.createElement('a');
        link.id = DEFAULT_BTN_ID;
        link.href = '#';
        link.textContent = 'Default Actions';
        link.title = 'Deposit codestones, dubloons, paint brushes, business cards, stat boosters, and map pieces (except lab / petpet lab / Forgotten Shore); stock everything else';
        link.addEventListener('click', (event) => {
            event.preventDefault();
            applyDefaultActions(form, link);
        });

        nameHeader.appendChild(link);
    }

    function injectTopCheckAllRow(form) {
        const tbody = form.querySelector('.quickstock-table tbody')
            || form.querySelector('table tbody');
        if (!tbody || tbody.querySelector(`.${CHECKALL_TOP_CLASS}`)) {
            return;
        }

        tbody.insertBefore(createCheckAllRow(form), tbody.firstChild);
    }

    function createCheckAllCell(contents) {
        const cell = document.createElement('td');
        cell.className = 'py-3 px-4 text-left';

        const span = document.createElement('span');
        if (typeof contents === 'string') {
            span.innerHTML = contents;
        }
        else {
            span.appendChild(contents);
        }

        cell.appendChild(span);
        return cell;
    }

    function createCheckAllRow(form) {
        const row = document.createElement('tr');
        row.className = `np-table-row np-table-row-even ${CHECKALL_TOP_CLASS}`;

        row.appendChild(createCheckAllCell('<strong>Check All</strong>'));

        for (const action of QUICKSTOCK_ACTIONS) {
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'checkall-top';
            radio.addEventListener('click', function () {
                checkAllItems(form, action);
                this.checked = true;
            });

            row.appendChild(createCheckAllCell(radio));
        }

        return row;
    }

    function checkAllItems(form, action) {
        if (typeof window.__quickstockCheckAll === 'function') {
            window.__quickstockCheckAll(action);
            return;
        }

        selectAllByAction(form, action);
    }

    function getItemRows(form) {
        return [...form.querySelectorAll('.np-table-row')].filter((row) => {
            if (row.classList.contains(CHECKALL_TOP_CLASS)) {
                return false;
            }

            const label = row.querySelector('td')?.textContent.trim() || '';
            if (!label || /^check all$/i.test(label)) {
                return false;
            }

            return !!row.querySelector("input[type='radio'][value='stock']");
        });
    }

    function getRowItemName(row) {
        const cell = row.querySelector('td');
        if (!cell) {
            return '';
        }

        const nameNode = cell.querySelector('[data-itemname]')
            || [...cell.querySelectorAll('span, b, a, strong')].find((el) => {
                const text = el.textContent.trim();
                return text && !/^Rarity:/i.test(text) && !/^check all$/i.test(text) && text.length < 120;
            });

        if (nameNode) {
            return (nameNode.dataset.itemname || nameNode.textContent).trim();
        }

        return cell.textContent
            .replace(/\s*Rarity:\s*\d+\s*/gi, ' ')
            .trim()
            .split('\n')[0]
            .trim();
    }

    function isExcludedMapPiece(itemName) {
        return SDB_EXCLUDED_MAP_PREFIXES.some(function (prefix) {
            return itemName.startsWith(prefix);
        });
    }

    function isTreasureMapPiece(itemName) {
        if (isExcludedMapPiece(itemName)) {
            return false;
        }
        if (itemName === 'Piece of a treasure map') {
            return true;
        }
        if (/Map Piece/i.test(itemName)) {
            return true;
        }
        if (/\bMap [1-9]$/.test(itemName)) {
            return true;
        }
        return false;
    }

    function shouldGoToSdb(itemName) {
        if (isTreasureMapPiece(itemName)) {
            return true;
        }

        for (const fragment of DEFAULT_SDB_RULES.nameIncludes) {
            if (itemName.includes(fragment)) {
                return true;
            }
        }

        for (const pattern of DEFAULT_SDB_RULES.namePatterns) {
            if (pattern.test(itemName)) {
                return true;
            }
        }

        return DEFAULT_SDB_RULES.exactNames.includes(itemName);
    }

    function getDefaultAction(itemName) {
        return shouldGoToSdb(itemName) ? 'deposit' : 'stock';
    }

    function selectRadioForRow(row, action) {
        const radio = row.querySelector(`input[type="radio"][value="${action}"]`);
        if (radio) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function selectAllByAction(form, action) {
        for (const row of getItemRows(form)) {
            selectRadioForRow(row, action);
        }
    }

    function applyDefaultActions(form, button) {
        let sdbCount = 0;
        let stockCount = 0;

        for (const row of getItemRows(form)) {
            const action = getDefaultAction(getRowItemName(row));
            selectRadioForRow(row, action);
            if (action === 'deposit') {
                sdbCount += 1;
            }
            else {
                stockCount += 1;
            }
        }

        const original = 'Default Actions';
        button.textContent = `Applied (${sdbCount} SDB, ${stockCount} shop)`;
        button.classList.add('applied');
        window.setTimeout(() => {
            button.textContent = original;
            button.classList.remove('applied');
        }, 2500);
    }
})();
