// ==UserScript==
// @name         Rayenz Dailies Page Augmentation
// @namespace    neopets.dailies
// @version      2026-07-04-2
// @description  Augments Rayenz's custom Neopets dailies page with cross-origin Neopets GET/POST and ItemDB wishlist API access via session cookies. For local dev, serve rayenz-akusiom over http://localhost (file:// is blocked by the browser).
// @author       rayenz-akusiom
// @match        https://rayenz-akusiom.github.io/rayenz-akusiom/*
// @match        http://127.0.0.1/*
// @match        http://localhost/*
// @match        file:///*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=neopets.com
// @grant        GM.xmlHttpRequest
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
            headers.Referer = method === 'POST' && /process_wishing/i.test(url)
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
                headers: Object.assign({
                    'Content-Type': 'application/x-www-form-urlencoded',
                }, neopetsHeaders(url, 'POST')),
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
                                return Promise.reject(new Error('ItemDB empty response (' + status + ')'));
                            }
                            try {
                                return Promise.resolve(JSON.parse(responseText));
                            } catch (err) {
                                var snippet = responseText.slice(0, 120);
                                return Promise.reject(new Error('Invalid JSON (' + status + '): ' + snippet));
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

    document.dispatchEvent(new CustomEvent('neopets-dailies-ready'));
})();
