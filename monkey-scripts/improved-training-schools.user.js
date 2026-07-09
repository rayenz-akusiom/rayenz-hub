// ==UserScript==
// @name         Improved Training Schools <Rayenz>
// @description  Adds some much needed useability functions to the training school(s). **Tested in Chrome only!**
// @version      2026-07-08
// @author       rayenz-akusiom
// @match        *://*.neopets.com/pirates/academy.phtml?type=status*
// @match        *://*.neopets.com/island/*training.phtml?*type=status*
// @match        *://*.neopets.com/island/*fight_training.phtml?*type=status*
// @match        *://*.neopets.com/safetydeposit.phtml*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=neopets.com
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

/**
 * Feature List:
 *
 * - Works in all training schools!
 * - HSD Replaces Level in Pet Titles
 * - Order by HSD (default DESC)
 * - Added lock functionality to prevent accidental interaction with "finished" pets
 * - Pushes Graduates (overleveled) and manually locked pets to bottom of list (Now graduates if overstatted as well)
 * - Pushes pets awaiting payment, have training in process or have completed training to the top of the list
 * - Badges that show the cost of your course.
 * - Will suggest which stat to train.
 * - Enroll and Pay from the same page
 * - Pets not training are still happy! Isn't that nice :)
 * - Recommends next stat based on an even leveling strategy, respecting boost maxes.
 * - No page refresh between enroll, pay, complete, or SDB withdrawal
 * - Shop Wizard search links on payment tiles (Super Shop Wizard when premium)
 * - SDB shortcut with auto-fill for codestones/dubloons and Move to Inventory preselect
 */

/**
* Ideas:
* Reverseable Sort? - Done as an Option, button for later.
**/

/**
* Options
**/
const OPT_REPLACE_PET_TABLE = true; // Controls whether or not this script replaces the UI. Break in case of emergency, basically.
const OPT_SORT_ORDER = "DESC"; // Valid options are ASC or DESC
const OPT_LOCKING = true; // Enables the locking feature

/**
* Other globals
**/
const LOCKED_IMAGE = "https://images.neopets.com/pin/bank_pin_mgr_35.jpg";
const UNLOCKED_IMAGE = "https://images.neopets.com/items/gif_key_secret_door.gif";
const BADGE_GRADUATE = 'https://images.neopets.com/items/clo_grad_vanda_hat.gif';
const EVIL_COCONUT_STAMP_ICONS = [
    'https://images.neopets.com/items/spo_coconut_1.gif',
    'https://images.neopets.com/items/spo_coconut_2.gif',
    'https://images.neopets.com/items/spo_coconut_3.gif',
    'https://images.neopets.com/items/spo_coconut_4.gif',
    'https://images.neopets.com/items/spo_coconut_5.gif',
    'https://images.neopets.com/items/spo_coconut_6.gif',
    'https://images.neopets.com/items/spo_coconut_7.gif',
    'https://images.neopets.com/items/spo_coconut_8.gif',
    'https://images.neopets.com/items/spo_coconut_9.gif',
    'https://images.neopets.com/items/spo_coconut_10.gif',
    'https://images.neopets.com/items/spo_coconut_11.gif',
    'https://images.neopets.com/items/spo_coconut_12.gif',
    'https://images.neopets.com/items/spo_coconut_13.gif',
    'https://images.neopets.com/items/spo_coconut_14.gif',
    'https://images.neopets.com/items/spo_coconut_18.gif',
    'https://images.neopets.com/items/spo_coconut_17.gif',
    'https://images.neopets.com/items/spo_coconut_23.gif',
    'https://images.neopets.com/items/spo_coconut_16.gif',
    'https://images.neopets.com/items/spo_coconut_xmas.gif',
    'https://images.neopets.com/items/spo_coconut_19.gif',
    'https://images.neopets.com/items/spo_coconut_20.gif',
    'https://images.neopets.com/items/spo_coconut_21.gif',
    'https://images.neopets.com/items/spo_coconut_24.gif',
    'https://images.neopets.com/items/spo_coconut_15.gif',
    'https://images.neopets.com/items/spo_coconut_25.gif',
];
const STAT_ROW_ICONS = {
    level: 'https://images.neopets.com/themes/h5/basic/images/level-icon.png',
    hp: 'https://images.neopets.com/themes/h5/basic/images/health-icon.png',
    strength: 'https://images.neopets.com/themes/h5/basic/images/equip-icon.png',
    defence: 'https://images.neopets.com/items/armorednegg.gif',
};
const COURSE_ROW_IDS = {
    Level: 'level',
    Endurance: 'hp',
    Strength: 'strength',
    Defence: 'defence',
};
const ROW_COURSES = {
    level: 'Level',
    hp: 'Endurance',
    strength: 'Strength',
    defence: 'Defence',
};
const enrollmentRowSnapshots = new Map();
const pendingCompletionResults = new Map();
const statBaselines = new Map();
const COMPLETION_STAT_LABELS = {
    level: 'Level',
    strength: 'Strength',
    defence: 'Defence',
    hp: 'HP',
};

/**
 * School Settings (to help with the different schools)
 */
const SCHOOL_SETTINGS = new Map();
const SCHOOL_SWASHBUCKLING = "swashbuckling";
SCHOOL_SETTINGS.set(SCHOOL_SWASHBUCKLING, {
    schoolName: SCHOOL_SWASHBUCKLING,
    url: "/pirates/academy.phtml",
    courseSubmitUrl: "/pirates/process_academy.phtml",
    graduateLevel: 40,
    tiers: [
        { cost: "Graduated!", image: BADGE_GRADUATE},
        { cost: "Five Dubloon Coin", image: 'https://images.neopets.com/items/dubloon3.gif', maxLevel: 40},
        { cost: "Five Dubloon Coin", image: 'https://images.neopets.com/items/dubloon3.gif', maxLevel: 30},
        { cost: "Two Dubloon Coin", image: 'https://images.neopets.com/items/dubloon2.gif', maxLevel: 20},
        { cost: "One Dubloon Coin", image: 'https://images.neopets.com/items/dubloon1.gif', maxLevel: 10}
    ],
    tiersInclusive: true,
    hpMult: 2,
    petTableIndex: 3
});
const SCHOOL_ISLAND = "island";
SCHOOL_SETTINGS.set(SCHOOL_ISLAND, {
    schoolName: SCHOOL_ISLAND,
    url: "/island/training.phtml",
    courseSubmitUrl: "/island/process_training.phtml",
    graduateLevel: 250,
    tiers: [
        { cost: "Graduated!", image: BADGE_GRADUATE},
        { cost: "8 Tan Codestones", image: 'https://images.neopets.com/items/codestone5.gif', maxLevel: 250},
        { cost: "7 Tan Codestones", image: 'https://images.neopets.com/items/codestone2.gif', maxLevel: 200},
        { cost: "6 Tan Codestones", image: 'https://images.neopets.com/items/codestone3.gif', maxLevel: 150},
        { cost: "5 Tan Codestones", image: 'https://images.neopets.com/items/codestone4.gif', maxLevel: 120},
        { cost: "4 Tan Codestones", image: 'https://images.neopets.com/items/codestone6.gif', maxLevel: 100},
        { cost: "3 Tan Codestones", image: 'https://images.neopets.com/items/codestone7.gif', maxLevel: 80},
        { cost: "2 Tan Codestones", image: 'https://images.neopets.com/items/codestone8.gif', maxLevel: 40},
        { cost: "1 Tan Codestone", image: 'https://images.neopets.com/items/codestone1.gif', maxLevel: 20}
    ],
    tiersInclusive: true,
    hpMult: 3,
    petTableIndex: 3
});
const SCHOOL_NINJA = "ninja";
SCHOOL_SETTINGS.set(SCHOOL_NINJA, {
    schoolName: SCHOOL_NINJA,
    url: "/island/fight_training.phtml",
    courseSubmitUrl: "/island/process_fight_training.phtml",
    graduateLevel: null,
    tiers: [
        { cost: "6 Red Codestones", image: 'https://images.neopets.com/items/codestone16.gif', maxLevel: null},
        { cost: "5 Red Codestones", image: 'https://images.neopets.com/items/codestone15.gif', maxLevel: 750},
        { cost: "4 Red Codestones", image: 'https://images.neopets.com/items/codestone14.gif', maxLevel: 600},
        { cost: "3 Red Codestones", image: 'https://images.neopets.com/items/codestone13.gif', maxLevel: 500},
        { cost: "2 Red Codestones", image: 'https://images.neopets.com/items/codestone12.gif', maxLevel: 400},
        { cost: "1 Red Codestone", image: 'https://images.neopets.com/items/codestone11.gif', maxLevel: 300}
    ],
    tiersInclusive: false,
    hpMult: 3,
    petTableIndex: 5
});

/**
* Monkey Storage
**/
const PET_STORAGE = "petStorage";
const PAYMENT_STORAGE = "trainingPayment";
const PAYMENT_PET = "trainingPaymentPet";
const PAYMENT_ICON = "https://images.neopets.com/items/sdb.gif";
const CODESTONE_ICONS = {
    'Bri Codestone': 'https://images.neopets.com/items/codestone10.gif',
    'Eo Codestone': 'https://images.neopets.com/items/codestone5.gif',
    'Har Codestone': 'https://images.neopets.com/items/codestone9.gif',
    'Lu Codestone': 'https://images.neopets.com/items/codestone3.gif',
    'Main Codestone': 'https://images.neopets.com/items/codestone6.gif',
    'Mau Codestone': 'https://images.neopets.com/items/codestone1.gif',
    'Orn Codestone': 'https://images.neopets.com/items/codestone8.gif',
    'Tai-Kai Codestone': 'https://images.neopets.com/items/codestone2.gif',
    'Vo Codestone': 'https://images.neopets.com/items/codestone4.gif',
    'Zei Codestone': 'https://images.neopets.com/items/codestone7.gif',
    'Mag Codestone': 'https://images.neopets.com/items/codestone11.gif',
    'Vux Codestone': 'https://images.neopets.com/items/codestone12.gif',
    'Cui Codestone': 'https://images.neopets.com/items/codestone13.gif',
    'Kew Codestone': 'https://images.neopets.com/items/codestone14.gif',
    'Sho Codestone': 'https://images.neopets.com/items/codestone15.gif',
    'Zed Codestone': 'https://images.neopets.com/items/codestone16.gif',
};
const PAYMENT_ITEM_ORDER = [
    'Mau Codestone', 'Tai-Kai Codestone', 'Lu Codestone', 'Vo Codestone',
    'Eo Codestone', 'Main Codestone', 'Zei Codestone', 'Orn Codestone',
    'Har Codestone', 'Bri Codestone',
    'Mag Codestone', 'Vux Codestone', 'Cui Codestone', 'Kew Codestone',
    'Sho Codestone', 'Zed Codestone',
    'One Dubloon Coin', 'Two Dubloon Coin', 'Five Dubloon Coin',
];
let petStorage = new Map();
if (GM_getValue(PET_STORAGE)){
    petStorage = new Map(JSON.parse(GM_getValue(PET_STORAGE)));
}

/**
* Main
**/
const SCHOOL = detectSchool();
setUpClasses();
main();

function main(){
    try{
        if (location.pathname.includes("safetydeposit.phtml")) {
            runWhenReady(handleSdbPage);
            return;
        }

        runWhenReady(() => replacePetTable(getPets(document)));
    }
    catch (error){
        console.log(error);
        createRetryButton();
    }
}

function runWhenReady(fn){
    if (document.readyState !== 'loading') {
        fn();
    }
    else {
        document.addEventListener('DOMContentLoaded', fn);
    }
}

function replacePetTable(petData)
{
    if (!OPT_REPLACE_PET_TABLE){
        return;
    }

    // Of course one of the pages would have extra empty paragraphs...
    let petTable = document.getElementById("content");
    let paragraphTags = petTable.getElementsByTagName("p");
    let wisdomOffset = (paragraphTags[2].getElementsByTagName("td").length > 0) ? 2 : 0;

    let containerLocation = paragraphTags[SCHOOL.petTableIndex + wisdomOffset];
    containerLocation.innerHTML = "";

    let petOuterContainer = document.createElement("div");
    containerLocation.appendChild(petOuterContainer);
    petOuterContainer.classList.add("training-outer-container");

    for (const [petName, petStats] of petData.entries()){
        captureStatBaseline(petName, petStats);

        let petContainer = document.createElement("div");
        petContainer.id = `petContainer-${petName}`;
        petContainer.classList.add("pet-container");
        petOuterContainer.appendChild(petContainer);

        // Status Card
        let statusCell = document.createElement("div");
        petContainer.appendChild(statusCell);
        statusCell.classList.add("status-cell");
        statusCell.innerHTML =
            `
          <div class="petStats-stats" id="petStats-container-${petName}">
            <img src="//pets.neopets.com/cpn/${petName}/1/2.png" width="150" height="150" border="0">
            <div class="petStats-row" id="name-${petName}">
                <img class="petStats-icon" id="enroll-lock-${petName}" src="${petStats.locked ? LOCKED_IMAGE : UNLOCKED_IMAGE}"/>
                <div class="petStats-details" id="enroll-name-${petName}"><b>${petStats.name}</b></div>
            </div>
            <div class="petStats-row" id="cost-${petName}">
                <img class="petStats-icon" id="enroll-badge-${petName}" src="https://images.neopets.com/themes/h5/basic/images/level-icon.png"/>
                <div class="petStats-details" id="enroll-cost-${petName}"><b>${petStats.petTitle ? petStats.petTitle : petStats.badge.cost}</b></div>
            </div>
            <div class="petStats-row" id="hsd-${petName}">
                <img class="petStats-icon" id="enroll-hsd-${petName}" src="https://images.neopets.com/items/pot_strengthofaltador.gif"/>
                <div class="petStats-details" id="enroll-hsd-${petName}"><b>${petStats.hsd}</b> HSD</div>
            </div>
            <div class="petStats-row" id="level-${petName}">
                <img class="petStats-icon" src="https://images.neopets.com/themes/h5/basic/images/level-icon.png">
                <div class="petStats-details" id="enroll-level-${petName}">Lvl : <font color="green"><b>${petStats.level}</b></font></div>
            </div>
            <div class="petStats-row" id="hp-${petName}">
                <img class="petStats-icon" src="https://images.neopets.com/themes/h5/basic/images/health-icon.png"/>
                <div class="petStats-details" id="enroll-hp-${petName}">Hp : <b>${petStats.hp}</b></div>
            </div>
            <div class="petStats-row" id="strength-${petName}">
                <img class="petStats-icon" src="https://images.neopets.com/themes/h5/basic/images/equip-icon.png"/>
                <div class="petStats-details" id="enroll-strength-${petName}">Str : <b>${petStats.strength}</b></div>
            </div>
            <div class="petStats-row" id="defence-${petName}">
                <img class="petStats-icon" src="https://images.neopets.com/items/armorednegg.gif"/>
                <div class="petStats-details" id="enroll-defence-${petName}">Def : <b>${petStats.defence}</b></div>
            </div>
            <div class="petStats-progress" id="progress-${petName}"/>
          </div>
          `;

        // Update the background image for the cost badge
        const badgeIcon = document.getElementById(`enroll-badge-${petName}`);
        badgeIcon.src = petStats.badge.image;

        // Update the background color for the recommended stat
        formatRecommendedStat(petStats);

        // Only set up the enrollment behaviour if there's no progress being reported.
        if (petStats.petProgress.trim().length === 0){
            setupEnrollmentHandlers(petName);
        }

        // Progress reporting
        if (petStats.petProgress){
            updateProgressCell(petStats);
        }

        // Lock behaviour
        let lockRow = document.getElementById(`name-${petName}`);
        lockRow.addEventListener("click", function() {togglePetLock(petName)});
        lockRow.onmouseover = function() {mouseOver(lockRow)};
        lockRow.onmouseout = function() {mouseOut(lockRow)};
    }
}

function createRetryButton(){
    const mainTable = $("#content > table > tbody > tr > td.content");
    const retryButton = document.createElement("button");
    retryButton.appendChild(document.createTextNode("Reload"));
    retryButton.addEventListener("click", function () { main() });
    mainTable.append(retryButton);
}

function getPets(pageHandle) {
    const content = pageHandle.getElementsByClassName('content')[0];
    let petTable = [...content.getElementsByTagName('table')].filter(tbl => tbl.width == '500')[0];
    let petStatsMap = new Map();
    for (var i = 0; i < petTable.rows.length; i++) {
        let row = petTable.rows[i];
        if (i % 2 == 0){
            // This is a pet header
            let petTitle = row.cells[0].innerHTML;
            let petName = petTitle.substring(3).split(" ")[0];
            let nextRow = petTable.rows[i+1];

            // Get Pet Stats from next row
            let petStats = getPetStats(nextRow.cells[0]);

            // Fill in the title for later
            petStats.petTitle = reformatPetTitle(petStats, petTitle);
            petStats.name = petName;

            // Get Pet Progress from next row
            petStats.petProgress = nextRow.cells[1].innerHTML;

            // Apply locking state
            petStats.locked = shouldLockPet(petStats);

            // Figure out their badge
            petStats.badge = determineBadge(petStats);

            // Push to array
            petStatsMap.set(petName, petStats);
        }
    }

    // Sort the map and store it
    let sortedPetStatsMap = sortPetMap(petStatsMap);
    storeMonkeyMap(PET_STORAGE, sortedPetStatsMap);

    return sortedPetStatsMap;
}

function shouldLockPet(petStats){
    // Locked Pets
    if (petStorage.get(petStats.name) && petStorage.get(petStats.name).locked){
        return true;
    }

    return false;
}

function determineBadge(petStats){
    let badge = SCHOOL.tiers[0];
    if (hasGraduated(petStats)){
        return badge;
    }

    for (let i = 1; i < SCHOOL.tiers.length; i++){
        if (SCHOOL.tiersInclusive ? petStats.level <= SCHOOL.tiers[i].maxLevel :
            petStats.level < SCHOOL.tiers[i].maxLevel){
            badge = SCHOOL.tiers[i];
        }
        else {
            return badge;
        }
    }

    return badge;
}

function submitCourse(petName, stat){
    const rowId = COURSE_ROW_IDS[stat];
    clearCompletionResult(petName);
    clearEnrollmentErrors(petName);

    $.ajax({
        type: "POST",
        url: SCHOOL.courseSubmitUrl,
        data: `type=start&course_type=${stat}&pet_name=${petName}`,
        timeout: 6000,
        success: function(data) {
            fetchStatusPage().then(html => {
                const dataWrapper = document.createElement('div');
                dataWrapper.innerHTML = html;
                const petStats = getPets(dataWrapper).get(petName);

                if (petStats && enrollmentSucceeded(petStats)) {
                    refreshPetCard(petName, html);
                    return;
                }

                const statusError = parseEnrollmentError(html)
                    || parseEnrollmentError(data)
                    || 'This stat cannot be trained right now.';
                showEnrollmentError(petName, rowId, statusError);
            });
        },
        error: function(xhr, status, error) {
            console.log(status + error);
            showEnrollmentError(petName, rowId, 'Could not reach the training school. Try again.');
        }
    })
}

function enrollmentSucceeded(petStats){
    return petStats.petProgress.trim().length > 0
        || (petStats.petTitle && petStats.petTitle.trim().length > 0);
}

function isEnrollmentNotice(text){
    return /be warned.*cancel.*course/i.test(text)
        || /will not be able to train for 24 hours if you cancel/i.test(text);
}

function isPetHealthDisplay(text){
    return /^\d+\s*\/\s*\d+$/.test(text.trim());
}

function shouldIgnoreEnrollmentText(text){
    return isEnrollmentNotice(text) || isPetHealthDisplay(text);
}

function parseEnrollmentError(pageHtml){
    if (!pageHtml || typeof pageHtml !== 'string') {
        return null;
    }

    const wrapper = document.createElement('div');
    wrapper.innerHTML = pageHtml;

    for (const selector of [
        'font[color="red"]',
        'font[color="#ff0000"]',
        'font[color="#FF0000"]',
        '.errorMessage',
        '.error',
    ]) {
        for (const el of wrapper.querySelectorAll(selector)) {
            const text = el.innerText.trim();
            if (text.length > 5 && text.length < 500 && !shouldIgnoreEnrollmentText(text)) {
                return text;
            }
        }
    }

    const content = wrapper.querySelector('.content') || wrapper;
    const patterns = [
        /you cannot[^.!?\n]+/i,
        /cannot (?:train|increase|raise|study)[^.!?\n]+/i,
        /too high[^.!?\n]+/i,
        /must (?:train|increase)(?: your)? level[^.!?\n]+/i,
        /already (?:studying|enrolled|training|signed up)[^.!?\n]+/i,
        /not allowed to[^.!?\n]+/i,
        /have graduated[^.!?\n]+/i,
        /before you can train[^.!?\n]+/i,
    ];

    for (const pattern of patterns) {
        const match = content.innerText.match(pattern);
        if (match && !shouldIgnoreEnrollmentText(match[0])) {
            return match[0].trim();
        }
    }

    for (const el of content.querySelectorAll('b, strong, p, td')) {
        const text = el.innerText.trim();
        if (text.length > 5
            && text.length < 300
            && !shouldIgnoreEnrollmentText(text)
            && /cannot|too high|must train|already|not allowed|graduated|before you can/i.test(text)) {
            return text;
        }
    }

    return null;
}

function getRandomEnrollErrorIcon(){
    return EVIL_COCONUT_STAMP_ICONS[Math.floor(Math.random() * EVIL_COCONUT_STAMP_ICONS.length)];
}

function statDetailsId(rowId, petName){
    return `enroll-${rowId}-${petName}`;
}

function showEnrollmentError(petName, rowId, message){
    const row = document.getElementById(`${rowId}-${petName}`);
    const icon = row?.querySelector('.petStats-icon');
    const details = document.getElementById(statDetailsId(rowId, petName));
    if (!row || !icon || !details) {
        return;
    }

    const key = `${petName}-${rowId}`;
    if (!enrollmentRowSnapshots.has(key)) {
        enrollmentRowSnapshots.set(key, {
            iconSrc: icon.src,
            detailsHtml: details.innerHTML,
        });
    }

    icon.src = getRandomEnrollErrorIcon();
    icon.classList.add('enrollment-error-icon');
    details.innerHTML = `<span class="enrollment-error-text">${escapeHtml(message)}</span>`;
    row.classList.add('enrollment-error-row');
    details.onclick = null;
}

function restoreEnrollmentRow(petName, rowId){
    const key = `${petName}-${rowId}`;
    const snapshot = enrollmentRowSnapshots.get(key);
    if (!snapshot) {
        return;
    }

    const row = document.getElementById(`${rowId}-${petName}`);
    const icon = row?.querySelector('.petStats-icon');
    const details = document.getElementById(statDetailsId(rowId, petName));
    if (!row || !icon || !details) {
        enrollmentRowSnapshots.delete(key);
        return;
    }

    icon.src = snapshot.iconSrc;
    icon.classList.remove('enrollment-error-icon');
    details.innerHTML = snapshot.detailsHtml;
    row.classList.remove('enrollment-error-row');
    enrollmentRowSnapshots.delete(key);

    const progressContainer = document.getElementById(`progress-${petName}`);
    if (progressContainer && progressContainer.innerHTML.trim() === '') {
        details.onclick = () => submitCourse(petName, ROW_COURSES[rowId]);
    }
}

function clearEnrollmentErrors(petName){
    for (const rowId of Object.values(COURSE_ROW_IDS)) {
        restoreEnrollmentRow(petName, rowId);
    }
}

function escapeHtml(text){
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function fetchStatusPage(){
    return fetch(`${SCHOOL.url}?type=status`, { credentials: 'include' }).then(r => r.text());
}

function refreshPetCard(petName, pageHtml){
    clearEnrollmentErrors(petName);

    const dataWrapper = document.createElement("div");
    dataWrapper.innerHTML = pageHtml;
    const petData = getPets(dataWrapper);
    const petStats = petData.get(petName);
    if (!petStats) {
        return;
    }

    captureStatBaseline(petName, petStats);

    const stored = petStorage.get(petName) || {};
    petStats.locked = stored.locked || false;
    petStorage.set(petName, { ...stored, ...petStats, locked: petStats.locked });
    storeMonkeyMap(PET_STORAGE, petStorage);

    updatePetStatDisplays(petName, petStats);

    const progressContainer = document.getElementById(`progress-${petName}`);
    if (petStats.petProgress.trim().length === 0) {
        progressContainer.innerHTML = "";
        setupEnrollmentHandlers(petName);
        syncPaymentCache(petStats);
        showPendingCompletionResult(petName);
    }
    else {
        clearCompletionResult(petName);
        teardownEnrollmentHandlers(petName);
        updateProgressCell(petStats);
    }
}

function updatePetStatDisplays(petName, petStats){
    document.getElementById(`enroll-name-${petName}`).innerHTML = `<b>${petStats.name}</b>`;
    document.getElementById(`enroll-cost-${petName}`).innerHTML =
        `<b>${petStats.petTitle ? petStats.petTitle : petStats.badge.cost}</b>`;
    document.getElementById(`enroll-hsd-${petName}`).innerHTML = `<b>${petStats.hsd}</b> HSD`;
    document.getElementById(`enroll-level-${petName}`).innerHTML =
        `Lvl : <font color="green"><b>${petStats.level}</b></font>`;
    document.getElementById(`enroll-hp-${petName}`).innerHTML = `Hp : <b>${petStats.hp}</b>`;
    document.getElementById(`enroll-strength-${petName}`).innerHTML = `Str : <b>${petStats.strength}</b>`;
    document.getElementById(`enroll-defence-${petName}`).innerHTML = `Def : <b>${petStats.defence}</b>`;
    document.getElementById(`enroll-badge-${petName}`).src = petStats.badge.image;

    for (const [rowId, iconUrl] of Object.entries(STAT_ROW_ICONS)) {
        const row = document.getElementById(`${rowId}-${petName}`);
        const icon = row?.querySelector('.petStats-icon');
        if (icon) {
            icon.src = iconUrl;
            icon.classList.remove('enrollment-error-icon');
            row.classList.remove('enrollment-error-row');
        }
    }

    for (const statId of ['level', 'hp', 'strength', 'defence']) {
        document.getElementById(`${statId}-${petName}`).classList.remove('recommended-stat');
    }
    formatRecommendedStat(petStats);
}

function setupEnrollmentHandlers(petName){
    for (const [rowId, course] of Object.entries(ROW_COURSES)) {
        const detailDiv = document.getElementById(statDetailsId(rowId, petName));
        detailDiv.onclick = () => submitCourse(petName, course);

        const row = document.getElementById(`${rowId}-${petName}`);
        row.classList.add('enrollable-stat');
        row.onmouseover = () => mouseOver(row);
        row.onmouseout = () => mouseOut(row);
    }
}

function teardownEnrollmentHandlers(petName){
    for (const rowId of Object.keys(ROW_COURSES)) {
        const detailDiv = document.getElementById(statDetailsId(rowId, petName));
        detailDiv.onclick = null;

        const row = document.getElementById(`${rowId}-${petName}`);
        row.classList.remove('enrollable-stat', 'stat-hover');
        row.onmouseover = null;
        row.onmouseout = null;
    }
}

function parsePaymentCosts(petProgressHtml){
    return parsePaymentItems(petProgressHtml).map(item => item.name);
}

function parsePaymentItems(petProgressHtml){
    const wrapper = document.createElement('div');
    wrapper.innerHTML = petProgressHtml;
    const items = [];
    for (const bold of wrapper.getElementsByTagName('b')) {
        const name = bold.innerText.trim();
        if (name.includes('Codestone') || name.includes('Dubloon')) {
            items.push({
                name,
                image: findPaymentItemImage(bold),
            });
        }
    }
    return items;
}

function findPaymentItemImage(bold){
    const name = bold.innerText.trim();

    if (name.includes('Codestone') || name.includes('Dubloon')) {
        const mapped = getPaymentIcon(name);
        if (mapped !== PAYMENT_ICON) {
            return mapped;
        }
    }

    let sibling = bold.nextElementSibling;
    while (sibling) {
        if (sibling.tagName === 'IMG' && sibling.src.includes('/items/')) {
            return sibling.src;
        }
        if (sibling.tagName === 'B') {
            break;
        }
        sibling = sibling.nextElementSibling;
    }

    sibling = bold.previousElementSibling;
    while (sibling) {
        if (sibling.tagName === 'IMG' && sibling.src.includes('/items/')) {
            return sibling.src;
        }
        sibling = sibling.previousElementSibling;
    }

    const cell = bold.closest('td') || bold.parentElement;
    if (cell) {
        const nodes = [...cell.querySelectorAll('img[src*="/items/"], b')];
        const index = nodes.indexOf(bold);
        if (index !== -1) {
            for (let i = index + 1; i < nodes.length; i++) {
                if (nodes[i].tagName === 'IMG') {
                    return nodes[i].src;
                }
                if (nodes[i].tagName === 'B') {
                    break;
                }
            }
            for (let i = index - 1; i >= 0; i--) {
                if (nodes[i].tagName === 'IMG') {
                    return nodes[i].src;
                }
                if (nodes[i].tagName === 'B') {
                    break;
                }
            }
        }
    }

    return getPaymentIcon(name);
}

function getPaymentItemRank(name){
    const index = PAYMENT_ITEM_ORDER.indexOf(name);
    return index === -1 ? PAYMENT_ITEM_ORDER.length : index;
}

function sortPaymentItems(items){
    return [...items].sort((a, b) => {
        const rankDiff = getPaymentItemRank(a.name) - getPaymentItemRank(b.name);
        return rankDiff !== 0 ? rankDiff : a.name.localeCompare(b.name);
    });
}

function aggregatePaymentItems(items){
    const map = new Map();
    for (const item of items) {
        const existing = map.get(item.name);
        if (existing) {
            existing.quantity += 1;
        }
        else {
            map.set(item.name, { name: item.name, image: item.image, quantity: 1 });
        }
    }
    return sortPaymentItems([...map.values()]);
}

function costsToMap(costs){
    const result = {};
    for (const cost of costs) {
        result[cost] = (result[cost] || 0) + 1;
    }
    return result;
}

function needsPayment(petProgressHtml){
    return petProgressHtml.includes('Codestone') || petProgressHtml.includes('Dubloon');
}

function isTrainingInProgress(petProgressHtml){
    return petProgressHtml.includes('Time till course finishes');
}

function clearPaymentCache(){
    GM_deleteValue(PAYMENT_STORAGE);
    GM_deleteValue(PAYMENT_PET);
}

function storePaymentForPet(petName, costs){
    GM_setValue(PAYMENT_STORAGE, JSON.stringify(costsToMap(costs)));
    GM_setValue(PAYMENT_PET, petName);
}

function syncPaymentCache(petStats){
    if (needsPayment(petStats.petProgress)) {
        storePaymentForPet(petStats.name, parsePaymentCosts(petStats.petProgress));
    }
    else if (isTrainingInProgress(petStats.petProgress) || petStats.petProgress.trim().length === 0) {
        clearPaymentCache();
    }
}

function getSdbCategory(itemName){
    return itemName.includes('Codestone') ? 2 : 3;
}

function isSuperShopWizardAvailable(){
    return !!(document.querySelector('#searchstr') && document.querySelector('#ssw-criteria'));
}

function getShopWizardUrl(itemName){
    return `https://www.neopets.com/shops/wizard.phtml?string=${encodeURIComponent(itemName)}`;
}

function getSdbCategoryUrl(costs){
    const firstName = Object.keys(costs)[0] || '';
    const category = getSdbCategory(firstName);
    return `https://www.neopets.com/safetydeposit.phtml?obj_name=&category=${category}`;
}

function openSuperShopWizard(itemName){
    const bar = $("[class^='ssw-header']");
    if (bar.length) {
        bar.last().parent().show();
    }
    $("#ssw-button-new-search").click();
    $("#ssw-criteria").val("exact");
    $("#searchstr").val(itemName);
}

function getPaymentIcon(itemName){
    if (itemName.includes('Codestone')) {
        return CODESTONE_ICONS[itemName] || PAYMENT_ICON;
    }
    if (itemName.includes('Dubloon')) {
        return 'https://images.neopets.com/items/dubloon1.gif';
    }
    return PAYMENT_ICON;
}

function createPaymentTileGrid(petName, costs, paymentItems){
    const grid = document.createElement('div');
    grid.classList.add('training-payment-grid');

    for (const item of paymentItems) {
        grid.appendChild(createPaymentTile(petName, costs, item));
    }

    return grid;
}

function createPaymentTile(petName, costs, item){
    const link = document.createElement('a');
    link.classList.add('training-payment-tile');
    link.href = getShopWizardUrl(item.name);
    link.target = '_blank';
    link.title = `${item.name} — search Shop Wizard`;
    link.onclick = (e) => {
        storePaymentForPet(petName, costs);
        if (isSuperShopWizardAvailable()) {
            e.preventDefault();
            openSuperShopWizard(item.name);
        }
    };

    const inner = document.createElement('div');
    inner.classList.add('training-payment-tile-inner');

    const img = document.createElement('img');
    img.classList.add('training-payment-item-img');
    img.src = item.image;
    img.alt = item.name;
    inner.appendChild(img);

    const qty = document.createElement('span');
    qty.classList.add('training-payment-qty');
    qty.innerText = String(item.quantity);
    inner.appendChild(qty);

    link.appendChild(inner);
    return link;
}

function createProgressButton(label, className){
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('training-progress-btn', className);
    button.innerText = label;
    return button;
}

function captureStatBaseline(petName, petStats){
    if (!petStats) {
        return;
    }
    statBaselines.set(petName, {
        level: petStats.level,
        strength: petStats.strength,
        defence: petStats.defence,
        hp: petStats.hp,
    });
}

function getStoredPetStats(petName){
    const baseline = statBaselines.get(petName);
    if (!baseline) {
        return null;
    }

    return {
        level: baseline.level,
        strength: baseline.strength,
        defence: baseline.defence,
        hp: baseline.hp,
    };
}

function normalStatGain(statId){
    return statId === 'hp' ? SCHOOL.hpMult : 1;
}

function buildCompletionResultHtml(oldStats, newStats, completionHtml){
    const deltas = [];
    for (const statId of ['level', 'hp', 'strength', 'defence']) {
        const delta = newStats[statId] - oldStats[statId];
        if (delta > 0) {
            deltas.push({
                label: COMPLETION_STAT_LABELS[statId],
                from: oldStats[statId],
                to: newStats[statId],
                delta,
                isSuperBonus: delta > normalStatGain(statId),
            });
        }
    }

    if (deltas.length > 0) {
        let html = '<div class="training-completion-title">Course complete!</div>';
        for (const change of deltas) {
            const bonusClass = change.isSuperBonus ? ' training-completion-super-bonus' : '';
            const bonusTag = change.isSuperBonus
                ? ' <span class="training-completion-super-bonus-tag">SUPER BONUS!</span>'
                : '';
            html += `<div class="training-completion-stat${bonusClass}">${escapeHtml(change.label)}: `
                + `${change.from} → ${change.to} (+${change.delta})${bonusTag}</div>`;
        }
        return wrapCompletionResultHtml(html);
    }

    const pageText = parseCompletionPageText(completionHtml);
    if (pageText) {
        return wrapCompletionResultHtml(`<div class="training-completion-title">Course complete!</div>`
            + `<div class="training-completion-stat">${escapeHtml(pageText)}</div>`);
    }

    return wrapCompletionResultHtml('<div class="training-completion-title">Course complete!</div>');
}

function parseCompletionPageText(completionHtml){
    if (!completionHtml || typeof completionHtml !== 'string') {
        return null;
    }

    const wrapper = document.createElement('div');
    wrapper.innerHTML = completionHtml;
    const content = wrapper.querySelector('.content') || wrapper;
    const lines = content.innerText
        .split(/\n+/)
        .map(line => line.trim())
        .filter(line => line.length > 5 && line.length < 300);

    for (const line of lines) {
        if (/super bonus|gained|increased|now has|level is now|hit points|strength|defence|defense|endurance/i.test(line)
            && !/training school|status|click here|back to/i.test(line)) {
            return line;
        }
    }

    return null;
}

function wrapCompletionResultHtml(bodyHtml){
    return `<div class="training-completion-result">${bodyHtml}</div>`;
}

function showPendingCompletionResult(petName){
    const resultHtml = pendingCompletionResults.get(petName);
    if (!resultHtml) {
        return;
    }

    const progressContainer = document.getElementById(`progress-${petName}`);
    if (progressContainer) {
        progressContainer.innerHTML = resultHtml;
    }
}

function clearCompletionResult(petName){
    pendingCompletionResults.delete(petName);
    const progressContainer = document.getElementById(`progress-${petName}`);
    if (progressContainer?.querySelector('.training-completion-result')) {
        progressContainer.innerHTML = '';
    }
}

async function completeAndRefresh(petName){
    const oldStats = getStoredPetStats(petName);
    const completionHtml = await processCourse(petName, 'complete');
    const html = await fetchStatusPage();

    const dataWrapper = document.createElement('div');
    dataWrapper.innerHTML = html;
    const newPetStats = getPets(dataWrapper).get(petName);

    if (oldStats && newPetStats) {
        pendingCompletionResults.set(
            petName,
            buildCompletionResultHtml(oldStats, newPetStats, completionHtml),
        );
    }
    else {
        const pageText = parseCompletionPageText(completionHtml);
        if (pageText) {
            pendingCompletionResults.set(
                petName,
                wrapCompletionResultHtml(
                    `<div class="training-completion-title">Course complete!</div>`
                    + `<div class="training-completion-stat">${escapeHtml(pageText)}</div>`,
                ),
            );
        }
    }

    refreshPetCard(petName, html);
}

async function payAndRefresh(petName){
    clearCompletionResult(petName);
    await processCourse(petName, 'pay');
    const html = await fetchStatusPage();
    refreshPetCard(petName, html);
}

function handleSdbPage(){
    const costString = GM_getValue(PAYMENT_STORAGE, '{}');
    const costs = JSON.parse(costString);
    if (!costs || Object.keys(costs).length === 0) {
        return;
    }

    fillSdbForm(costs);
    showCostsOnSdb(costs);
    preselectMoveToInventory();
}

function fillSdbForm(costs){
    const legacyInputs = document.querySelectorAll('input.remove_safety_deposit');
    if (legacyInputs.length > 0) {
        for (const removeInput of legacyInputs) {
            const name = getSdbItemNameFromLegacyRow(removeInput);
            if (name in costs) {
                const available = Number(removeInput.dataset.total_count || removeInput.getAttribute('data-total_count') || costs[name]);
                removeInput.value = Math.min(costs[name], available);
                removeInput.setAttribute('data-remove_val', 'y');
            }
        }
        return;
    }

    for (const row of findSdbItemRows()) {
        const name = getSdbItemNameFromRow(row);
        if (!(name in costs)) {
            continue;
        }

        const quantityInput = row.querySelector('input[type="text"], input[type="number"]');
        const checkbox = row.querySelector('input[type="checkbox"]');
        const available = getSdbAvailableCount(row, quantityInput);
        const removeCount = Math.min(costs[name], available || costs[name]);

        if (quantityInput) {
            quantityInput.value = removeCount;
            quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
            quantityInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (checkbox) {
            checkbox.checked = removeCount > 0;
        }
    }
}

function showCostsOnSdb(costs){
    const sortedCosts = Object.keys(costs).sort((a, b) => {
        const rankDiff = getPaymentItemRank(a) - getPaymentItemRank(b);
        return rankDiff !== 0 ? rankDiff : a.localeCompare(b);
    });
    for (const cost of sortedCosts) {
        const itemNameB = [...document.getElementsByTagName('b')].find(b => b.innerText.trim().startsWith(cost));
        if (!itemNameB) {
            continue;
        }
        const row = itemNameB.closest('tr') || itemNameB.parentElement;
        if (!row || row.querySelector('.training-needed-count')) {
            continue;
        }
        const neededEl = document.createElement('b');
        neededEl.classList.add('training-needed-count');
        neededEl.innerText = `Need x${costs[cost]}`;
        row.appendChild(document.createElement('br'));
        row.appendChild(neededEl);
    }
}

function preselectMoveToInventory(){
    for (const select of document.querySelectorAll('select')) {
        for (const option of select.options) {
            if (/move to inventory/i.test(option.text)) {
                select.value = option.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }
        }
    }
}

function findSdbItemRows(){
    const content = document.querySelector('.content');
    if (!content) {
        return [];
    }
    return [...content.querySelectorAll('tr')].filter(row => {
        return row.querySelector('b') && row.querySelector('input[type="text"], input[type="number"], input.remove_safety_deposit');
    });
}

function getSdbItemNameFromLegacyRow(removeInput){
    const nameTd = removeInput.parentElement?.previousElementSibling?.previousElementSibling?.previousElementSibling?.previousElementSibling;
    return nameTd ? nameTd.innerText.split('\n')[0].trim() : '';
}

function getSdbItemNameFromRow(row){
    const bold = row.querySelector('b');
    return bold ? bold.innerText.split('\n')[0].trim() : '';
}

function getSdbAvailableCount(row, quantityInput){
    if (quantityInput?.dataset?.total_count) {
        return Number(quantityInput.dataset.total_count);
    }
    const qtyBold = [...row.querySelectorAll('b')].find(b => /^\d+$/.test(b.innerText.trim()));
    return qtyBold ? Number(qtyBold.innerText.trim()) : null;
}

function togglePetLock(petName){
    let petStats = petStorage.get(petName);
    petStats.locked = !petStats.locked;
    petStorage.set(petName, petStats);
    storeMonkeyMap(PET_STORAGE, petStorage);

    // Change the lock button
    let lockImage = document.getElementById(`enroll-lock-${petName}`);
    lockImage.src = getLockIcon(petStats.locked);

    // Update the treatment for the petContainer
    const petContainer = document.getElementById(`petContainer-${petName}`);
    petContainer.classList.add(petStats.locked ? "locked" : "unlocked");
    petContainer.classList.remove(petStats.locked ? "unlocked" : "locked");

    // Progress Cell needs to change inertness
    const progressCell = document.getElementById(`progress-${petName}`);
    progressCell.inert = petStats.locked;
}

function storeMonkeyMap(key, mapToStore){
    GM_setValue(key, JSON.stringify(Array.from(mapToStore.entries())));
}

function sortPetMap(mapToSort){
    let sortedArray = Array.from(mapToSort);

    // Sort by HSD first
    if (OPT_SORT_ORDER == "DESC"){
        sortedArray = sortedArray.sort((firstPet, secondPet) => secondPet[1].hsd - firstPet[1].hsd);
    }
    else {
        sortedArray = sortedArray.sort((firstPet, secondPet) => firstPet[1].hsd - secondPet[1].hsd);
    }

    // Suppress locked && graduated pets
    if (OPT_SORT_ORDER == "DESC") {
        let elevatedPets = [];
        let noChangesPets = [];
        let suppressedPets = [];
        for(let pet of sortedArray){
            if(pet[1].locked || hasGraduated(pet[1])) {
                suppressedPets.push(pet);
            }
            else if (pet[1].petProgress.trim().length > 0)
            {
                elevatedPets.push(pet);
            }
            else {
                noChangesPets.push(pet);
            }
        }

        sortedArray = elevatedPets.concat(noChangesPets).concat(suppressedPets);
    }

    return new Map(sortedArray);
}

function reformatPetTitle(petStats, petTitle){
    let petTitleTokens = petTitle.split(" ");

    // 0. petName 1. (Level 2. number) 3. is 4. currently 5. studying 6. course
    if (petTitleTokens.length === 7){
        petTitleTokens = petTitleTokens.slice(5);
        return capitalizeFirstLetter(petTitleTokens.join(' ').trim());
    }
    else {
        return "";
    }
}

function getPetStats(petCell){
    let rawStats = Array.from(petCell.getElementsByTagName("b"));
    let stats = {
        level: Number(rawStats[0].innerHTML),
        strength: Number(rawStats[1].innerHTML),
        defence: Number(rawStats[2].innerHTML),
        hp: parseMaxHp(rawStats),
    }

    // Figure out the next stat
    stats.recommendNext = recommendNext(stats);

    // HSD
    stats.hsd = stats.hp + Math.min(stats.strength, 850) + Math.min(stats.defence, 850);

    return stats;
}

function parseMaxHp(rawStats){
    const hpBold = rawStats[4];
    if (!hpBold) {
        return NaN;
    }

    const hpText = hpBold.innerHTML.trim();
    if (hpText.includes('/')) {
        return Number(hpText.split('/').pop());
    }

    const maxBold = rawStats[5];
    if (maxBold && /^\d+$/.test(hpText) && /^\d+$/.test(maxBold.innerHTML.trim())) {
        return Number(maxBold.innerHTML.trim());
    }

    return Number(hpText);
}

/**
 * Decided to only ever recommend even training, if you want to do something else you won't be blocked unless you've already graduated anyways.
 * This also means we're ignoring the 3x hp bonus in all schools except Ninja.
 */
function recommendNext(petStats){
    if (!hasGraduated(petStats)){
        if (highestStat(petStats) === "level"){
            return "level";
        }

        const recommendedStat = lowestStat(petStats);

        // Check that lowest stat is actually trainable. If not, recommend level.
        if (recommendedStat !== "hp" && petStats.hp > petStats.level * 2){
            return "level";
        }
        else {
            return recommendedStat;
        }
    }

    return "NONE";
}

function hasGraduated(petStats){
    // Has Graduated if any of their stats exceed trainability in the school.
    return (SCHOOL.graduateLevel && (
        petStats.level > SCHOOL.graduateLevel
        || petStats.hp > SCHOOL.hpMult * SCHOOL.graduateLevel
        || petStats.defence > SCHOOL.graduateLevel * 2
        || petStats.strength > SCHOOL.graduateLevel * 2)
    );
}

function highestStat(petStats){
    return findOutlier("max", petStats);
}

function lowestStat(petStats){
    return findOutlier("min", petStats);
}

function findOutlier(mode, petStats){
    let outlierKey = "hp";
    let outlierValue = petStats.hp;
    for (const [key, stat] of Object.entries(petStats)) {
        // Endurance and level are uncapped, and level will be decided later
        if (key === "level" || ((key !== "hp" && stat > 850))){
            continue;
        }

        if (mode === "min" ? stat < outlierValue : stat > outlierValue){
            outlierKey = key;
            outlierValue = stat;
        }
    }

    // You always need to level first if the outlier is too big, but if it's hp the multiplier is different.
    if (outlierKey === "hp" && petStats.level < outlierValue / SCHOOL.hpMult
        || (outlierKey !== "hp" && petStats.level < outlierValue / 2)){
        outlierKey = "level";
        outlierValue = petStats.level;
    }

    return outlierKey;
}

function formatRecommendedStat(petStats){
    const recommendedStat = document.getElementById(`${petStats.recommendNext}-${petStats.name}`)
    if (recommendedStat){
        recommendedStat.classList.add("recommended-stat");
    }
}

function formatStat(key, petStats){
    if (key === petStats.recommendNext){
        return `&gt;${petStats[key]}&lt;`;
    }
    else{
        return petStats[key];
    }
}

function detectSchool(){
    if (document.URL.includes(SCHOOL_SETTINGS.get(SCHOOL_ISLAND).url)){
        return SCHOOL_SETTINGS.get(SCHOOL_ISLAND);
    }
    else if (document.URL.includes(SCHOOL_SETTINGS.get(SCHOOL_NINJA).url)){
        return SCHOOL_SETTINGS.get(SCHOOL_NINJA);
    }

    return SCHOOL_SETTINGS.get(SCHOOL_SWASHBUCKLING);
}

function mouseOver(element) {
    element.classList.add("stat-hover");
}

function mouseOut(element) {
    element.classList.remove("stat-hover");
}

function getLockIcon(locked){
    return locked ? LOCKED_IMAGE : UNLOCKED_IMAGE;
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function updateProgressCell(petStats){
    const progressContainer = document.getElementById(`progress-${petStats.name}`);
    progressContainer.inert = petStats.locked;
    progressContainer.innerHTML = "";

    if (petStats.petProgress.includes('Course Finished!')){
        const completeCourseBtn = createProgressButton('Complete Course!', 'complete-course');
        completeCourseBtn.onclick = () => completeAndRefresh(petStats.name);
        progressContainer.appendChild(completeCourseBtn);
        return;
    }

    if (needsPayment(petStats.petProgress)){
        const costs = parsePaymentCosts(petStats.petProgress);
        const paymentItems = aggregatePaymentItems(parsePaymentItems(petStats.petProgress));
        storePaymentForPet(petStats.name, costs);

        progressContainer.appendChild(createPaymentTileGrid(petStats.name, costs, paymentItems));

        const actionRow = document.createElement('div');
        actionRow.classList.add('training-progress-actions');

        const sdbBtn = createProgressButton('SDB', 'sdb-course');
        sdbBtn.title = costs.some(c => c.includes('Codestone'))
            ? 'Open codestones in the Safety Deposit Box'
            : 'Open dubloons in the Safety Deposit Box';
        sdbBtn.onclick = () => window.open(getSdbCategoryUrl(costsToMap(costs)), '_blank');
        actionRow.appendChild(sdbBtn);

        const payBtn = createProgressButton('Pay', 'pay-course');
        payBtn.onclick = () => payAndRefresh(petStats.name);
        actionRow.appendChild(payBtn);

        const cancelBtn = createProgressButton('Cancel', 'cancel-course');
        cancelBtn.onclick = async () => {
            clearCompletionResult(petStats.name);
            await processCourse(petStats.name, 'cancel');
            const html = await fetchStatusPage();
            refreshPetCard(petStats.name, html);
        };
        actionRow.appendChild(cancelBtn);

        progressContainer.appendChild(actionRow);
        return;
    }

    progressContainer.innerHTML = petStats.petProgress;
    syncPaymentCache(petStats);
}

// Options are 'pay', 'cancel', and 'complete'
async function processCourse(petName, option) {
    const url = `process_${location.pathname.split('/').pop()}?type=${option}&pet_name=${petName}`;

    try {
        const response = await fetch(url);

        return response.text();
    } catch (error) {
        console.error(error.message);
        return error;
    }
}

function setUpClasses(){
    let styleTag = document.getElementsByTagName("style")[0];
    styleTag.innerHTML += " .locked { background-color: #efefef; } ";
    styleTag.innerHTML += " .unlocked { background-color: white; } ";
    styleTag.innerHTML +=
    ` .training-outer-container {
           display: grid;
           grid-template-columns: auto auto;
           width: 800;
           margin: auto;
           padding: 0;
      }
      .pet-container {
           display: grid;
           width: 350;
           margin: 0;
           padding: 0;
           align-items: center;
      }
      .status-cell {
         text-align: center;
         justify-items: center;
         padding: 3px;
      }
      .lock-container {
        text-align: right;
        padding: 3px;
      }
      .stat-hover{
       border: 3px solid #A9A9A9;
       background-color: #E6E4DD !important;
      }
      .stat-hover img{
       border: 3px solid #A9A9A9;
      }
      .petStats-icon {
        float: left;
        width: 25px;
        height: 25px;
        border: 3px solid #DFC5FE;
        background-color: white;
        border-radius: 50%;
        box-shadow: 0 0 8px rgba(0, 0, 0, .8);
      }
      .petStats-details {
        padding-top: 7px;
        padding-bottom: 7px;
        text-align: left;
      }
      .petStats-stats {
        margin: 15px auto 10px;
        width: 90%;
        height: auto;
        box-sizing: border-box;
        padding: 10px;
        border-radius: 15px;
        background-color: #E6E4DD;
        display: block
      }
      .petStats-row {
        margin: 5px auto 5px;
        width: 90%;
        height: 30px;
        border-radius: 15px;
        box-sizing: content-box;
        display: grid;
        grid-template-columns: auto 90%;
        grid-gap: 3px;
        font-size: 10pt;
        text-align: left;
        background-color: white;
      }
      .petStats-progress {
        margin: 5px auto 5px;
        width: 90%;
        height: auto;
        border-radius: 15px;
        box-sizing: content-box;
        grid-gap: 3px;
        background-color: white;
      }
      .recommended-stat{
        background-color: #90EE90
      }
      .enrollable-stat {
        cursor: pointer;
      }
      .training-payment-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(68px, 1fr));
        gap: 6px;
        padding: 10px 8px 6px;
        justify-items: center;
      }
      .training-payment-tile {
        position: relative;
        display: block;
        width: 64px;
        text-decoration: none;
        color: inherit;
        cursor: pointer;
      }
      .training-payment-tile-inner {
        position: relative;
        width: 64px;
        height: 64px;
        background: linear-gradient(180deg, #faf8ff 0%, #f0ebfa 100%);
        border: 2px solid #dfc5fe;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
        transition: transform 0.1s ease, box-shadow 0.1s ease;
      }
      .training-payment-tile:hover .training-payment-tile-inner,
      .training-payment-tile:focus .training-payment-tile-inner {
        transform: translateY(-1px);
        box-shadow: 0 2px 6px rgba(107, 63, 160, 0.25);
        border-color: #b894f0;
      }
      .training-payment-item-img {
        max-width: 48px;
        max-height: 48px;
        image-rendering: pixelated;
      }
      .training-payment-qty {
        position: absolute;
        top: -5px;
        right: -5px;
        min-width: 20px;
        height: 20px;
        padding: 0 5px;
        border-radius: 10px;
        background: #6b3fa0;
        color: #fff;
        font-size: 10px;
        font-weight: bold;
        line-height: 20px;
        text-align: center;
        border: 2px solid #fff;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        pointer-events: none;
      }
      .training-progress-actions {
        display: flex;
        gap: 8px;
        justify-content: center;
        padding: 8px;
      }
      .training-progress-btn {
        padding: 4px 10px;
        border-radius: 8px;
        border: 1px solid #A9A9A9;
        background-color: white;
        cursor: pointer;
      }
      .training-progress-btn.complete-course {
        background-color: #90EE90;
      }
      .training-progress-btn.pay-course {
        background-color: #FFD580;
      }
      .training-progress-btn.sdb-course {
        background-color: #E6E4DD;
      }
      .training-needed-count {
        color: #8B0000;
      }
      .enrollment-error-row {
        background-color: #fff0f0 !important;
        border: 2px solid #cc0000;
      }
      .enrollment-error-icon {
        border-color: #cc0000 !important;
        background-color: #ffe6e6 !important;
        box-shadow: 0 0 8px rgba(204, 0, 0, .8);
      }
      .enrollment-error-text {
        color: #cc0000;
        font-weight: bold;
        font-size: 9pt;
        line-height: 1.2;
        display: block;
        text-align: left;
        white-space: normal;
      }
      .training-completion-result {
        padding: 10px 8px 8px;
        text-align: center;
      }
      .training-completion-title {
        font-weight: bold;
        margin-bottom: 6px;
      }
      .training-completion-stat {
        font-size: 10pt;
        margin: 4px 0;
        line-height: 1.3;
      }
      .training-completion-super-bonus {
        color: #2d6a1f;
        font-weight: bold;
      }
      .training-completion-super-bonus-tag {
        color: #b8860b;
        font-weight: bold;
      }
      `
    ;
}