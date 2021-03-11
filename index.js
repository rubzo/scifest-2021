// Configurable?
let NUM_TISSUES = 3;
let TISSUE_WIDTH = 5;
let TISSUE_HEIGHT = 10;
let ALL_TISSUE_WIDTH = TISSUE_WIDTH * NUM_TISSUES;
let NUM_INITIAL_VIRUS_ATTRS = 1;
let NUM_CARDS_TO_DRAFT_FROM_PER_TURN = 3;
let NUM_CARDS_TO_SELECT_IN_DRAFT_PER_TURN = 2;
let MAX_MUTATION_ATTEMPTS = 2;
let NUM_SUCCESSFUL_COIN_FLIPS_TO_MUTATE = 3; // 12.5% chance virus mutates
let STATE_TRANSITION_WAIT = 4000; // Make super slow for now, optimise later.

// Game presentation related vars
let gridDivs = [];

// General helpers
function randomN(n) {
    return Math.floor(Math.random() * n);
}

function percentChance(percent) {
    return randomN(100) < percent;
}

function coinFlip() {
    return percentChance(50);
}


function randomElement(ar) {
    return ar[randomN(ar.length)];
}

// Game state related vars
let gameState = null;

// Game state related functions
const CellStates = {
    CLEAN: 1,
    INFECTED: 2,
}

const PlayStates = {
    PICKING_INITIAL_VIRUS_TRAITS: 1,
    // -> PICKING_INITIAL_IMMUNE_TRAITS
    PICKING_INITIAL_IMMUNE_TRAITS: 2,
    // -> ASSIGNING_INITIAL_IMMUNE_TRAITS
    ASSIGNING_INITIAL_IMMUNE_TRAITS: 3,
    // -> VIRUS_MOVES_SIDEWAYS_READY

    VIRUS_MOVES_SIDEWAYS_READY: 41,
    VIRUS_MOVES_SIDEWAYS_ACTIVE: 42,
    VIRUS_MOVES_SIDEWAYS_DONE: 43,
    // -> PLAYER_DRAW_PHASE_READY

    PLAYER_DRAW_PHASE_READY: 51,
    PLAYER_DRAW_PHASE_SHOWING_CARDS: 52,
    PLAYER_DRAW_PHASE_DONE: 53,
    // -> PLAYER_PLAY_PHASE_READY

    PLAYER_PLAY_PHASE_READY: 61,
    PLAYER_PLAY_PHASE_WAITING: 62,
    PLAYER_PLAY_PHASE_INTERACTING: 63,
    PLAYER_PLAY_PHASE_DONE: 64,
    // -> VIRUS_MUTATION_READY

    VIRUS_MUTATION_READY: 71,
    VIRUS_MUTATION_ACTIVE: 72,
    VIRUS_MUTATION_DONE: 73,
    // -> VIRUS_MOVES_DOWN_READY

    VIRUS_MOVES_DOWN_READY: 81,
    VIRUS_MOVES_DOWN_ACTIVE: 82,
    // -> VIRUS_MOVES_DOWN_ACTIVE
    // -> BODY_DEFEATED
    // -> VIRUS_DEFEATED
    VIRUS_MOVES_DOWN_DONE: 83,
    // -> VIRUS_MOVES_SIDEWAYS_READY

    BODY_DEFEATED: 9,
    VIRUS_DEFEATED: 100,
}

class Cell {
    constructor() {
        this.state = CellStates.CLEAN;
        // This indicates that an immunity card is affecting this cell.
        this.attribute = null;
    }

    markInfected() {
        this.state = CellStates.INFECTED;
    }

    isInfected() {
        return this.state === CellStates.INFECTED;
    }

    isClean() {
        return this.state === CellStates.CLEAN;
    }
};

function generateGameStateGrid() {
    let grid = [];
    for (let row = 0; row < TISSUE_HEIGHT; row++) {
        grid.push([]);
        for (let column = 0; column < ALL_TISSUE_WIDTH; column++) {
            grid[row].push(new Cell());
        }
    }
    return grid;
}

function placeVirusOnGrid(row, column) {
    gameState.grid[row][column].markInfected();
}


function areAnyCellsInRowClean(row) {
    let cleanCells = gameState.grid[row].filter(cell => cell.isClean());
    return cleanCells.length > 0;
}

function areAnyCellsInRowInfected(row) {
    let infectedCells = gameState.grid[row].filter(cell => cell.isInfected());
    return infectedCells.length > 0;
}

function virusHasWon() {
    return areAnyCellsInRowInfected(TISSUE_HEIGHT - 1);
}

function doesVirusHaveAnyAttackPoints() {
    return findValidVirusAttackPoints().length > 0;
}

function findValidVirusAttackPoints() {
    let attackPoints = [];
    for (let row = TISSUE_HEIGHT - 2; row >= 0; row--) {
        if (areAnyCellsInRowInfected(row)) {
            for (let column = 0; column < ALL_TISSUE_WIDTH; column++) {
                // TODO: improve this logic
                if (gameState.grid[row][column].isInfected()
                    && gameState.grid[row + 1][column].isClean()) {
                    attackPoints.push([row + 1, column]);
                }
            }
        }
    }
    return attackPoints;
}

function doesVirusHaveAnySpawnPoints() {
    return findValidVirusSpawnPoints().length > 0;
}

function findValidVirusSpawnPoints() {
    let validIndices = [];

    let tropisms = gameState.virusAttributes.filter(
        attr => attr.kind == "Tropism"
    );
    tropisms.forEach(function (tropismAttr, _) {
        let start = 0;
        let end = 0;
        switch (tropismAttr.name) {
            case "Liver Tropism":
                start = 0;
                end = start + TISSUE_WIDTH;
                break;
            case "Lung Tropism":
                start = TISSUE_WIDTH;
                end = start + TISSUE_WIDTH;
                break;
            case "Intestine Tropism":
                start = TISSUE_WIDTH * 2;
                end = start + TISSUE_WIDTH;
                break;
        }

        for (let row = TISSUE_HEIGHT - 2; row >= 0; row--) {
            for (let column = start; column < end; column++) {
                if (gameState.grid[row][column].isClean()) {
                    if (column != 0 && gameState.grid[row][column - 1].isInfected()) {
                        validIndices.push([row, column]);
                    } else if (column != (ALL_TISSUE_WIDTH - 1)
                        && gameState.grid[row][column + 1].isInfected()) {
                        validIndices.push([row, column]);
                    }
                }
            }
        }
    });

    return validIndices;
}

function generateInitialVirusAttributes() {
    let attrs = [];
    let pool = Object.values(virusAttributePool);

    // Add all the virus attributes that there must be a minimum number of!
    // TODO: actually just spawn one or two tropisms based on difficulty!
    for (var kindRuleName of Object.keys(virusKindRules)) {
        let kindRule = virusKindRules[kindRuleName];
        let added = 0;
        while (added < kindRule.min) {
            let filteredPool = pool.filter(attr => attr.kind == kindRuleName);
            let randomAttr = randomElement(filteredPool);
            attrs.push(randomAttr);
            added++;
        }
    }

    return attrs;
}

function mutateVirus() {
    // TODO: make this obey the virus rules
    if (percentChance(60)) {
        // adding...
        let pool = Object.values(virusAttributePool);
        let newAttr = randomElement(pool);
        newAttr.applyEffects()
        gameState.virusAttributes.push(newAttr);
        gameState.virusAttributesChanged = true;
        toastMessage(`Virus gained ${newAttr.name}!`)
    } else {
        if (percentChance(75)) {
            // replacing...
            let attrToReplace = randomElement(gameState.virusAttributes);
            let newVirusAttributes = gameState.virusAttributes.filter(
                attr => attr != attrToReplace
            );
            let pool = Object.values(virusAttributePool);
            let filteredPool = pool.filter(
                attr => attr.kind == attrToReplace.kind
            );
            let replacementAttr = randomElement(filteredPool);
            newVirusAttributes.push(replacementAttr);
            gameState.virusAttributes = newVirusAttributes;
            gameState.virusAttributesChanged = true;
            attrToReplace.removeEffects();
            replacementAttr.applyEffects();
            toastMessage(`Virus lost ${attrToReplace.name}, and gained ${replacementAttr.name}!`)
        } else {
            // removing...
            let attrToRemove = randomElement(gameState.virusAttributes);
            let newVirusAttributes = gameState.virusAttributes.filter(
                attr => attr != attrToRemove
            );
            gameState.virusAttributes = newVirusAttributes;
            gameState.virusAttributesChanged = true;
            attrToRemove.removeEffects();
            toastMessage(`Virus lost ${attrToRemove.name}!`)
        }
    }
    updateUI();
}

function generateInitialImmuneAttributes() {
    return [];
}

function placeVirusBasedOnAttributes() {
    let loc = -1;
    let tropismAttr = gameState.virusAttributes.filter(attr => attr.kind == "Tropism")[0];
    switch (tropismAttr.name) {
        case "Liver Tropism":
            loc = randomN(TISSUE_WIDTH);
            break;
        case "Lung Tropism":
            loc = (TISSUE_WIDTH * 1) + randomN(TISSUE_WIDTH);
            break;
        case "Intestine Tropism":
            loc = (TISSUE_WIDTH * 2) + randomN(TISSUE_WIDTH);
            break;
    }
    placeVirusOnGrid(0, loc);
}

function switchPlayState(newState) {
    // TODO: checking state transitions are valid
    gameState.state = newState;
}

function setupGame() {
    gameState = {
        grid: generateGameStateGrid(),
        virusAttributes: [],
        virusAttributesChanged: false,
        replicationSpeed: 8,
        activeImmuneAttributes: [],
        inactiveImmuneAttributes: [],
        activeImmuneAttributesChanged: false,
        inactiveImmuneAttributesChanged: false,
        state: PlayStates.PICKING_INITIAL_VIRUS_TRAITS,
        playerDraftPool: [],
        numCardsSelectedInDraftPool: 0,
    }

    // TODO: this will be factored into the whole
    // 'timeout(continueBasedOnCurrentState)' thing
    gameState.virusAttributes = generateInitialVirusAttributes();
    gameState.virusAttributesChanged = true;
    placeVirusBasedOnAttributes();

    // These will probably actually go
    switchPlayState(PlayStates.PICKING_INITIAL_IMMUNE_TRAITS);
    switchPlayState(PlayStates.ASSIGNING_INITIAL_IMMUNE_TRAITS);

    switchPlayState(PlayStates.VIRUS_MOVES_SIDEWAYS_READY);

    continueBasedOnCurrentState();
}

function playerDraftedCard(card) {
    gameState.playerDraftPool = gameState.playerDraftPool.filter(
        cardInPool => cardInPool != card
    );
    gameState.inactiveImmuneAttributes.push(card);
    gameState.inactiveImmuneAttributesChanged = true;
    gameState.numCardsSelectedInDraftPool++;
}

function checkIfFinishedDrafting() {
    if (gameState.numCardsSelectedInDraftPool == NUM_CARDS_TO_SELECT_IN_DRAFT_PER_TURN) {
        switchPlayState(PlayStates.PLAYER_DRAW_PHASE_DONE);
        finishedHandlingState();
        return true;
    }
    return false;
}

//
// State handlers
//
let handlers = {};
function continueBasedOnCurrentState() {
    if (handlers[gameState.state] != undefined) {
        handlers[gameState.state]();
    }
}

function finishedHandlingState(delay) {
    if (delay === undefined) {
        delay = STATE_TRANSITION_WAIT;
    }
    setTimeout(continueBasedOnCurrentState, delay);
}

handlers[PlayStates.VIRUS_MOVES_SIDEWAYS_READY] = function () {
    gameState.replicationAttempts = 0;
    switchPlayState(PlayStates.VIRUS_MOVES_SIDEWAYS_ACTIVE);
    toastMessage("Virus is trying to spread to other cells!");
    finishedHandlingState(500);
}

handlers[PlayStates.VIRUS_MOVES_SIDEWAYS_ACTIVE] = function () {
    if (gameState.replicationAttempts == gameState.replicationSpeed) {
        switchPlayState(PlayStates.VIRUS_MOVES_SIDEWAYS_DONE);
    } else {
        if (!doesVirusHaveAnySpawnPoints()) {
            switchPlayState(PlayStates.VIRUS_MOVES_SIDEWAYS_DONE);
        } else {
            if (coinFlip()) {
                let virusSpawnPoints = findValidVirusSpawnPoints();
                if (virusSpawnPoints.length != 0) {
                    let newSpawnLoc = randomElement(virusSpawnPoints);
                    //toastMessage("Virus has replicated!");
                    placeVirusOnGrid(newSpawnLoc[0], newSpawnLoc[1]);
                }
            } else {
                //toastMessage("Virus is continuing to try to replicate...");
            }
            gameState.replicationAttempts++;
            updateUI();
        }
    }
    finishedHandlingState(500);
}

handlers[PlayStates.VIRUS_MOVES_SIDEWAYS_DONE] = function () {
    gameState.replicationAttempts = 0;
    switchPlayState(PlayStates.PLAYER_DRAW_PHASE_READY);
    toastMessage("Virus has finished spreading for now!");
    finishedHandlingState();
}

handlers[PlayStates.PLAYER_DRAW_PHASE_READY] = function () {
    // TODO: we should only add cards that don't break card selection rules!!
    let pool = Object.values(immuneAttributePool);

    gameState.playerDraftPool = [];
    gameState.numCardsSelectedInDraftPool = 0;

    while (gameState.playerDraftPool.length < NUM_CARDS_TO_DRAFT_FROM_PER_TURN) {
        let randomAttr = randomElement(pool);
        // WE NEED TO MAKE THE CARD UNIQUE!!
        randomAttr = { ...randomAttr }; // apparently this is only a shallow clone. So I think
        // I'm safe for now...
        randomAttr.unique = Date.now() + "-" + randomN(1000000);
        gameState.playerDraftPool.push(randomAttr);
    }

    updateChooseCardPanel();
    showChooseCardPanel();
    switchPlayState(PlayStates.PLAYER_DRAW_PHASE_SHOWING_CARDS);
    finishedHandlingState();
}

handlers[PlayStates.PLAYER_DRAW_PHASE_DONE] = function () {
    hideChooseCardPanel();
    switchPlayState(PlayStates.PLAYER_PLAY_PHASE_READY);
    finishedHandlingState();
}

handlers[PlayStates.PLAYER_PLAY_PHASE_READY] = function () {
    toastMessage("Time to play cards to fight the virus!");
    setupUIForPlayPhase();
    switchPlayState(PlayStates.PLAYER_PLAY_PHASE_WAITING);
    finishedHandlingState();
}

handlers[PlayStates.PLAYER_PLAY_PHASE_DONE] = function () {
    switchPlayState(PlayStates.VIRUS_MUTATION_READY);
    finishedHandlingState(1000);
}

handlers[PlayStates.VIRUS_MUTATION_READY] = function () {
    if (coinFlip()) {
        switchPlayState(PlayStates.VIRUS_MUTATION_ACTIVE);
    } else {
        switchPlayState(PlayStates.VIRUS_MUTATION_DONE);
    }
    finishedHandlingState(500);
}

handlers[PlayStates.VIRUS_MUTATION_ACTIVE] = function () {
    mutateVirus();
    switchPlayState(PlayStates.VIRUS_MUTATION_DONE);
    finishedHandlingState();
}

handlers[PlayStates.VIRUS_MUTATION_DONE] = function () {
    switchPlayState(PlayStates.VIRUS_MOVES_DOWN_READY);
    finishedHandlingState(500);
}

handlers[PlayStates.VIRUS_MOVES_DOWN_READY] = function () {
    gameState.replicationAttempts = 0;
    switchPlayState(PlayStates.VIRUS_MOVES_DOWN_ACTIVE);
    toastMessage("Virus is trying to attack!");
    finishedHandlingState(700);
}

handlers[PlayStates.VIRUS_MOVES_DOWN_ACTIVE] = function () {
    if (gameState.replicationAttempts == gameState.replicationSpeed) {
        switchPlayState(PlayStates.VIRUS_MOVES_DOWN_DONE);
    } else {
        if (virusHasWon()) {
            switchPlayState(PlayStates.BODY_DEFEATED);
        } else if (!doesVirusHaveAnyAttackPoints()) {
            switchPlayState(PlayStates.VIRUS_DEFEATED);
        } else {
            if (coinFlip()) {
                let virusAttackPoints = findValidVirusAttackPoints();
                let newSpawnLoc = randomElement(virusAttackPoints);
                //toastMessage("Virus has attacked!");
                placeVirusOnGrid(newSpawnLoc[0], newSpawnLoc[1]);
            } else {
                //toastMessage("Virus is continuing to try to attack...");
            }
            gameState.replicationAttempts++;
            updateUI();
        }
    }
    finishedHandlingState(700);
}

handlers[PlayStates.VIRUS_MOVES_DOWN_DONE] = function () {
    gameState.replicationAttempts = 0;
    switchPlayState(PlayStates.VIRUS_MOVES_SIDEWAYS_READY);
    toastMessage("Virus has finished attacking for now!");
    finishedHandlingState();
}

handlers[PlayStates.VIRUS_DEFEATED] = function () {
    showWinScreen();
}

handlers[PlayStates.BODY_DEFEATED] = function () {
    showLossScreen();
}

// ******************************
// Game presentation related vars
// ******************************

function showChooseCardPanel() {
    $("#chooseCardDisplay").addClass("show");
}

function hideChooseCardPanel() {
    $("#chooseCardDisplay").removeClass("show");
}

function getInteractiveDivForCard(card) {
    let div = null;
    if (card.art !== null) {
        div = $(`<div class="cardContainer"><div class="card"><div class="cardText">${card.name}</div><div class="cardBlowUp hidden" style="background-image: url('${card.art}');"></div></div></div>`);
    } else {
        div = $(`<div class="cardContainer"><div class="card"><div class="cardText">${card.name}</div></div></div>`);
    }
    div.mouseenter(function () {
        div.find(".cardBlowUp").removeClass("hidden");
    });
    div.mouseleave(function () {
        div.find(".cardBlowUp").addClass("hidden");
    });
    return div;
}

function showLossScreen() {
    $("#chooseCardMsg").text("The immune system was overcome...");
    $("#chooseCardPanel").empty();
    $("#chooseCardDisplay").addClass("show");
}

function showWinScreen() {
    $("#chooseCardMsg").text("You successfully fought off the virus!");
    $("#chooseCardPanel").empty();
    $("#chooseCardDisplay").addClass("show");
}

function generateGrid(cellsGridDiv, tissueIndex) {
    for (let row = 0; row < TISSUE_HEIGHT; row++) {
        let currentRow = $('<tr class="tissueCellRow"></tr>');
        cellsGridDiv.append(currentRow);
        if (tissueIndex === 0) {
            gridDivs.push([]);
        }
        for (let column = 0; column < TISSUE_WIDTH; column++) {
            let currentCell = $('<td class="tissueCellColumn"></td>');
            currentRow.append(currentCell);
            gridDivs[row].push(currentCell);
        }
    }
}

function updateGridView() {
    for (let row = 0; row < TISSUE_HEIGHT; row++) {
        for (let column = 0; column < ALL_TISSUE_WIDTH; column++) {
            if (gameState.grid[row][column].isInfected()) {
                gridDivs[row][column].addClass("virus");
            } else {
                gridDivs[row][column].removeClass("virus");
            }
        }
    }
}

function updateChooseCardPanel() {
    $("#chooseCardMsg").text("Pick two immune cards to keep!");
    $("#chooseCardPanel").empty();
    gameState.playerDraftPool.forEach(function (item, _) {
        let cardDiv = getInteractiveDivForCard(item);
        cardDiv.click(function () {
            playerDraftedCard(item);
            cardDiv.remove();
            updateCardPanels();
            if (checkIfFinishedDrafting()) {
                $("#chooseCardPanel").empty();
                $("#chooseCardMsg").text("Thanks!");

            }
        });
        $("#chooseCardPanel").append(cardDiv);
    });
}

function updateVirusCardPanel() {
    if (gameState.virusAttributesChanged) {
        $("#virusCardPanel").empty();
        gameState.virusAttributes.forEach(function (item, _) {
            $("#virusCardPanel").append(getInteractiveDivForCard(item));
        });
        gameState.virusAttributesChanged = false;
    }
}

function updateActiveCardPanel() {
    if (gameState.activeImmuneAttributesChanged) {
        $("#activeImmuneCardPanel").empty();
        if (gameState.activeImmuneAttributes.length > 0) {
            gameState.activeImmuneAttributes.forEach(function (item, _) {
                $("#activeImmuneCardPanel").append(getInteractiveDivForCard(item));
            });
        } else {
            $("#activeImmuneCardPanel").append($('<div class="cardSpacer"></div>'));
        }
        gameState.activeImmuneAttributesChanged = false;
    }
}

function updateInactiveCardPanel() {
    if (gameState.inactiveImmuneAttributesChanged) {
        $("#inactiveImmuneCardPanel").empty();
        if (gameState.inactiveImmuneAttributes.length > 0) {
            gameState.inactiveImmuneAttributes.forEach(function (item, _) {
                $("#inactiveImmuneCardPanel").append(getInteractiveDivForCard(item));
            });
        } else {
            $("#inactiveImmuneCardPanel").append($('<div class="cardSpacer"></div>'));
        }
        gameState.inactiveImmuneAttributesChanged = false;
    }
}

function updateCardPanels() {
    updateVirusCardPanel();
    updateActiveCardPanel();
    updateInactiveCardPanel();
}

function updateOtherData() {
    $("#virusReplicationSpeed").text(gameState.replicationSpeed);
}

function updateUI() {
    updateGridView();
    updateCardPanels();
    updateOtherData();
}

function makeCardActive(card) {
    gameState.inactiveImmuneAttributes = gameState.inactiveImmuneAttributes.filter(c => c !== card);
    gameState.activeImmuneAttributes.push(card);
    gameState.inactiveImmuneAttributesChanged = true;
    gameState.activeImmuneAttributesChanged = true;
}

function playCardUISide(gameCard, uiCard) {
    if (!gameCard.needsInteraction) {
        gameCard.applyEffects();
        makeCardActive(gameCard);
        $(uiCard).remove();
        updateActiveCardPanel();
        updateOtherData();
    } else {
        // Move to new state, etc... TODO...
    }
}

function createCardClickHandler(gameCard, uiCard) {
    return function () {
        playCardUISide(gameCard, uiCard);
        $(uiCard).off("click");
        // Do we ever need to update anything else? GridView?
    }
}

function setupUIForPlayPhase() {
    let uiCards = $("#inactiveImmuneCardPanel").find(".cardContainer");
    let gameCards = gameState.inactiveImmuneAttributes;
    for (let index = 0; index < uiCards.length; index++) {
        $(uiCards[index]).click(createCardClickHandler(gameCards[index], uiCards[index]));
    }

    $("#endTurnButton").click(function () {
        let uiCards = $("#inactiveImmuneCardPanel").find(".cardContainer");
        for (let index = 0; index < uiCards.length; index++) {
            $(uiCards[index]).off("click");
        }
        $("#endTurnButton").addClass("gone");
        $("#endTurnButton").off("click");

        switchPlayState(PlayStates.PLAYER_PLAY_PHASE_DONE);
        finishedHandlingState(500);
    });
    $("#endTurnButton").removeClass("gone");
}

function hookupHandlers() {

}

function toastMessage(msg, dur) {
    if (dur === undefined) {
        dur = 2900;
    }
    // TODO: if dur is changed, we need to change CSS properties
    let snackbar = $(`<div class="snackbar">${msg}</div>`);
    snackbar.addClass("show");
    $("#snackbarContainer").append(snackbar);
    setTimeout(function () {
        snackbar.remove();
    }, dur);
}

// OnLoad
function onLoad() {
    generateGrid($("#liverCells"), 0);
    generateGrid($("#lungCells"), 1);
    generateGrid($("#intestineCells"), 2);

    setupGame();

    hookupHandlers();

    updateUI();
}

$(document).ready(onLoad);

// Virus Attributes
class VirusAttribute {
    constructor(name, kind, art, applyEffects, removeEffects) {
        this.name = name;
        this.kind = kind;
        this.art = art;
        this.applyEffects = applyEffects;
        this.removeEffects = removeEffects;
    }
}

let virusKindRules = {
    "Tropism": {
        min: 1,
        max: 3,
        unique: true,
    },
    "Antiviral Resistance": {
        min: 0,
        max: 5,
        unique: true,
    }
}

let virusAttributePool = {
    "liver-tropism": new VirusAttribute(
        "Liver Tropism",
        "Tropism",
        "assets/cards/card-virus-tropism-liver.png",
        function () {
            // Adding the card...

        },
        function () {
            // Removing the card...

        }),
    "lung-tropism": new VirusAttribute(
        "Lung Tropism",
        "Tropism",
        "assets/cards/card-virus-tropism-lung.png",
        function () {
            // Adding the card...

        },
        function () {
            // Removing the card...

        }),
    "intestine-tropism": new VirusAttribute(
        "Intestine Tropism",
        "Tropism",
        "assets/cards/card-virus-tropism-intestine.png",
        function () {
            // Adding the card...

        },
        function () {
            // Removing the card...

        }),
    "antiviral-resistance": new VirusAttribute(
        "Antiviral Resistance",
        "Antiviral Resistance",
        "assets/cards/card-virus-antiviral-resistance.png",
        function () {
            // Adding the card...
            gameState.replicationSpeed++;
        },
        function () {
            // Removing the card...
            gameState.replicationSpeed--;
        }),
}

// Note these attributes should not be contain other objects? As we need to shallow clone them.
class ImmuneAttribute {
    constructor(name, kind, art, needsInteraction, applyEffects, removeEffects) {
        this.name = name;
        this.kind = kind;
        this.art = art;
        this.needsInteraction = needsInteraction;
        this.applyEffects = applyEffects;
        this.removeEffects = removeEffects;
    }
}

let immuneKindRules = {
    "Antiviral": {
        min: 0,
        max: 8,
        unique: true,
    },
}

let immuneAttributePool = {
    "antiviral": new ImmuneAttribute(
        "Antiviral",
        "Antiviral",
        "assets/cards/card-immune-antiviral.png",
        false, // needsInteraction
        function () {
            // Adding the card...
            gameState.replicationSpeed--;
        },
        function () {
            // Removing the card...
            gameState.replicationSpeed++;
        }),
}