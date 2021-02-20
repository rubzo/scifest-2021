// Configurable?
let NUM_TISSUES = 3;
let TISSUE_WIDTH = 5;
let TISSUE_HEIGHT = 8;
let NUM_INITIAL_VIRUS_ATTRS = 2;

// Game presentation related vars
let mainGridDiv = null;
let liverCellsDiv = null;
let lungCellsDiv = null;
let heartCellsDiv = null;
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
    //
    // TODO!!! Need to split some of these up into PRE - ACTIVE - POST stages
    //
    PICKING_INITIAL_VIRUS_TRAITS: 1,
    // -> PICKING_INITIAL_IMMUNE_TRAITS
    PICKING_INITIAL_IMMUNE_TRAITS: 2,
    // -> ASSIGNING_INITIAL_IMMUNE_TRAITS
    ASSIGNING_INITIAL_IMMUNE_TRAITS: 3,
    // -> VIRUS_MOVING_ON_ROW
    VIRUS_MOVING_ON_ROW_READY: 41,
    // -> VIRUS_MOVING_ON_ROW_ACTIVE
    VIRUS_MOVING_ON_ROW_ACTIVE: 42,
    // -> VIRUS_MOVING_ON_ROW_DONE
    VIRUS_MOVING_ON_ROW_DONE: 43,
    // -> PLAYER_REACTION
    PLAYER_REACTION: 5,
    // -> VIRUS_MUTATION
    VIRUS_MUTATION: 6,
    // -> VIRUS_MOVES_DOWN
    VIRUS_MOVES_DOWN: 7,
    // -> VIRUS_MOVING_ON_ROW_READY
    // -> BODY_DEFEATED
    // -> VIRUS_DEFEATED
    BODY_DEFEATED: 8,
    VIRUS_DEFEATED: 9,
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
        for (let column = 0; column < (TISSUE_WIDTH * NUM_TISSUES); column++) {
            grid[row].push(new Cell());
        }
    }
    return grid;
}

function placeVirusOnGrid(row, column) {
    gameState.grid[row][column].markInfected();
}

function spawnVirusAt(row, column) {
    placeVirusOnGrid(row, column);
    toastMessage("Virus has replicated!");
}

function areAnyCellsInRowClean(row) {
    let cleanCells = gameState.grid[row].filter(cell => cell.isClean());
    return cleanCells.length > 0;
}

function findValidVirusSpawnPoints() {
    // Can only spawn within the valid tissue?
    let tropismAttr = gameState.virusAttributes.filter(attr => attr.kind == "Tropism")[0];
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
        case "Heart Tropism":
            start = TISSUE_WIDTH * 2;
            end = start + TISSUE_WIDTH;
            break;
    }

    let validIndices = [];
    let row = gameState.replicationRow;
    for (let column = start; column < end; column++) {
        if (gameState.grid[row][column].isClean()) {
            if (column != 0 && gameState.grid[row][column - 1].isInfected()) {
                validIndices.push(column);
            } else if (column != ((TISSUE_WIDTH * NUM_TISSUES) - 1)
                && gameState.grid[row][column + 1].isInfected()) {
                validIndices.push(column);
            }
        }
    }
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
        case "Heart Tropism":
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
        turn: 1,
        virusAttributes: [],
        immuneAttributes: [],
        state: PlayStates.PICKING_INITIAL_VIRUS_TRAITS,
        replicationRow: 0,
    }

    gameState.virusAttributes = generateInitialVirusAttributes();
    placeVirusBasedOnAttributes();

    switchPlayState(PlayStates.PICKING_INITIAL_IMMUNE_TRAITS);

    gameState.immuneAttributes = generateInitialImmuneAttributes();
    switchPlayState(PlayStates.ASSIGNING_INITIAL_IMMUNE_TRAITS);

    switchPlayState(PlayStates.VIRUS_MOVING_ON_ROW_READY);

    continueBasedOnCurrentState();
}

function finishedHandlingState() {
    setTimeout(continueBasedOnCurrentState, 3000);
}

function continueBasedOnCurrentState() {
    switch (gameState.state) {
        case PlayStates.VIRUS_MOVING_ON_ROW_READY:
            handleVirusMovingOnRowReady();
            break;
        case PlayStates.VIRUS_MOVING_ON_ROW_ACTIVE:
            handleVirusMovingOnRowActive();
            break;
        case PlayStates.VIRUS_MOVING_ON_ROW_DONE:
            handleVirusMovingOnRowDone();
            break;
    }
}

function handleVirusMovingOnRowReady() {
    gameState.replicationAttempts = 0;
    switchPlayState(PlayStates.VIRUS_MOVING_ON_ROW_ACTIVE);
    toastMessage("Virus is trying to replicate!");
    finishedHandlingState();
}

function handleVirusMovingOnRowActive() {
    let replicationAttr = gameState.virusAttributes.filter(attr => attr.kind == "Replication Speed")[0];
    if (gameState.replicationAttempts == replicationAttr.arg1) {
        switchPlayState(PlayStates.VIRUS_MOVING_ON_ROW_DONE);
    } else {
        if (!areAnyCellsInRowClean(gameState.replicationRow)) {
            switchPlayState(PlayStates.VIRUS_MOVING_ON_ROW_DONE);
        } else {
            if (coinFlip()) {
                let virusSpawnPoints = findValidVirusSpawnPoints();
                if (virusSpawnPoints.length != 0) {
                    let newSpawnLoc = randomElement(virusSpawnPoints);
                    spawnVirusAt(gameState.replicationRow, newSpawnLoc);
                }
            }
            gameState.replicationAttempts++;
            updateUI();
        }
    }
    finishedHandlingState();
}

function handleVirusMovingOnRowDone() {
    gameState.replicationAttempts = 0;
    switchPlayState(PlayStates.PLAYER_REACTION);
    toastMessage("Virus has finished trying to replicate!");
    finishedHandlingState();
}

// ******************************
// Game presentation related vars
// ******************************
function hookupDivs() {
    mainGridDiv = $("#mainGrid")
    liverCellsDiv = $("#liverCells")
    lungCellsDiv = $("#lungCells")
    heartCellsDiv = $("#heartCells")
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
        for (let column = 0; column < (TISSUE_WIDTH * NUM_TISSUES); column++) {
            let cellText = "&nbsp;";
            if (gameState.grid[row][column].isInfected()) {
                cellText = "X";
            }
            gridDivs[row][column].html(`<span class="nogrow">${cellText}</span>`);
        }
    }
}

function updateInfoPanels() {
    $("#virusCardPanel").empty();
    gameState.virusAttributes.forEach(function (item, _) {
        // TODO: turn this into something that renders the card for the attribute
        $("#virusCardPanel").append($(`<div>${item.name}</div>`))
    });

    $("#immuneCardPanel").empty();
    gameState.immuneAttributes.forEach(function (item, _) {
        // TODO: turn this into something that renders the card for the attribute
        $("#immuneCardPanel").append($(`<div>${item.name}</div>`))
    });
}

function updateUI() {
    updateGridView();
    updateInfoPanels();
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
    hookupDivs();
    generateGrid(liverCellsDiv, 0);
    generateGrid(lungCellsDiv, 1);
    generateGrid(heartCellsDiv, 2);

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
    "heart-tropism": new VirusAttribute(
        "Heart Tropism",
        "Tropism"),
}