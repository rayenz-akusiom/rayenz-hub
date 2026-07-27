// ==UserScript==
// @name         Rayenz Dailies Page Augmentation
// @namespace    neopets.dailies
// @version      2026-07-27-2
// @description  Hub bridge (ItemDB + Neopets fetch), needed-item inventory badges, Stamp Album on-page Sync (no crawl), and eat/read/stamp-put acquisition hooks.
// @author       rayenz-akusiom
// @match        https://rayenz-akusiom.github.io/rayenz-akusiom/*
// @match        http://127.0.0.1/*
// @match        http://localhost/*
// @match        file:///*
// @match        *://www.neopets.com/inventory.phtml*
// @match        *://www.neopets.com/quickstock.phtml*
// @match        *://www.neopets.com/stamps.phtml*
// @match        *://www.neopets.com/objects.phtml*
// @match        *://www.neopets.com/process_halloween_foods.phtml*
// @match        *://www.neopets.com/gourmet_club.phtml*
// @match        *://www.neopets.com/books_read.phtml*
// @match        *://www.neopets.com/moon/books_read.phtml*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=neopets.com
// @grant        GM.xmlHttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @connect      neopets.com
// @connect      www.neopets.com
// @connect      pets.neopets.com
// @connect      itemdb.com.br
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    if (!document.body) {
        return;
    }

    const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const NEEDED_KEY = 'rayenz-needed-snapshot';
    const DELTAS_KEY = 'rayenz-acquisition-deltas';
    const STAMPS_LIST_ID = 'stamps-wishlist';
    const GOURMET_LIST_ID = 'gourmet-food';
    const BOOKS_LIST_ID = 'books-checklist';
    const BOOKTASTIC_LIST_ID = 'booktastic-checklist';

    function isHubOrigin() {
        const h = location.hostname;
        return (
            h === 'localhost' ||
            h === '127.0.0.1' ||
            /github\.io$/i.test(h) ||
            location.protocol === 'file:'
        );
    }

    function imageKeyFromUrl(url) {
        if (!url) return null;
        const cleaned = String(url).trim().split('?')[0].split('#')[0];
        const parts = cleaned.split('/');
        let file = parts[parts.length - 1] || '';
        if (!file) return null;
        file = file.toLowerCase().replace(/\.(gif|png|jpe?g|webp|svg)$/i, '');
        return file || null;
    }

    function normalizeName(name) {
        let s = String(name || '');
        try {
            s = s.normalize('NFKC');
        } catch (e) {
            /* ignore */
        }
        s = s
            .replace(/[\u2018\u2019\u201A\u2032']/g, '')
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        s = s.replace(/^the\s+/, '');
        return s;
    }

    function isItemImageSrc(src) {
        const s = String(src || '');
        if (/\/items?\//i.test(s)) return true;
        if (/neopets\.com\/.*\.(gif|png|jpe?g|webp)/i.test(s) && /item/i.test(s)) return true;
        return false;
    }

    function isTimesReadOnlyText(text) {
        return /^\(\d+\)$/.test(String(text || '').trim());
    }

    /** Split books_read "Title: blurb" (or title-only); reject "(496)" counters. */
    function parseBooksReadTitleBlurb(text) {
        const raw = String(text || '').replace(/\s+/g, ' ').trim();
        if (!raw || isTimesReadOnlyText(raw)) return null;
        if (/^(read|back|next|submit)$/i.test(raw)) return null;
        const colon = raw.indexOf(':');
        if (colon > 0) {
            const title = raw.slice(0, colon).trim();
            if (title && title.length >= 2 && title.length <= 120 && !isTimesReadOnlyText(title)) {
                return title;
            }
        }
        if (raw.length >= 2 && raw.length <= 120) return raw;
        return null;
    }

    function cellTextWithoutImages(el) {
        if (!el) return '';
        const clone = el.cloneNode(true);
        const cloneImgs = clone.querySelectorAll('img');
        for (let i = 0; i < cloneImgs.length; i++) {
            cloneImgs[i].remove();
        }
        return (clone.textContent || '').replace(/\s+/g, ' ').trim();
    }

    /** Pair item images with adjacent text (books / stamp-like pages). */
    function collectImgNamePairs() {
        const pairs = [];
        const imgs = document.querySelectorAll('img');
        imgs.forEach(function (img) {
            const src = img.getAttribute('src') || '';
            if (!isItemImageSrc(src)) return;
            let name = img.getAttribute('title') || img.getAttribute('alt') || '';
            const parent = img.parentElement;
            if (parent) {
                const text = cellTextWithoutImages(parent);
                let parsed = parseBooksReadTitleBlurb(text);
                // Two-cell books_read: image+(N) then Title: blurb in the next td
                if (!parsed && (isTimesReadOnlyText(text) || !text)) {
                    let sib = parent.nextElementSibling;
                    while (sib && sib.tagName !== 'TD') {
                        sib = sib.nextElementSibling;
                    }
                    if (sib && sib.tagName === 'TD') {
                        parsed = parseBooksReadTitleBlurb(cellTextWithoutImages(sib));
                    }
                }
                if (parsed) name = parsed;
            }
            pairs.push({ src: src, name: name || null });
        });
        return pairs;
    }

    function loadSnapshot() {
        try {
            const raw = GM_getValue(NEEDED_KEY, null);
            if (!raw) return null;
            return typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (e) {
            return null;
        }
    }

    function saveSnapshot(snapshot) {
        GM_setValue(NEEDED_KEY, JSON.stringify(snapshot || {}));
    }

    function loadDeltas() {
        try {
            const raw = GM_getValue(DELTAS_KEY, '[]');
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function saveDeltas(deltas) {
        GM_setValue(DELTAS_KEY, JSON.stringify(deltas || []));
    }

    function queueDelta(listId, itemIids, source) {
        if (!listId || !itemIids || !itemIids.length) return;
        const deltas = loadDeltas();
        deltas.push({
            listId: listId,
            itemIids: itemIids.slice(),
            source: source || 'action',
            at: Date.now(),
        });
        saveDeltas(deltas);
        // Drop from needed snapshot locally for immediate badge update
        const snap = loadSnapshot();
        if (snap && snap.byList && snap.byList[listId]) {
            const drop = new Set(itemIids);
            snap.byList[listId] = snap.byList[listId].filter(function (id) {
                return !drop.has(id);
            });
            if (Array.isArray(snap.catalogLite && snap.catalogLite[listId])) {
                const remaining = new Set(snap.byList[listId]);
                const byName = new Set();
                const byImage = new Set();
                snap.catalogLite[listId].forEach(function (row) {
                    if (!remaining.has(row.itemIid)) return;
                    if (row.name) byName.add(normalizeName(row.name));
                    if (row.imageKey) byImage.add(row.imageKey);
                });
                // Rebuild global needed indexes loosely
                snap.byName = Array.from(byName);
                snap.byImageKey = Array.from(byImage);
            }
            snap.updatedAt = Date.now();
            saveSnapshot(snap);
        }
    }

    function matchNameOrImageToList(listId, name, imageUrl) {
        const snap = loadSnapshot();
        if (!snap || !snap.catalogLite || !snap.catalogLite[listId]) return null;
        const nameKey = normalizeName(name);
        const imgKey = imageKeyFromUrl(imageUrl);
        const rows = snap.catalogLite[listId];
        let byName = null;
        let byImage = null;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (nameKey && normalizeName(row.name) === nameKey) {
                byName = row.itemIid;
            }
            if (imgKey && row.imageKey === imgKey) {
                byImage = row.itemIid;
            }
        }
        return byName != null ? byName : byImage;
    }

    function listsNeedingItem(name, imageUrl) {
        const snap = loadSnapshot();
        if (!snap) return [];
        const nameKey = normalizeName(name);
        const imgKey = imageKeyFromUrl(imageUrl);
        const lists = [];
        if (nameKey && snap.nameToLists && snap.nameToLists[nameKey]) {
            snap.nameToLists[nameKey].forEach(function (id) {
                if (lists.indexOf(id) === -1) lists.push(id);
            });
        }
        if (imgKey && snap.imageToLists && snap.imageToLists[imgKey]) {
            snap.imageToLists[imgKey].forEach(function (id) {
                if (lists.indexOf(id) === -1) lists.push(id);
            });
        }
        return lists;
    }

    // ——— Hub origin: fetch bridges + snapshot push/pull ———
    if (isHubOrigin()) {
        function wrapResponse(response, url) {
            return {
                text: response.responseText || '',
                status: response.status,
                url: response.finalUrl || response.responseURL || url,
            };
        }

        function neopetsHeaders(url, method) {
            const headers = {};
            if (/neopets\.com/i.test(url)) {
                headers.Referer =
                    method === 'POST' && /process_wishing/i.test(url)
                        ? 'https://www.neopets.com/wishing.phtml'
                        : 'https://www.neopets.com/';
            }
            return headers;
        }

        page.__neopetsFetch = function (url) {
            return new Promise(function (resolve, reject) {
                GM.xmlHttpRequest({
                    method: 'GET',
                    url: url,
                    headers: neopetsHeaders(url, 'GET'),
                    onload: function (response) {
                        if (response.status >= 400) {
                            reject(new Error('HTTP ' + response.status));
                            return;
                        }
                        resolve(wrapResponse(response, url));
                    },
                    onerror: function () {
                        reject(new Error('Network error'));
                    },
                });
            });
        };

        page.__neopetsPost = function (url, data) {
            return new Promise(function (resolve, reject) {
                GM.xmlHttpRequest({
                    method: 'POST',
                    url: url,
                    headers: Object.assign(
                        {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        neopetsHeaders(url, 'POST'),
                    ),
                    data: data,
                    onload: function (response) {
                        if (response.status >= 400) {
                            reject(new Error('HTTP ' + response.status));
                            return;
                        }
                        resolve(wrapResponse(response, url));
                    },
                    onerror: function () {
                        reject(new Error('Network error'));
                    },
                });
            });
        };

        page.__bridgeFetch = function (url, options) {
            options = options || {};
            const method = options.method || 'GET';
            const headers = options.headers || {};
            return new Promise(function (resolve, reject) {
                GM.xmlHttpRequest({
                    method: method,
                    url: url,
                    headers: headers,
                    data: options.body || undefined,
                    onload: function (response) {
                        const status = response.status;
                        const responseText = response.responseText || '';
                        resolve({
                            ok: status >= 200 && status < 300,
                            status: status,
                            responseText: responseText,
                            text: function () {
                                return Promise.resolve(responseText);
                            },
                            json: function () {
                                if (!responseText) {
                                    return Promise.reject(
                                        new Error('ItemDB empty response (' + status + ')'),
                                    );
                                }
                                try {
                                    return Promise.resolve(JSON.parse(responseText));
                                } catch (err) {
                                    var snippet = responseText.slice(0, 120);
                                    return Promise.reject(
                                        new Error('Invalid JSON (' + status + '): ' + snippet),
                                    );
                                }
                            },
                        });
                    },
                    onerror: function () {
                        reject(new Error('Network error'));
                    },
                });
            });
        };

        page.__pushNeededSnapshot = function (snapshot) {
            saveSnapshot(snapshot);
        };

        page.__pullAcquisitionDeltas = function () {
            const deltas = loadDeltas();
            saveDeltas([]);
            return deltas;
        };

        page.__dailiesNeededReady = true;
        document.dispatchEvent(new CustomEvent('neopets-dailies-ready'));
        return;
    }

    // ——— Neopets pages ———

    function injectBadgeStyles() {
        if (document.getElementById('rayenz-needed-style')) return;
        const style = document.createElement('style');
        style.id = 'rayenz-needed-style';
        style.textContent =
            '.rayenz-needed-badge{display:inline-block;margin-left:4px;padding:1px 5px;border-radius:3px;' +
            'background:#c45c26;color:#fff;font-size:10px;font-weight:700;vertical-align:middle;}' +
            '.rayenz-stamp-sync{margin:8px 0;padding:6px 10px;font-weight:700;cursor:pointer;}' +
            '.rayenz-stamp-sync-status{margin-left:8px;font-size:12px;}';
        document.head.appendChild(style);
    }

    function badgeInventory() {
        injectBadgeStyles();
        const snap = loadSnapshot();
        if (!snap) return;

        // Classic inventory item cells / modern inventory cards
        const nodes = document.querySelectorAll(
            '.item-name, .invItem, td, .inventory-item, [data-item-name]',
        );
        nodes.forEach(function (el) {
            if (el.querySelector && el.querySelector('.rayenz-needed-badge')) return;
            let name =
                el.getAttribute('data-item-name') ||
                (el.classList && el.classList.contains('item-name') ? el.textContent : null);
            if (!name) {
                const nameEl = el.querySelector && el.querySelector('.item-name, b, strong');
                name = nameEl ? nameEl.textContent : null;
            }
            const img = el.querySelector && el.querySelector('img');
            const imgUrl = img ? img.getAttribute('src') : null;
            const lists = listsNeedingItem(name, imgUrl);
            if (!lists.length) return;
            const badge = document.createElement('span');
            badge.className = 'rayenz-needed-badge';
            badge.title = 'Needed for: ' + lists.join(', ');
            badge.textContent = 'NEED';
            if (el.classList && el.classList.contains('item-name')) {
                el.appendChild(badge);
            } else if (img && img.parentNode) {
                img.parentNode.appendChild(badge);
            } else {
                el.appendChild(badge);
            }
        });
    }

    function syncStampPageCurrentDom() {
        const snap = loadSnapshot();
        if (!snap || !snap.catalogLite || !snap.catalogLite[STAMPS_LIST_ID]) {
            return { matched: 0, message: 'No stamp catalog yet — open Hub Dailies first.' };
        }
        const catalog = snap.catalogLite[STAMPS_LIST_ID];
        const byName = {};
        const byImage = {};
        catalog.forEach(function (row) {
            const nk = normalizeName(row.name);
            if (nk) byName[nk] = row.itemIid;
            const ik = row.imageKey || imageKeyFromUrl(row.imageKey);
            if (row.imageKey) byImage[row.imageKey] = row.itemIid;
            if (ik) byImage[ik] = row.itemIid;
        });

        const matched = new Set();
        collectImgNamePairs().forEach(function (pair) {
            const key = imageKeyFromUrl(pair.src);
            let iid = null;
            if (key && byImage[key] != null) iid = byImage[key];
            if (iid == null && pair.name) {
                const nk = normalizeName(pair.name);
                if (byName[nk] != null) iid = byName[nk];
            }
            if (iid != null) matched.add(iid);
        });

        const iids = Array.from(matched);
        if (iids.length) {
            queueDelta(STAMPS_LIST_ID, iids, 'stamp-sync');
        }
        return {
            matched: iids.length,
            message: 'Synced ' + iids.length + ' stamp(s) from this page (no crawl).',
        };
    }

    function installStampSyncButton() {
        if (!/stamps\.phtml/i.test(location.href)) return;
        injectBadgeStyles();
        if (document.getElementById('rayenz-stamp-sync')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'rayenz-stamp-sync';
        btn.className = 'rayenz-stamp-sync';
        btn.textContent = 'Sync owned stamps (this page)';
        const status = document.createElement('span');
        status.className = 'rayenz-stamp-sync-status';
        btn.addEventListener('click', function () {
            const result = syncStampPageCurrentDom();
            status.textContent = result.message;
        });
        const host = document.querySelector('#content, .contentModule, body');
        if (host) {
            const wrap = document.createElement('div');
            wrap.appendChild(btn);
            wrap.appendChild(status);
            host.insertBefore(wrap, host.firstChild);
        }
    }

    function detectActionAcquisitions() {
        const text = (document.body && document.body.innerText) || '';
        const lower = text.toLowerCase();

        // Feed / eat confirmations
        if (/you (have )?gave .* to |has (been )?fed|ate the |eats the /i.test(text)) {
            // Try to extract item name from common phrases
            const m =
                text.match(/gave\s+(.+?)\s+to\s+/i) ||
                text.match(/fed\s+.+?\s+the\s+(.+?)[\.\!]/i) ||
                text.match(/ate the\s+(.+?)[\.\!]/i);
            const name = m ? m[1] : null;
            const iid = matchNameOrImageToList(GOURMET_LIST_ID, name, null);
            if (iid != null) queueDelta(GOURMET_LIST_ID, [iid], 'action');
        }

        // Book read
        if (/has read |finished reading |now knows more about/i.test(lower)) {
            const m = text.match(/has read\s+(.+?)[\.\!]/i) || text.match(/finished reading\s+(.+?)[\.\!]/i);
            const name = m ? m[1] : null;
            let iid = matchNameOrImageToList(BOOKS_LIST_ID, name, null);
            if (iid != null) queueDelta(BOOKS_LIST_ID, [iid], 'action');
            iid = matchNameOrImageToList(BOOKTASTIC_LIST_ID, name, null);
            if (iid != null) queueDelta(BOOKTASTIC_LIST_ID, [iid], 'action');
        }

        // Stamp put into album
        if (/added to your stamp album|put .* into your stamp album|stamp album/i.test(lower) &&
            /added|put /i.test(lower)) {
            const m =
                text.match(/added\s+(.+?)\s+to your stamp album/i) ||
                text.match(/put\s+(.+?)\s+into your stamp album/i);
            const name = m ? m[1] : null;
            const iid = matchNameOrImageToList(STAMPS_LIST_ID, name, null);
            if (iid != null) queueDelta(STAMPS_LIST_ID, [iid], 'action');
        }
    }

    if (/inventory\.phtml|quickstock\.phtml/i.test(location.href)) {
        badgeInventory();
        // Re-run after delayed inventory render
        setTimeout(badgeInventory, 800);
    }

    if (/stamps\.phtml/i.test(location.href)) {
        installStampSyncButton();
    }

    if (/books_read\.phtml|gourmet_club\.phtml|moon\/books_read/i.test(location.href)) {
        // Optional on-page sync for single-page lists (parse current DOM only)
        injectBadgeStyles();
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rayenz-stamp-sync';
        btn.textContent = 'Sync this page to Hub tracking';
        btn.addEventListener('click', function () {
            const listId = /moon\/books_read/i.test(location.href)
                ? BOOKTASTIC_LIST_ID
                : /books_read/i.test(location.href)
                  ? BOOKS_LIST_ID
                  : GOURMET_LIST_ID;
            const snap = loadSnapshot();
            if (!snap || !snap.catalogLite || !snap.catalogLite[listId]) {
                btn.textContent = 'Open Hub Dailies first to load catalog';
                return;
            }
            const catalog = snap.catalogLite[listId];
            const byName = {};
            const byImage = {};
            catalog.forEach(function (row) {
                const nk = normalizeName(row.name);
                if (nk) byName[nk] = row.itemIid;
                if (row.imageKey) byImage[row.imageKey] = row.itemIid;
            });
            const matched = new Set();
            const preferImage = listId === GOURMET_LIST_ID || listId === BOOKTASTIC_LIST_ID;
            collectImgNamePairs().forEach(function (pair) {
                const key = imageKeyFromUrl(pair.src);
                const nk = normalizeName(pair.name);
                let iid = null;
                if (!preferImage && nk && byName[nk] != null) iid = byName[nk];
                if (iid == null && key && byImage[key] != null) iid = byImage[key];
                if (iid == null && preferImage && nk && byName[nk] != null) iid = byName[nk];
                if (iid != null) matched.add(iid);
            });
            const iids = Array.from(matched);
            if (iids.length) queueDelta(listId, iids, 'progress');
            btn.textContent = 'Synced ' + iids.length + ' item(s)';
        });
        const host = document.querySelector('#content, .contentModule, body');
        if (host) host.insertBefore(btn, host.firstChild);
    }

    detectActionAcquisitions();
})();
