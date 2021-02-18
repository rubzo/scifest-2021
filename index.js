// Configurable?
let TISSUE_WIDTH = 5;
let TISSUE_HEIGHT = 8;
let NUM_INITIAL_VIRUS_ATTRS = 2;

// Game presentation related vars
let mainGridDiv = null;
let liverCellsDiv = null;
let lungCellsDiv = null;
let heartCellsDiv = null;
let gridDivs = [];

// Game state related vars
let gameState = null;

// General helpers
function randomN(n) {
    return Math.floor(Math.random() * n);
}

function randomElement(ar) {
    return ar[randomN(ar.length)];
}

// Game state related functions
function generateGameStateGrid() {
    let grid = [];
    for (let row = 0; row < TISSUE_HEIGHT; row++) {
        grid.push([]);
        for (let column = 0; column < (TISSUE_WIDTH * 3); column++) {
            grid[row].push(null);
        }
    }
    return grid;
}

function placeVirusOnGrid(row, column) {
    gameState.grid[row][column] = "V";
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
    return;
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
    console.log(loc);
    placeVirusOnGrid(0, loc);
}

function setupGame() {
    gameState = {
        grid: generateGameStateGrid(),
        turn: 1,
        virusAttributes: generateInitialVirusAttributes(),
        immuneAttributes: generateInitialImmuneAttributes(),
    }

    placeVirusBasedOnAttributes();

}

// Game presentation related vars
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
        for (let column = 0; column < (TISSUE_WIDTH * 3); column++) {
            if (gameState.grid[row][column] === null) {
                gridDivs[row][column].html('<span class="nogrow">.</span>');
            } else {
                gridDivs[row][column].html('<span class="nogrow">V</span>');
            }
        }
    }
}

function updateInfoPanels() {
    $("#infoPaneList").empty();
    gameState.virusAttributes.forEach(function (item, _) {
        // TODO: turn this into something that renders the card for the attribute
        $("#infoPaneList").append($(`<div>${item.name}</div>`))
    });
}

function updateUI() {
    updateGridView();
    updateInfoPanels();
}

function hookupHandlers() {

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
    constructor(name, kind) {
        this.name = name;
        this.kind = kind;
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
        "Replication Speed"),
    "replication-speed-2": new VirusAttribute(
        "Slow Replication Speed",
        "Replication Speed"),
    "replication-speed-3": new VirusAttribute(
        "Medium Replication Speed",
        "Replication Speed"),
    "replication-speed-4": new VirusAttribute(
        "Fast Replication Speed",
        "Replication Speed"),
    "replication-speed-5": new VirusAttribute(
        "Very Fast Replication Speed",
        "Replication Speed"),
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