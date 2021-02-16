// Configurable?
let TISSUE_WIDTH = 5;
let TISSUE_HEIGHT = 8;
let NUM_INITIAL_VIRUS_ATTRS = 2;

// Game presentation related vars
let mainGridDiv = null;
let liverCellsDiv = null;
let lungCellsDiv = null;
let heartCellsDiv = null;

// Game state related vars
let gameState = null;

// Game state related functions
function generateGameStateGrid() {
    let grid = [];
    for (let i = 0; i < TISSUE_HEIGHT; i++) {
        grid.push([]);
        for (let j = 0; j < (TISSUE_WIDTH * 3); j++) {
            grid[i].push(null);
        }
    }
    return grid;
}

function generateInitialVirusAttributes() {
    let attrs = [];
    let pool = Object.values(virusAttributePool);

    while (attrs.length < NUM_INITIAL_VIRUS_ATTRS) {
        let randomAttr = pool[Math.floor(Math.random() * pool.length)];
        attrs.push(randomAttr);
        console.log(randomAttr);
    }
}

function generateInitialImmuneAttributes() {
    return;
}

function setupGame() {
    gameState = {
        grid: generateGameStateGrid(),
        turn: 1,
        virusAttributes: generateInitialVirusAttributes(),
        immuneAttributes: generateInitialImmuneAttributes(),
    }
}

// Game presentation related vars
function hookupDivs() {
    mainGridDiv = $("#mainGrid")
    liverCellsDiv = $("#liverCells")
    lungCellsDiv = $("#lungCells")
    heartCellsDiv = $("#heartCells")
}

function generateGrid(cellsGridDiv) {
    for (let i = 0; i < TISSUE_HEIGHT; i++) {
        let currentRow = $('<div class="tissueCellRow"></div>');
        cellsGridDiv.append(currentRow);
        for (let j = 0; j < TISSUE_WIDTH; j++) {
            let currentCell = $('<div class="tissueCellColumn"></div>');
            currentRow.append(currentCell);
        }
    }
}

function hookupHandlers() {

}

// OnLoad
function onLoad() {
    hookupDivs();
    generateGrid(liverCellsDiv);
    generateGrid(lungCellsDiv);
    generateGrid(heartCellsDiv);

    setupGame();

    hookupHandlers();
}

$(document).ready(onLoad);

// Virus Attributes
class VirusAttribute {
    constructor(name, kind) {
        this.name = name;
        this.kind = kind;
    }
}

// Kind rules
// can only have 1 of 'Replication Speed'
// can only have 1 of 'Tropism'

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