// ==UserScript==
// @name         Premium Shopping List <Rayenz>
// @description  Keep track of shopping list **Tested in Chrome only!**
// @version      2026-07-11
// @author       rayenz-akusiom
// @match        *://*.neopets.com/premium/
// @match        *://*.neopets.com/safetydeposit.phtml*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=neopets.com
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

/**
 * Ideas / things to fix:
 * - Category adding doesn't work right
 * - Replace shop wiz checkbox with checking the item name
 * - Put the item names in the items so that I can jquery add them
 * - Deleting
 * - Editing?
 * - Category dropdown?
 * - SDB capture
 */

/**
 * Globals
 */
let ITEM_COUNT = 0;

const PAYMENT_ITEM_ORDER = [
    'Mau Codestone', 'Tai-Kai Codestone', 'Lu Codestone', 'Vo Codestone',
    'Eo Codestone', 'Main Codestone', 'Zei Codestone', 'Orn Codestone',
    'Har Codestone', 'Bri Codestone',
    'Mag Codestone', 'Vux Codestone', 'Cui Codestone', 'Kew Codestone',
    'Sho Codestone', 'Zed Codestone',
    'One Dubloon Coin', 'Two Dubloon Coin', 'Five Dubloon Coin',
];

function paymentItemRank(name) {
    const index = PAYMENT_ITEM_ORDER.indexOf(name);
    return index === -1 ? PAYMENT_ITEM_ORDER.length : index;
}

function isPaymentItem(name) {
    return paymentItemRank(name) < PAYMENT_ITEM_ORDER.length;
}

/**
* Monkey Storage
**/
const SHOPPING_STORAGE = "shoppingStorage";
let shoppingStorage = new Map();
if (GM_getValue(SHOPPING_STORAGE)) {
    shoppingStorage = new Map(JSON.parse(GM_getValue(SHOPPING_STORAGE)));
}

// "Main"
setUpClasses();

if (document.URL.includes("premium")) {
    initializeShoppingList();
    importShoppingList();
    setUpCollapsibles();
}
else if (document.URL.includes("safetydeposit")){
    captureSDBCounts();
}

/***
 *  Shopping List Function
 */
function initializeShoppingList() {
    const sswBar = document.getElementsByClassName("pp-ssw__2020")[0];
    const shoppingListContainer = document.createElement("div");
    shoppingListContainer.classList.add("pp-carousel-container");
    shoppingListContainer.id = "rayenz-sl";
    shoppingListContainer.innerHTML = blankShoppingList();
    sswBar.after(shoppingListContainer);

    // Wire up Submit button
    const submitButton = document.getElementById("rayenz-sl-adder-submit")
    submitButton.addEventListener("click", function () { addItem() });
}

function importShoppingList() {
    shoppingStorage.forEach(insertCategory)
}

function insertCategory(items, category) {
    let categoryDiv = document.getElementById(`rayenz-sl-category-${category}`);
    if (!categoryDiv) {
        const innerContainer = document.getElementById("rayenz-sl-inner-ctn");

        const categoryButton = document.createElement("button");
        categoryButton.id = `rayenz-sl-category-btn-${category}`;
        categoryButton.classList.add(`rayenz-sl-collapsible`);
        categoryButton.innerText = category;
        innerContainer.appendChild(categoryButton);

        categoryDiv = document.createElement("div")
        categoryDiv.id = `rayenz-sl-category-${category}`;
        categoryDiv.classList.add("rayenz-sl-category");
        innerContainer.appendChild(categoryDiv);
    }

    for (let i = 0; i < items.length; i++) {
        insertItem(items[i]);
    }
}

function insertItem(item) {
    ITEM_COUNT++;
    const categoryDiv = document.getElementById(`rayenz-sl-category-${item.category}`);
    const itemElements = formatItem(item);
    const uid = ITEM_COUNT;
    categoryDiv.appendChild(itemElements);

    if (!sswlimited(item.name)) {
        const itemIcon = document.getElementById(`rayenz-sl-item-${item.id}-${uid}`);
        itemIcon.addEventListener("click", function () { openSearch(item.name, item.ssw) });
    }
    else {
        $(`#rayenz-sl-item-${item.id}-${uid}`).wrap(`<a target="_blank" href='https://www.neopets.com/shops/wizard.phtml?string=${item.name}'></a>`);
    }

    // Delete operation
    const deleteButton = document.getElementById(`rayenz-sl-item-${item.id}-${uid}-delete`);
    deleteButton.addEventListener("click", function () { deleteItem(item.category, item.id, uid) });
}

function addItem() {
    const name = document.getElementById("iname");
    const url = document.getElementById("imgurl");
    const category = document.getElementById("icategory");
    const target = document.getElementById("itarget");

    let addedItem = {
        name: name.value,
        id: kebabify(name.value),
        url: url.value,
        category: category.value,
        target: target.value,
    };

    // Reset "form"
    name.value = "";
    url.value = "";
    target.value = "";

    // Add to shopping storage
    const listCategory = shoppingStorage.get(addedItem.category);
    if (listCategory) {
        listCategory.push(addedItem);
    }
    else {
        shoppingStorage.set(addedItem.category, [addedItem]);
    }

    sortShoppingList();
    saveShoppingList();

    insertItem(addedItem);
}

function formatItem(item) {
    const gridItem = document.createElement("div");
    gridItem.classList.add("rayenz-sl-grid-item");
    gridItem.innerHTML = `
        <img id="rayenz-sl-item-${item.id}-${ITEM_COUNT}" class="rayenz-sl-item" src="${item.url}">
        <p class="rayenz-sl-item-name">${item.name}</p>
        <p class="rayenz-sl-item-name">(${Number(item.target).toLocaleString()})</p>
        <p class="rayenz-sl-item-name">${sdbLink(item.name)}: ${item.sdbQty ? item.sdbQty : "?"}
        <p class="rayenz-sl-item-name" id="rayenz-sl-item-${item.id}-${ITEM_COUNT}-delete" >DELETE</p>
    `;

    return gridItem;
}

function sortShoppingList(){
    for (let [category, list] of shoppingStorage){
        let sortedCategory = Array.from(list);

        // Sort by name; codestones/dubloons use SDB order
        sortedCategory = sortedCategory.sort((firstItem, secondItem) => {
            const aPay = isPaymentItem(firstItem.name);
            const bPay = isPaymentItem(secondItem.name);
            if (aPay && bPay) {
                const diff = paymentItemRank(firstItem.name) - paymentItemRank(secondItem.name);
                if (diff !== 0) {
                    return diff;
                }
            }
            return ('' + firstItem.name).localeCompare(secondItem.name);
        });

        // Put SSW-able items first
        let sswItems = [];
        let wizItems = [];
        for(let item of sortedCategory){
            if(sswlimited(item.name)) {
                wizItems.push(item);
            }
            else {
                sswItems.push(item);
            }
        }

        sortedCategory = sswItems.concat(wizItems);
        shoppingStorage.set(category, sortedCategory);
    }
}

function saveShoppingList() {
    storeMonkeyMap(SHOPPING_STORAGE, shoppingStorage);
}

function deleteItem(category, idToRemove, uid){
    //Remove from storage
    let categoryItems = shoppingStorage.get(category);

    if (categoryItems.length === 0){
        shoppingStorage.delete(category);
    }
    else {
        categoryItems = categoryItems.filter(function(item) {
            return item.id != idToRemove;
        });
        shoppingStorage.set(category, categoryItems);
    }

    //Remove HTML elements
    $(`#rayenz-sl-item-${idToRemove}-${uid}`).parent().remove();

    // Update storage
    saveShoppingList();
}

/**
 * Safety Deposit Functions
 */
function captureSDBCounts(){
    let sdbElems = $(`#content > table > tbody > tr > td.content > form > table:nth-child(3) > tbody > tr`);

    if (!sdbElems){
        return;
    }
    
    //Discard wrapping rows
    let sdbRows = jQuery.makeArray( sdbElems );
    sdbRows.shift();
    sdbRows.pop();

    // Get Item Quantities
    const qtyMap = new Map();

    sdbRows.forEach(item => {
        let itemCells = item.getElementsByTagName("td");
        let itemName = itemCells[1].getElementsByTagName("b")[0].innerText.split("\n")[0];
        let itemQty = itemCells[4].getElementsByTagName("b")[0].innerText;

        qtyMap.set(itemName, itemQty);
    });

    updateItemQuantities(qtyMap);
}

function updateItemQuantities(qtyMap){
    shoppingStorage.forEach((category) => {
        category.forEach((item) => {
            if (qtyMap.get(item.name)){
                item.sdbQty = qtyMap.get(item.name);
            }
        })
    });

    saveShoppingList();
}

/**
 * Utility Functions
 */

function storeMonkeyMap(key, mapToStore) {
    GM_setValue(key, JSON.stringify(Array.from(mapToStore.entries())));
}

function kebabify(rawString) {
    const tokens = rawString.toLowerCase().split(" ");
    return tokens.join("-");
}

// Cribbed from Dice's Search Helper
function sswlimited(itemName) {
    return (/Nerkmid($|.X+$)/.test(itemName) || itemName.endsWith("Paint Brush") || itemName.endsWith("Transmogrification Potion") || itemName.endsWith("Laboratory Map"));
}

// Cribbed from Dice's Search Helper
function openSearch(item) {
    // open this in such a way that if the "__2020" was changed/removed without warning, this will still work
    // TODO: hardcode the class name better once out of beta
    $("[class^='ssw-header']").last().parent().show();

    // if results are currently up, close them
    $("#ssw-button-new-search").click();

    $("#ssw-criteria").val("exact");
    $("#searchstr").val(item);
}

// Cribbed from Dice's Search Helper
function sdbLink(itemName) {
    let url = `https://www.neopets.com/safetydeposit.phtml?obj_name=${itemName}&category=0`;
    let img = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAECklEQVRYhe1WS08jRxD+qj2PHQ8gbLB5SgaBQKDkyokDXPIbOOcX5RJFSi45RcovyCESIocoOawQSHhxQDwMEg/j4CEz4/FO90zlwIzXsMbrELTaw35SH2ZUVd/XVdVdDXzGZ3yKIKKPxwUAlmVNFAqFNcMwviwUChfZbPZ8b2/vLTP/PTg4eCuE8E9OTlgpxQDeAmgBYAB6EkcCiADESUzu4NASO5H8l8nitoCZmZmv19fXf3AcR0xNTcUDAwOy1WqBmZtE9I+U0t/Z2ckwc2wYhgOgngTIJiR+IirqEMAJ6SsANgADgALgE5F/c3PzZ7lc/lYTQmB6enpI3AOGYYhsNmtalgUAJoAcEWF2dhZhGMJ1Xei6DsMwwNy50f4QBAFM04RlWROVSuVHjYig67qdGjBze6WI4xhSSjSbTRQKBTSbTRSLRdi23ZWkG+I4xvX1NUzThFIKvu8PEVFWS0j1pxyFEDg6OsLW1haICBsbG1heXka5XEYURdD1J10fwPM85PN5LCwsYHt7G47jCACkJTsNezm7rotarYZMJgOlFEZHR5HP53F4eAjbtj9YCqUUTNPEysoKhBCpvQYgozEzWq2WSo9eFEXvBZBSPiBhZmQyGQwPD2NwcPCDAlJ/ImqXN5vNGpOTk5rGzFBKRUTUNngKhmHAMIwHQh73Szc8tmFmWJYlJicnNQ0AiOjJQjIz5ufnsbq6CiJCsVh8Vvd3gWDmjJZ85HsJyOVyKJVKcF0XQoiXIG8LSKMN9bLsTHUcx/+bOSl1JggCU+D+5tL6cSKirk36TBhRFL1KM9Azr8lJQRAEL0UOABkARkr85PgTQqBarWJzcxPlcrndgGlG/svqIkBPU99z/jqOg0ajAeDdPSGlhOd5iOO4r4tICIEoiqBp7WoLAFpfAjoDKaXQaDQwMTGBpaWlvt8OjUYDR0dHKJVKqQ8BoFRAz9bWNA1DQ0PI5XJoNBoYGRnB3Nxc33MAAEqlEqrVKvb39+G6bjsTGgAKw9BMd/L4mDEzSqUS1tbWwMw4PT2FlBKVSqVv8hREhHq9DsdxMD4+HgNQqQArbZRuAgYGBmBZFoiIdV2PPc9rF11KSVEUpd9xstLXkcL9oAuT7wwR2SMjI7bnebdhGNbTEnTtIiJCEAS4u7ur6rr+i+/7f4Rh6CYEDAC7u7u4uLgAEXHyX3WsEO9eSwr3T7McgGFmdqWU+10vICKCUgp3d3e1s7Ozn46Pj78/PT39y/O893qln2HUC10FuK7bvLy8/LVSqXxzfHz8++3trXw2Qz8CmJnDMIRSimu12ptarfbd69evfz4/P6+/xN3fCwSAbNv+amxs7IvFxcXg4ODgt6urqze+77/IzO0byYv4o3J+EvgX4yIhYBP/dWUAAAAASUVORK5CYII=";

    return `<a tabindex='-1' target='_blank' href='${url}'><img src='${img}' class='rayenz-sl-searchimg'></a>`;
}

function blankShoppingList() {
    return `
        <div class="premium-pets-title">
            <h2>Shopping List</h2>
        </div>

        <div id="rayenz-sl-ctn" class="rayenz-shopping-list">
            <div id="rayenz-sl-list">
                <div id="rayenz-sl-inner-ctn" class="rayenz-sl-ctn">
                </div>
            </div>
            <button type="button" id="rayenz-sl-control-collapse" class="rayenz-sl-collapsible">Add Items</button>
            <div class="rayenz-sl-controls">
                <label for="iname">Item Name</label>
                <input type="text" id="iname" name="iname"><br><br>
                <label for="imgurl">Image URL:</label>
                <input type="text" id="imgurl" name="imgurl"><br><br>
                <label for="icategory">Category</label>
                <input type="text" id="icategory" name="icategory"><br><br>
                <label for="itarget">Target Buying point</label>
                <input type="text" id="itarget" name="itarget"><br><br>
                <button type="button" id="rayenz-sl-adder-submit">Add</button>
            </div>
        </div>
    `
}

function setUpCollapsibles() {
    //Collapsible event listener
    var coll = document.getElementsByClassName("rayenz-sl-collapsible");

    for (var i = 0; i < coll.length; i++) {
        if (coll[i].id !== "rayenz-sl-control-collapse"){
            coll[i].addEventListener("click", function () { toggleVisibility(this, "grid")});
        }
        else {
            coll[i].addEventListener("click", function () { toggleVisibility(this, "block")});
        }
    }
}

function toggleVisibility(element, type) {
    element.classList.toggle("rayenz-sl-active");
    var content = element.nextElementSibling;
    if (content.style.display && content.style.display !== "none") {
        content.style.display = "none";
    } else {
        content.style.display = type;
    }
}

function setUpClasses() {
    let headElement = document.getElementsByTagName("head")[0];
    let styleTag = document.createElement("style");
    styleTag.innerHTML = `
    .rayenz-shopping-list {
        display: grid;
        position: relative;
        width: calc(100% - 40px);
        margin: 20px auto;
        border-image-slice: 20 20 20 20 fill;
        border-image-width: 20px 20px 20px 20px;
        border-image-outset: 20px 20px 20px 20px;
        border-image-repeat: repeat repeat;
        border-image-source: url(https://images.neopets.com/premium/portal/images/pets-backing.svg);
        border-style: solid;
        box-sizing: border-box;
        margin-left 86px;
        margin-right 86px;
        max-width: 850px;
    }

    #rayenz-sl button,
    #rayenz-sl label{
        font-family: "Cafeteria", 'Arial Bold', sans-serif;
        letter-spacing: 0.5px;
        font-size: 14pt;
        color: #000;
    }
    .rayenz-sl-ssw-icon {
        width: 30px;
        height: 30px;
        float: left;
        margin-right: 10px;
        background-image: url(https://images.neopets.com/premium/shopwizard/ssw-icon.svg);
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
    }

    /** Shopping List Grid */
    .rayenz-sl-category {
        display: grid;
        grid-template-columns: 120px 120px 120px 120px 120px 120px;
        grid-template-rows: 200px;
        column-gap: 10px;
        row-gap: 10px;
        width: 862px;
        background-color: white;
        overflow: hidden;
        margin: 0px auto 0px;
        padding: 10px 45px 10px 45px;
        transition: max-height 0.2s ease-out;
        display: none;
    }
    .rayenz-sl-grid-item {
        display: block;
        width: 120px;
    }
    .rayenz-sl-item {
        width: 80px;
        height: 80px;
        margin-left: 20px;
        margin-right: 20px;
    }
    .rayenz-sl-searchimg {
        cursor: pointer;
        height: 20px !important;
        width: 20px !important;
    }
    .rayenz-sl-item-name {
        font-family: MuseoSansRounded500, Arial, sans-serif;
        font-size: 14.667px;
        margin-block-end 5px;
        margin-block-start: 5px;
        margin-bottom: 5px;
        margin-inline-end: 6px;
        margin-inline-start: 6px;
        margin-left: 6px;
        margin-right: 6px;
        margin-top: 5px;
        text-align: center;
        width: 108px;
    }

    /* Controls */
    .rayenz-sl-controls {
        background-color: white;
        overflow: hidden;
        transition: max-height 0.2s ease-out;
        max-width: 850px;
        display: none;
    }

    /* Collapsible Styling */
    .rayenz-sl-collapsible {
        cursor: pointer;
        padding: 18px;
        width: 100%;
        border: none;
        text-align: left;
        outline: none;
        margin: 0;
    }

    .rayenz-sl-active,
    .rayenz-sl-collapsible:hover {
        background-color: #555;
    }

    .rayenz-sl-collapsible:after {
        content: 'v';
        float: right;
        margin-left: 5px;
    }
    .rayenz-sl-active:after {
        content: ">";
    }
    `
    headElement.appendChild(styleTag);
}