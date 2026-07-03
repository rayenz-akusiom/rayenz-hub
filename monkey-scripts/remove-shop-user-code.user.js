// ==UserScript==
// @name         Remove Shop User Code <Rayenz>
// @namespace    neopets.shops
// @version      2026-07-02-2
// @description  Remove user-injected HTML/CSS from browseshop pages (backgrounds, widgets, custom layouts).
// @author       rayenz-akusiom
// @match        https://www.neopets.com/browseshop.phtml*
// @match        http://www.neopets.com/browseshop.phtml*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=neopets.com
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const BG_RESET_ID = 'rayenz-bsp-bg-reset';

    injectBackgroundReset();
    observeBrowseShop();

    function injectBackgroundReset() {
        if (document.getElementById(BG_RESET_ID)) {
            return;
        }

        const reset = document.createElement('style');
        reset.id = BG_RESET_ID;
        reset.textContent =
            'body{background:unset!important;background-image:none!important;}';
        (document.head || document.documentElement).appendChild(reset);
    }

    function observeBrowseShop() {
        const observer = new MutationObserver(() => {
            if (tryRemoveUserCode()) {
                observer.disconnect();
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        if (tryRemoveUserCode()) {
            observer.disconnect();
        }
    }

    function tryRemoveUserCode() {
        const desc = document.querySelector('.bsp-description-inline');
        if (!desc) {
            return false;
        }

        desc.remove();
        document.getElementById(BG_RESET_ID)?.remove();
        return true;
    }
})();
