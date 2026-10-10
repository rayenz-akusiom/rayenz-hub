// ==UserScript==
// @name         Face to Face Deck Builder Add to Cart Fix <Rayenz>
// @namespace    rayenz.facetofacegames.deck-builder
// @version      2026-09-30-3
// @description  Sets a deck builder result quantity to 1 when Add to Cart is clicked at 0.
// @author       rayenz-akusiom
// @match        *://*.facetofacegames.com/pages/deck-builder*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    const ADD_TO_CART_LABEL = /\badd\s+to\s+cart\b/i;
    const QUANTITY_INPUT_SELECTOR = [
        'input.quantity__input',
        'input[name*="quantity" i]',
        'input[type="number"]',
    ].join(', ');

    function getQuantityInput(button) {
        for (let container = button.parentElement; container; container = container.parentElement) {
            const quantityInput = container.querySelector(QUANTITY_INPUT_SELECTOR);
            if (quantityInput) {
                return quantityInput;
            }
        }

        return null;
    }

    function getIncrementButton(quantityInput) {
        const quantityControl = quantityInput.closest('quantity-input') || quantityInput.parentElement;
        if (!quantityControl) {
            return null;
        }

        const buttons = [...quantityControl.querySelectorAll('button')];
        return buttons.find((button) => {
            const label = `${button.name} ${button.getAttribute('aria-label') || ''} ${button.title}`;
            return /\b(plus|increase|increment)\b/i.test(label);
        }) || buttons.at(-1) || null;
    }

    document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        const button = target.closest('button, input[type="button"], input[type="submit"]');
        if (!button) {
            return;
        }

        const label = button instanceof HTMLInputElement
            ? button.value
            : button.innerText || button.getAttribute('aria-label') || button.title;
        if (!ADD_TO_CART_LABEL.test(label || '')) {
            return;
        }

        const quantityInput = getQuantityInput(button);
        if (!quantityInput || Number(quantityInput.value) !== 0) {
            return;
        }

        const incrementButton = getIncrementButton(quantityInput);
        if (incrementButton && !incrementButton.disabled) {
            incrementButton.click();
            return;
        }

        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        valueSetter.call(quantityInput, '1');
        quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
        quantityInput.dispatchEvent(new Event('change', { bubbles: true }));
    }, true);
})();
