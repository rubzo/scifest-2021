// Configurable?
let NUM_TISSUES = 3;
let TISSUE_WIDTH = 5;
let TISSUE_HEIGHT = 10;
let ALL_TISSUE_WIDTH = TISSUE_WIDTH * NUM_TISSUES;
let NUM_INITIAL_VIRUS_ATTRS = 2;
let NUM_CARDS_TO_DRAFT_FROM_PER_TURN = 3;
let NUM_CARDS_TO_SELECT_IN_DRAFT_PER_TURN = 2;
let MAX_MUTATION_ATTEMPTS = 2;
let NUM_SUCCESSFUL_COIN_FLIPS_TO_MUTATE = 3; // 12.5% chance virus mutates

// Game presentation related vars
let gridDivs = [];

// General helpers
function randomN(n) {
    return Math.floor(Math.random() * n);
}

function coinFlip() {
    return randomN(2) == 0;
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
    // -> VIRUS_MOVES_SIDEWAYS_ACTIVE
    VIRUS_MOVES_SIDEWAYS_ACTIVE: 42,
    // -> VIRUS_MOVES_SIDEWAYS_DONE
    VIRUS_MOVES_SIDEWAYS_DONE: 43,
    // -> PLAYER_DRAW_PHASE_READY

    PLAYER_DRAW_PHASE_READY: 51,
    // -> PLAYER_DRAW_PHASE_SHOWING_CARDS
    PLAYER_DRAW_PHASE_SHOWING_CARDS: 52,
    // -> PLAYER_DRAW_PHASE_DONE
    PLAYER_DRAW_PHASE_DONE: 53,
    // -> PLAYER_PLAY_PHASE

    PLAYER_PLAY_PHASE: 6,
    // -> VIRUS_MUTATION_READY

    VIRUS_MUTATION_READY: 71,
    // -> VIRUS_MUTATION_ACTIVE
    VIRUS_MUTATION_ACTIVE: 72,
    // -> VIRUS_MUTATION_DONE
    VIRUS_MUTATION_DONE: 73,

    // -> VIRUS_MOVES_DOWN_READY
    VIRUS_MOVES_DOWN_READY: 81,
    // -> VIRUS_MOVES_DOWN_ACTIVE
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

    // Add any others randomly...
    while (attrs.length < NUM_INITIAL_VIRUS_ATTRS) {
        let randomAttr = randomElement(pool);
        // TODO: make sure they don't exceed maximum for the kind...
        attrs.push(randomAttr);
    }

    return attrs;
}

function mutateVirus() {
    // TODO: a bunch of stuff here to make sure the traits we add are 'legal'
    // 50/50 chance we replace a trait or add a new one
    if (coinFlip()) {
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
        toastMessage(`Virus replaced ${attrToReplace.name} with ${replacementAttr.name}`)
    } else {
        // adding...
        let pool = Object.values(virusAttributePool);
        let newAttr = randomElement(pool);
        gameState.virusAttributes.push(newAttr);
        toastMessage(`Virus gained ${newAttr.name}`)
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
        activeImmuneAttributes: [],
        inactiveImmuneAttributes: [],
        state: PlayStates.PICKING_INITIAL_VIRUS_TRAITS,
        playerDraftPool: [],
        numCardsSelectedInDraftPool: 0,
        mutationAttempts: 0,
    }

    // TODO: this will be factored into the whole
    // 'timeout(continueBasedOnCurrentState)' thing
    gameState.virusAttributes = generateInitialVirusAttributes();
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

function finishedHandlingState() {
    setTimeout(continueBasedOnCurrentState, 2000);
}

handlers[PlayStates.VIRUS_MOVES_SIDEWAYS_READY] = function () {
    gameState.replicationAttempts = 0;
    switchPlayState(PlayStates.VIRUS_MOVES_SIDEWAYS_ACTIVE);
    toastMessage("Virus is trying to replicate!");
    finishedHandlingState();
}

handlers[PlayStates.VIRUS_MOVES_SIDEWAYS_ACTIVE] = function () {
    let replicationAttr = gameState.virusAttributes.filter(attr => attr.kind == "Replication Speed")[0];
    if (gameState.replicationAttempts == replicationAttr.arg1) {
        switchPlayState(PlayStates.VIRUS_MOVES_SIDEWAYS_DONE);
    } else {
        if (!doesVirusHaveAnySpawnPoints()) {
            switchPlayState(PlayStates.VIRUS_MOVES_SIDEWAYS_DONE);
        } else {
            if (coinFlip()) {
                let virusSpawnPoints = findValidVirusSpawnPoints();
                if (virusSpawnPoints.length != 0) {
                    let newSpawnLoc = randomElement(virusSpawnPoints);
                    toastMessage("Virus has replicated!");
                    placeVirusOnGrid(newSpawnLoc[0], newSpawnLoc[1]);
                }
            } else {
                toastMessage("Virus is continuing to try to replicate...");
            }
            gameState.replicationAttempts++;
            updateUI();
        }
    }
    finishedHandlingState();
}

handlers[PlayStates.VIRUS_MOVES_SIDEWAYS_DONE] = function () {
    gameState.replicationAttempts = 0;
    switchPlayState(PlayStates.PLAYER_DRAW_PHASE_READY);
    toastMessage("Virus has finished trying to replicate!");
    finishedHandlingState();
}

handlers[PlayStates.PLAYER_DRAW_PHASE_READY] = function () {
    // TODO: we should only add cards that don't break card selection rules!!
    let pool = Object.values(immuneAttributePool);

    gameState.playerDraftPool = [];
    gameState.numCardsSelectedInDraftPool = 0;

    while (gameState.playerDraftPool.length < NUM_CARDS_TO_DRAFT_FROM_PER_TURN) {
        let randomAttr = randomElement(pool);
        gameState.playerDraftPool.push(randomAttr);
    }

    updateChooseCardPanel();
    showChooseCardPanel();
    switchPlayState(PlayStates.PLAYER_DRAW_PHASE_SHOWING_CARDS);
    finishedHandlingState();
}

handlers[PlayStates.PLAYER_DRAW_PHASE_DONE] = function () {
    hideChooseCardPanel();
    switchPlayState(PlayStates.PLAYER_PLAY_PHASE);
    finishedHandlingState();
}

handlers[PlayStates.PLAYER_PLAY_PHASE] = function () {
    toastMessage("(Normally you'd play cards now)");
    switchPlayState(PlayStates.VIRUS_MUTATION_READY);
    finishedHandlingState();
}

handlers[PlayStates.VIRUS_MUTATION_READY] = function () {
    if (coinFlip()) {
        toastMessage("Virus is trying to mutate!");
        gameState.mutationAttempts = 0;
        switchPlayState(PlayStates.VIRUS_MUTATION_ACTIVE);
    } else {
        toastMessage("Virus will not mutate this turn!");
        switchPlayState(PlayStates.VIRUS_MUTATION_DONE);
    }
    finishedHandlingState();
}

handlers[PlayStates.VIRUS_MUTATION_ACTIVE] = function () {
    if (gameState.mutationAttempts == MAX_MUTATION_ATTEMPTS) {
        switchPlayState(PlayStates.VIRUS_MUTATION_DONE);
    } else {
        gameState.mutationAttempts++;
        let canMutate = true;
        for (let flips = 0; (canMutate && (flips < NUM_SUCCESSFUL_COIN_FLIPS_TO_MUTATE)); flips++) {
            canMutate = coinFlip();
        }
        if (canMutate) {
            mutateVirus();
        } else {
            toastMessage("Virus attempted to mutate but failed!");
        }
    }
    finishedHandlingState();
}

handlers[PlayStates.VIRUS_MUTATION_DONE] = function () {
    toastMessage("Virus has finished trying to mutate!");
    switchPlayState(PlayStates.VIRUS_MOVES_DOWN_READY);
    finishedHandlingState();
}

handlers[PlayStates.VIRUS_MOVES_DOWN_READY] = function () {
    gameState.replicationAttempts = 0;
    switchPlayState(PlayStates.VIRUS_MOVES_DOWN_ACTIVE);
    toastMessage("Virus is trying to attack deeper!");
    finishedHandlingState();
}

handlers[PlayStates.VIRUS_MOVES_DOWN_ACTIVE] = function () {
    let replicationAttr = gameState.virusAttributes.filter(
        attr => attr.kind == "Replication Speed"
    )[0];
    if (gameState.replicationAttempts == replicationAttr.arg1) {
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
                toastMessage("Virus has attacked!");
                placeVirusOnGrid(newSpawnLoc[0], newSpawnLoc[1]);
            } else {
                toastMessage("Virus is continuing to try to attack...")
            }
            gameState.replicationAttempts++;
            updateUI();
        }
    }
    finishedHandlingState();
}

handlers[PlayStates.VIRUS_MOVES_DOWN_DONE] = function () {
    gameState.replicationAttempts = 0;
    switchPlayState(PlayStates.VIRUS_MOVES_SIDEWAYS_READY);
    toastMessage("Virus has finished trying to attack!");
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

function getHTMLForCard(card) {
    return `<div class="cardContainer"><div class="card">${card.name}</div></div>`;
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
        let cardDiv = $(getHTMLForCard(item));
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

function updateCardPanels() {
    $("#virusCardPanel").empty();
    gameState.virusAttributes.forEach(function (item, _) {
        $("#virusCardPanel").append($(getHTMLForCard(item)));
    });

    $("#activeImmuneCardPanel").empty();
    gameState.activeImmuneAttributes.forEach(function (item, _) {
        $("#activeImmuneCardPanel").append($(getHTMLForCard(item)));
    });

    $("#inactiveImmuneCardPanel").empty();
    gameState.inactiveImmuneAttributes.forEach(function (item, _) {
        $("#inactiveImmuneCardPanel").append($(getHTMLForCard(item)));
    });
}

function updateUI() {
    updateGridView();
    updateCardPanels();
}

function hookupHandlers() {

}

function toastMessage(msg, dur) {
    if (dur === undefined) {
        dur = 1400;
    }
    $("#snackbar").text(msg);
    $("#snackbar").addClass("show")
    setTimeout(function () {
        $("#snackbar").removeClass("show");
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
    constructor(name, kind, arg1) {
        this.name = name;
        this.kind = kind;
        this.arg1 = arg1;
    }
}

let virusKindRules = {
    "Replication Speed": {
        min: 1,
        max: 1,
        unique: true,
    },
    "Tropism": {
        min: 1,
        max: 1,
        unique: true,
    }
}

let virusAttributePool = {
    "replication-speed-1": new VirusAttribute(
        "Very Slow Replication Speed",
        "Replication Speed",
        1),
    "replication-speed-2": new VirusAttribute(
        "Slow Replication Speed",
        "Replication Speed",
        2),
    "replication-speed-3": new VirusAttribute(
        "Medium Replication Speed",
        "Replication Speed",
        3),
    "replication-speed-4": new VirusAttribute(
        "Fast Replication Speed",
        "Replication Speed",
        4),
    "replication-speed-5": new VirusAttribute(
        "Very Fast Replication Speed",
        "Replication Speed",
        5),
    "liver-tropism": new VirusAttribute(
        "Liver Tropism",
        "Tropism"),
    "lung-tropism": new VirusAttribute(
        "Lung Tropism",
        "Tropism"),
    "intestine-tropism": new VirusAttribute(
        "Intestine Tropism",
        "Tropism"),
}

class ImmuneAttribute {
    constructor(name, kind, arg1) {
        this.name = name;
        this.kind = kind;
        this.arg1 = arg1;
    }
}

let immuneKindRules = {
    "Cytokine Production": {
        min: 0,
        max: 10,
        unique: false,
    },
    "Antibodies": {
        min: 0,
        max: 3,
        unique: true,
    },
}

let immuneAttributePool = {
    "cytokine-production-1": new ImmuneAttribute(
        "Weak Cytokine Production",
        "Cytokine Production",
        1),
    "cytokine-production-2": new ImmuneAttribute(
        "Medium Cytokine Production",
        "Cytokine Production",
        2),
    "cytokine-production-3": new ImmuneAttribute(
        "Strong Cytokine Production",
        "Cytokine Production",
        3),
    "liver-antibodies": new ImmuneAttribute(
        "Liver Antibodies",
        "Antibodies"),
    "lung-antibodies": new ImmuneAttribute(
        "Lung Antibodies",
        "Antibodies"),
    "intestine-antibodies": new ImmuneAttribute(
        "Intestine Antibodies",
        "Antibodies"),
}