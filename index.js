TISSUE_WIDTH = 5;
TISSUE_HEIGHT = 8;

let mainGridDiv = null;
let liverCellsDiv = null;
let lungCellsDiv = null;
let heartCellsDiv = null;

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

function onLoad() {
    hookupDivs();
    generateGrid(liverCellsDiv);
    generateGrid(lungCellsDiv);
    generateGrid(heartCellsDiv);
}

$(document).ready(onLoad);