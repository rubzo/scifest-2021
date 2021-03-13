let NUM_TISSUES = 3;
let TISSUE_WIDTH = 5;
let TISSUE_HEIGHT = 10;
let ALL_TISSUE_WIDTH = TISSUE_WIDTH * NUM_TISSUES;
let NUM_CARDS_TO_DRAFT_FROM_PER_TURN = 3;
let NUM_CARDS_TO_SELECT_IN_DRAFT_PER_TURN = 2;
let MAX_MUTATION_ATTEMPTS = 2;
let STATE_TRANSITION_WAIT = 4000; // Make super slow for now, optimise later.

// Game presentation related vars
let gridDivs = [];

// General helpers
function shuffle(ar) {
    // https://stackoverflow.com/a/2450976
    var currentIndex = ar.length, temporaryValue, randomIndex;

    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        temporaryValue = ar[currentIndex];
        ar[currentIndex] = ar[randomIndex];
        ar[randomIndex] = temporaryValue;
    }

    return ar;
}

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
// used to make sure every card has a unique ID
let cardIds = 0;

// Game state related functions
const CellStates = {
    CLEAN: 1,
    INFECTED: 2,
    PROTECTED: 3,
}

const Tissue = {
    LIVER: 1,
    LUNG: 2,
    INTESTINE: 3,
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
    constructor(tissue) {
        this.state = CellStates.CLEAN;
        // This indicates that an immune card is affecting this cell.
        this.immuneCard = null;
        this.tissue = tissue;
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

    isProtected() {
        return this.state === CellStates.PROTECTED;
    }

    isSameTissue(other) {
        return this.tissue === other.tissue;
    }

    isTissue(tissue) {
        return this.tissue === tissue;
    }

    removeInfection() {
        this.state = CellStates.CLEAN;
    }

    protectWith(card) {
        this.state = CellStates.PROTECTED;
        this.immuneCard = card;
    }

    unprotect() {
        this.state = CellStates.CLEAN;
        this.immuneCard = null;
    }

    getImmuneCard() {
        return this.immuneCard;
    }
};

function generateGameStateGrid() {
    let grid = [];
    for (let row = 0; row < TISSUE_HEIGHT; row++) {
        grid.push([]);
        for (let column = 0; column < ALL_TISSUE_WIDTH; column++) {
            let tissue = Tissue.LIVER;
            if (column >= TISSUE_WIDTH && column < TISSUE_WIDTH * 2) {
                tissue = Tissue.LUNG;
            }
            if (column >= TISSUE_WIDTH * 2) {
                tissue = Tissue.INTESTINE;
            }
            grid[row].push(new Cell(tissue));
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

    let tropisms = gameState.virusCards.filter(c => c.kind == "Tropism");
    tropisms.forEach(function (tropismCard, _) {
        let start = 0;
        let end = 0;
        switch (tropismCard.title) {
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

function generateInitialVirusCards() {
    let cards = [];

    // Currently, just give 2 Tropisms
    let tropismCardClassPool = shuffle(virusCardClassPool.filter(cl => cl.kind === "Tropism"));
    for (let i = 0; i < 2; i++) {
        let newCardClass = tropismCardClassPool[i];
        let newCard = new newCardClass();
        cards.push(newCard);
    }

    return cards;
}

function getSuitableNewVirusCardClass() {
    let done = false;

    let newCardClass = null;

    while (!done) {
        newCardClass = randomElement(virusCardClassPool);

        if (newCardClass.kind === "Tropism") {
            // It cannot be a tropism card the virus already has!
            let currentTropismCards = gameState.virusCards.filter(c => c.kind === "Tropism");
            if (currentTropismCards.length == 3) {
                // We actually have all of them, so pick a different one.
                continue;
            } else {
                let tropismCardClassPool = virusCardClassPool.filter(cl => cl.kind === "Tropism");
                while (currentTropismCards.filter(c => c.title === newCardClass.title).length > 0) {
                    newCardClass = randomElement(tropismCardClassPool);
                }
                done = true;
            }
        } else if (newCardClass.kind === "Cytokine Neutralisation") {
            // Does the player have any cytokines? If so, make sure we play one they have.
            // Otherwise, go around again (we're being aggressive.)
            let immuneCytokineCards = gameState.activeImmuneCards.filter(c => c.kind == "Cytokines");
            if (immuneCytokineCards.length > 0) {
                let randomCytokineCard = randomElement(immuneCytokineCards);
                switch (randomCytokineCard.title) {
                    case "Red Cytokines":
                        newCardClass = RedCytokineNeutralisation;
                        break;
                    case "Blue Cytokines":
                        newCardClass = BlueCytokineNeutralisation;
                        break;
                    case "Green Cytokines":
                        newCardClass = GreenCytokineNeutralisation;
                        break;
                }
                done = true;
            }
        } else if (newCardClass.kind === "Antibodies Escape") {
            // Does the player have any antibodies? If so, make sure we play one they have.
            let immuneAntibodiesCards = gameState.activeImmuneCards.filter(c => c.kind == "Antibodies");
            if (immuneAntibodiesCards.length > 0) {
                let randomAntibodiesCard = randomElement(immuneAntibodiesCards);
                switch (randomAntibodiesCard.title) {
                    case "Liver Antibodies":
                        newCardClass = AntibodiesEscapeLiver;
                        break;
                    case "Lung Antibodies":
                        newCardClass = AntibodiesEscapeLung;
                        break;
                    case "Intestine Antibodies":
                        newCardClass = AntibodiesEscapeIntestine;
                        break;
                }
                done = true;
            }
        } else {
            done = true;
        }
    }

    return newCardClass;
}

function getSuitableVirusCardToRemove() {
    let done = false;
    let cardToRemove = null;

    while (!done) {
        cardToRemove = randomElement(gameState.virusCards);
        if (cardToRemove.kind === "Tropism"
            && gameState.virusCards.filter(c => c.kind === "Tropism").length == 1) {

            continue;
        }
        done = true;
    }

    return cardToRemove;
}

function mutateVirus() {
    // Cleanup any oneshot cards that were used last turn.
    gameState.virusCards = gameState.virusCards.filter(c => !c.oneshot);
    gameState.virusCardsChanged = true;

    if (percentChance(80) || gameState.virusCards.length == 1) {
        // Add a new card...
        let newCardClass = getSuitableNewVirusCardClass();
        let newCard = new newCardClass();
        newCard.applyEffects()
        gameState.virusCards.push(newCard);
        gameState.virusCardsChanged = true;
        if (newCard.oneshot) {
            toastMessage(`The virus played ${newCard.title}!`)
        } else {
            toastMessage(`The virus gained ${newCard.title}!`)
        }
    } else {
        // Remove a card...
        let cardToRemove = getSuitableVirusCardToRemove();
        let newVirusCards = gameState.virusCards.filter(c => c != cardToRemove);
        gameState.virusCards = newVirusCards;
        gameState.virusCardsChanged = true;
        cardToRemove.removeEffects();
        toastMessage(`The virus lost ${cardToRemove.title}!`)
    }
    updateUI();
}

function placeVirusBasedOnCards() {
    gameState.virusCards.forEach(function (card, _) {
        card.applyEffects();
    });
}

function switchPlayState(newState) {
    // TODO: checking state transitions are valid
    gameState.state = newState;
}

function setupGame() {
    gameState = {
        grid: generateGameStateGrid(),
        virusCards: [],
        virusCardsChanged: false,
        replicationSpeed: 8,
        activeImmuneCards: [],
        inactiveImmuneCards: [],
        activeImmuneCardsChanged: false,
        inactiveImmuneCardsChanged: false,
        state: PlayStates.PICKING_INITIAL_VIRUS_TRAITS,
        playerDraftPool: [],
        numCardsSelectedInDraftPool: 0,
        interactionCard: null,
    }

    // TODO: this will be factored into the whole
    // 'timeout(continueBasedOnCurrentState)' thing
    gameState.virusCards = generateInitialVirusCards();
    gameState.virusCardsChanged = true;
    placeVirusBasedOnCards();

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
    gameState.inactiveImmuneCards.push(card);
    gameState.inactiveImmuneCardsChanged = true;
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
    toastMessage("The virus is spreading!");
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
    finishedHandlingState(500);
}

handlers[PlayStates.PLAYER_DRAW_PHASE_READY] = function () {
    // TODO: we should only add cards that don't break card selection rules!!
    gameState.playerDraftPool = [];
    gameState.numCardsSelectedInDraftPool = 0;

    while (gameState.playerDraftPool.length < NUM_CARDS_TO_DRAFT_FROM_PER_TURN) {
        let randomCardClass = randomElement(immuneCardClassPool);
        let randomCard = new randomCardClass();
        gameState.playerDraftPool.push(randomCard);
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
    if (percentChance(60)) {
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
        div = $(`<div class="cardContainer"><div class="card"><div class="cardText">${card.title}</div><div class="cardBlowUp hidden" style="background-image: url('${card.art}');"></div></div></div>`);
    } else {
        div = $(`<div class="cardContainer"><div class="card"><div class="cardText">${card.title}</div></div></div>`);
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
            let div = gridDivs[row][column];
            div.removeClass();
            div.addClass("tissueCellColumn");
            if (gameState.grid[row][column].isInfected()) {
                gridDivs[row][column].addClass("virus");
            } else if (gameState.grid[row][column].isProtected()) {
                let effectCSSClass = gameState.grid[row][column].getImmuneCard().getEffectCSSClass();
                gridDivs[row][column].addClass(effectCSSClass);
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
    if (gameState.virusCardsChanged) {
        $("#virusCardPanel").empty();
        gameState.virusCards.forEach(function (item, _) {
            $("#virusCardPanel").append(getInteractiveDivForCard(item));
        });
        gameState.virusCardsChanged = false;
    }
}

function updateActiveCardPanel() {
    if (gameState.activeImmuneCardsChanged) {
        $("#activeImmuneCardPanel").empty();
        if (gameState.activeImmuneCards.length > 0) {
            gameState.activeImmuneCards.forEach(function (item, _) {
                $("#activeImmuneCardPanel").append(getInteractiveDivForCard(item));
            });
        } else {
            $("#activeImmuneCardPanel").append($('<div class="cardSpacer"></div>'));
        }
        gameState.activeImmuneCardsChanged = false;
    }
}

function updateInactiveCardPanel() {
    if (gameState.inactiveImmuneCardsChanged) {
        $("#inactiveImmuneCardPanel").empty();
        if (gameState.inactiveImmuneCards.length > 0) {
            gameState.inactiveImmuneCards.forEach(function (item, _) {
                $("#inactiveImmuneCardPanel").append(getInteractiveDivForCard(item));
            });
        } else {
            $("#inactiveImmuneCardPanel").append($('<div class="cardSpacer"></div>'));
        }
        gameState.inactiveImmuneCardsChanged = false;
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
    gameState.inactiveImmuneCards = gameState.inactiveImmuneCards.filter(c => c !== card);
    gameState.activeImmuneCards.push(card);
    gameState.inactiveImmuneCardsChanged = true;
    gameState.activeImmuneCardsChanged = true;
}

function playCardUISide(gameCard, uiCard) {
    if (!gameCard.needsInteraction) {
        gameCard.applyEffects();
        makeCardActive(gameCard);
        $(uiCard).remove();
        updateActiveCardPanel();
        updateOtherData();
    } else {
        $("#boardText").text("Where should this card be played?");
        $("#boardText").removeClass("gone");

        gameState.interactionCard = gameCard;
        addGridListeners();
        makeCardActive(gameCard);
        $(uiCard).remove();
        updateActiveCardPanel();
        switchPlayState(PlayStates.PLAYER_PLAY_PHASE_INTERACTING);
        finishedHandlingState(5);
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
    gameState.activeImmuneCards = gameState.activeImmuneCards.filter(c => !c.oneshot);
    gameState.activeImmuneCardsChanged = true;
    updateActiveCardPanel();

    let uiCards = $("#inactiveImmuneCardPanel").find(".cardContainer");
    let gameCards = gameState.inactiveImmuneCards;
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

function onCellMouseenter(row, column) {
    return function () {
        let affectedCells = gameState.interactionCard.getAffectedCells(row, column);
        let effectCSSClass = gameState.interactionCard.getEffectCSSClass()
        for (let coord of affectedCells) {
            gridDivs[coord[0]][coord[1]].addClass(effectCSSClass);
        }
    }
}

function onCellMouseleave(row, column) {
    return function () {
        let affectedCells = gameState.interactionCard.getAffectedCells(row, column);
        let effectCSSClass = gameState.interactionCard.getEffectCSSClass()
        for (let coord of affectedCells) {
            gridDivs[coord[0]][coord[1]].removeClass(effectCSSClass);
        }
    }
}

function onCellClick(row, column) {
    return function () {
        // if legal
        if (gameState.interactionCard.canPlaceHere(row, column)) {
            gameState.interactionCard.applyEffectsToLoc(row, column);
            gameState.interactionCard = null;
            $("#boardText").addClass("gone");
            removeGridListeners();
            updateGridView();
            switchPlayState(PlayStates.PLAYER_PLAY_PHASE_WAITING);
            finishedHandlingState(5);
        } else {
            toastMessage("Cannot place here!", 1000);
        }
    }
}

// It remains to be seen if it is more expensive to have all of the listeners
// attached all the time, or adding them now.
function addGridListeners() {
    for (let row = 0; row < TISSUE_HEIGHT; row++) {
        for (let column = 0; column < ALL_TISSUE_WIDTH; column++) {
            $(gridDivs[row][column]).mouseenter(onCellMouseenter(row, column));
            $(gridDivs[row][column]).mouseleave(onCellMouseleave(row, column));
            $(gridDivs[row][column]).click(onCellClick(row, column));
        }
    }
}

function removeGridListeners() {
    for (let row = 0; row < TISSUE_HEIGHT; row++) {
        for (let column = 0; column < ALL_TISSUE_WIDTH; column++) {
            $(gridDivs[row][column]).off("mouseenter");
            $(gridDivs[row][column]).off("mouseleave");
            $(gridDivs[row][column]).off("click");
        }
    }
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

//
// Virus Cards
//
class VirusCard {
    constructor() {
        this.cardId = cardIds++;
        // Ughhhh apparently this is how we make 'static' data be visible in the instance!
        this.title = this.constructor.title;
        this.kind = this.constructor.kind;
        this.art = this.constructor.art;
        this.oneshot = this.constructor.oneshot;
    }

    applyEffects() {
        console.log("WARNING: applyEffects not implemented for a virus card that needs it?");
    }

    removeEffects() {
        console.log("WARNING: removeEffects not implemented for a virus card that needs it?");
    }

    searchAndRemoveRandomImmuneCardWithTitle(cardTitle) {
        let affectedCards = gameState.activeImmuneCards.filter(c => c.title === cardTitle);

        if (affectedCards.length > 0) {
            let cardToRemove = randomElement(affectedCards);
            let remainingCards = gameState.activeImmuneCards.filter(c => c.cardId != cardToRemove.cardId);

            cardToRemove.removeEffects();

            gameState.activeImmuneCards = remainingCards;
            gameState.activeImmuneCardsChanged = true;
            updateActiveCardPanel();
            updateGridView();
        }
    }

    searchAndRemoveAllImmuneCardsWithTitle(cardTitle) {
        let affectedCards = gameState.activeImmuneCards.filter(c => c.title === cardTitle);
        let remainingCards = gameState.activeImmuneCards.filter(c => c.title != cardTitle);

        affectedCards.forEach(function (card, _) {
            card.removeEffects();
        });

        if (affectedCards.length > 0) {
            gameState.activeImmuneCards = remainingCards;
            gameState.activeImmuneCardsChanged = true;
            updateActiveCardPanel();
            updateGridView();
        }
    }
}

class LiverTropism extends VirusCard {
    applyEffects() {
        placeVirusOnGrid(0, Math.floor(TISSUE_WIDTH / 2));
    }

    removeEffects() {
        console.log("TODO: got to clear virus that was in the liver tissue");
    }
}
LiverTropism.title = "Liver Tropism";
LiverTropism.kind = "Tropism";
LiverTropism.art = "assets/cards/card-virus-tropism-liver.png";
LiverTropism.oneshot = false;

class LungTropism extends VirusCard {
    applyEffects() {
        placeVirusOnGrid(0, TISSUE_WIDTH + Math.floor(TISSUE_WIDTH / 2));
    }

    removeEffects() {
        console.log("TODO: got to clear virus that was in the lung tissue");
    }
}
LungTropism.title = "Lung Tropism";
LungTropism.kind = "Tropism";
LungTropism.art = "assets/cards/card-virus-tropism-lung.png";
LungTropism.oneshot = false;

class IntestineTropism extends VirusCard {
    applyEffects() {
        placeVirusOnGrid(0, (TISSUE_WIDTH * 2) + Math.floor(TISSUE_WIDTH / 2));
    }

    removeEffects() {
        console.log("TODO: got to clear virus that was in the intestine tissue");
    }
}
IntestineTropism.title = "Intestine Tropism";
IntestineTropism.kind = "Tropism";
IntestineTropism.art = "assets/cards/card-virus-tropism-intestine.png";
IntestineTropism.oneshot = false;

class AntiviralResistance extends VirusCard {
    applyEffects() {
        gameState.replicationSpeed++;
    }

    removeEffects() {
        gameState.replicationSpeed--;
    }
}
AntiviralResistance.title = "Antiviral Resistance";
AntiviralResistance.kind = "Antiviral Resistance";
AntiviralResistance.art = "assets/cards/card-virus-antiviral-resistance.png";
AntiviralResistance.oneshot = false;

class BlueCytokineNeutralisation extends VirusCard {
    applyEffects() {
        this.searchAndRemoveRandomImmuneCardWithTitle("Blue Cytokines");
    }
}
BlueCytokineNeutralisation.title = "Blue Cytokine Neutralisation";
BlueCytokineNeutralisation.kind = "Cytokine Neutralisation";
BlueCytokineNeutralisation.art = "assets/cards/card-virus-cytokine-neutralisation-blue.png";
BlueCytokineNeutralisation.oneshot = true;

class GreenCytokineNeutralisation extends VirusCard {
    applyEffects() {
        this.searchAndRemoveRandomImmuneCardWithTitle("Green Cytokines");
    }
}
GreenCytokineNeutralisation.title = "Green Cytokine Neutralisation";
GreenCytokineNeutralisation.kind = "Cytokine Neutralisation";
GreenCytokineNeutralisation.art = "assets/cards/card-virus-cytokine-neutralisation-green.png";
GreenCytokineNeutralisation.oneshot = true;

class RedCytokineNeutralisation extends VirusCard {
    applyEffects() {
        this.searchAndRemoveRandomImmuneCardWithTitle("Red Cytokines");
    }
}
RedCytokineNeutralisation.title = "Red Cytokine Neutralisation";
RedCytokineNeutralisation.kind = "Cytokine Neutralisation";
RedCytokineNeutralisation.art = "assets/cards/card-virus-cytokine-neutralisation-red.png";
RedCytokineNeutralisation.oneshot = true;

class AntibodiesEscapeLiver extends VirusCard {
    applyEffects() {
        this.searchAndRemoveAllImmuneCardsWithTitle("Liver Antibodies");
    }
}
AntibodiesEscapeLiver.title = "Antibodies Escape Liver";
AntibodiesEscapeLiver.kind = "Antibodies Escape";
AntibodiesEscapeLiver.art = "assets/cards/card-virus-antibodies-escape-liver.png";
AntibodiesEscapeLiver.oneshot = true;

class AntibodiesEscapeLung extends VirusCard {
    applyEffects() {
        this.searchAndRemoveAllImmuneCardsWithTitle("Lung Antibodies");
    }
}
AntibodiesEscapeLung.title = "Antibodies Escape Lung";
AntibodiesEscapeLung.kind = "Antibodies Escape";
AntibodiesEscapeLung.art = "assets/cards/card-virus-antibodies-escape-lung.png";
AntibodiesEscapeLung.oneshot = true;

class AntibodiesEscapeIntestine extends VirusCard {
    applyEffects() {
        this.searchAndRemoveAllImmuneCardsWithTitle("Intestine Antibodies");
    }
}
AntibodiesEscapeIntestine.title = "Antibodies Escape Intestine";
AntibodiesEscapeIntestine.kind = "Antibodies Escape";
AntibodiesEscapeIntestine.art = "assets/cards/card-virus-antibodies-escape-intestine.png";
AntibodiesEscapeIntestine.oneshot = true;

let virusCardClassPool = [
    LiverTropism,
    LungTropism,
    IntestineTropism,
    AntiviralResistance,
    BlueCytokineNeutralisation,
    GreenCytokineNeutralisation,
    RedCytokineNeutralisation,
    AntibodiesEscapeLiver,
    AntibodiesEscapeLung,
    AntibodiesEscapeIntestine,
]

// Immune Cards
class ImmuneCard {
    constructor() {
        this.cardId = cardIds++;
        // Ughhhh apparently this is how we make 'static' data be visible in the instance!
        this.title = this.constructor.title;
        this.kind = this.constructor.kind;
        this.art = this.constructor.art;
        this.needsInteraction = this.constructor.needsInteraction;
        this.oneshot = this.constructor.oneshot;
    }

    applyEffectsToLoc() {
        console.log("WARNING: applyEffectsToLoc not implemented for an immune card that needs it?");
    }

    applyEffects() {
        console.log("WARNING: applyEffects not implemented for an immune card that needs it?");
    }

    removeEffects() {
        console.log("WARNING: removeEffects not implemented for an immune card that needs it?");
    }

    getAffectedCells() {
        console.log("WARNING: getAffectedCells not implemented for an immune card that needs it?");
    }

    canPlaceHere() {
        console.log("WARNING: canPlaceHere not implemented for an immune card that needs it?");
    }

    getEffectCSSClass() {
        console.log("WARNING: getEffectCSSClass not implemented for an immune card that needs it?");
    }

    getAffectedCellsForCytokine(row, column) {
        let affectedCells = [];
        if (!gameState.grid[row][column].isClean()) {
            return [];
        } else {
            affectedCells.push([row, column]);
        }
        if (row != 0 && gameState.grid[row - 1][column].isClean()) {
            affectedCells.push([row - 1, column]);
        }
        if (row != TISSUE_HEIGHT - 1 && gameState.grid[row + 1][column].isClean()) {
            affectedCells.push([row + 1, column]);
        }
        if (column != 0
            && gameState.grid[row][column - 1].isSameTissue(gameState.grid[row][column])
            && gameState.grid[row][column - 1].isClean()) {
            affectedCells.push([row, column - 1]);
        }
        if (column != ALL_TISSUE_WIDTH - 1
            && gameState.grid[row][column + 1].isSameTissue(gameState.grid[row][column])
            && gameState.grid[row][column + 1].isClean()) {
            affectedCells.push([row, column + 1]);
        }
        return affectedCells;
    }

    applyCytokineProtection(row, column) {
        let affectedCells = this.getAffectedCellsForCytokine(row, column);
        gameState.interactionCard.targetedCells = affectedCells;
        for (let coord of affectedCells) {
            gameState.grid[coord[0]][coord[1]].protectWith(gameState.interactionCard);
        }
    }

    removeCytokineProtection() {
        if (this.targetedCells === undefined || this.targetedCells === null) {
            console.log("called removeCytokineProtection on card that hadn't applied it?");
        }
        for (let coord of this.targetedCells) {
            gameState.grid[coord[0]][coord[1]].unprotect();
        }
    }

    getAffectedCellsForAntibodies(row, column) {
        let affectedCells = [];

        let firstColumn = TISSUE_WIDTH * (Math.floor(column / TISSUE_WIDTH));

        for (let i = 0; i < TISSUE_WIDTH; i++) {
            let currentColumn = firstColumn + i;
            if (gameState.grid[row][currentColumn].isInfected()) {
                // Cannot ever place it where the virus is!
                return [];
            }
            if (gameState.grid[row][currentColumn].isClean()) {
                affectedCells.push([row, currentColumn]);
            }
        }

        return affectedCells;
    }

    applyAntibodyProtection(row, column) {
        let affectedCells = this.getAffectedCellsForAntibodies(row, column);
        gameState.interactionCard.targetedCells = affectedCells;
        for (let coord of affectedCells) {
            gameState.grid[coord[0]][coord[1]].protectWith(gameState.interactionCard);
        }
    }

    removeAntibodyProtection() {
        if (this.targetedCells === undefined || this.targetedCells === null) {
            console.log("called removeAntibodyProtection on card that hadn't applied it?");
        }
        for (let coord of this.targetedCells) {
            gameState.grid[coord[0]][coord[1]].unprotect();
        }
    }

    getAffectedCellsForTCells(row, column) {
        let affectedCells = [];
        let firstColumn = TISSUE_WIDTH * (Math.floor(column / TISSUE_WIDTH));
        for (let i = 0; i < TISSUE_WIDTH; i++) {
            affectedCells.push([row, firstColumn + i]);
        }
        return affectedCells;
    }

    applyTCells(row, column) {
        let affectedCells = this.getAffectedCellsForTCells(row, column);
        for (let coord of affectedCells) {
            if (gameState.grid[coord[0]][coord[1]].isInfected()) {
                gameState.grid[coord[0]][coord[1]].removeInfection();
            }
        }
    }
}

class Antiviral extends ImmuneCard {
    applyEffects() {
        gameState.replicationSpeed--;
    }

    removeEffects() {
        gameState.replicationSpeed++;
    }
}
Antiviral.title = "Antiviral";
Antiviral.kind = "Antiviral";
Antiviral.art = "assets/cards/card-immune-antiviral.png";
Antiviral.needsInteraction = false;
Antiviral.oneshot = false;

class CytokinesBlue extends ImmuneCard {
    applyEffectsToLoc(row, column) {
        this.applyCytokineProtection(row, column);
    }

    removeEffects() {
        this.removeCytokineProtection();
    }

    getAffectedCells(row, column) {
        return this.getAffectedCellsForCytokine(row, column);
    }

    canPlaceHere(row, column) {
        return gameState.grid[row][column].isClean();
    }

    getEffectCSSClass() {
        return "cytokine-blue";
    }
}
CytokinesBlue.title = "Blue Cytokines";
CytokinesBlue.kind = "Cytokines";
CytokinesBlue.art = "assets/cards/card-immune-cytokines-blue.png";
CytokinesBlue.needsInteraction = true;
CytokinesBlue.oneshot = false;

class CytokinesRed extends ImmuneCard {
    applyEffectsToLoc(row, column) {
        this.applyCytokineProtection(row, column);
    }

    removeEffects() {
        this.removeCytokineProtection();
    }

    getAffectedCells(row, column) {
        return this.getAffectedCellsForCytokine(row, column);
    }

    canPlaceHere(row, column) {
        return gameState.grid[row][column].isClean();
    }

    getEffectCSSClass() {
        return "cytokine-red";
    }
}
CytokinesRed.title = "Red Cytokines";
CytokinesRed.kind = "Cytokines";
CytokinesRed.art = "assets/cards/card-immune-cytokines-red.png";
CytokinesRed.needsInteraction = true;
CytokinesRed.oneshot = false;

class CytokinesGreen extends ImmuneCard {
    applyEffectsToLoc(row, column) {
        this.applyCytokineProtection(row, column);
    }

    removeEffects() {
        this.removeCytokineProtection();
    }

    getAffectedCells(row, column) {
        return this.getAffectedCellsForCytokine(row, column);
    }

    canPlaceHere(row, column) {
        return gameState.grid[row][column].isClean();
    }

    getEffectCSSClass() {
        return "cytokine-green";
    }
}
CytokinesGreen.title = "Green Cytokines";
CytokinesGreen.kind = "Cytokines";
CytokinesGreen.art = "assets/cards/card-immune-cytokines-green.png";
CytokinesGreen.needsInteraction = true;
CytokinesGreen.oneshot = false;

class AntibodiesLiver extends ImmuneCard {
    applyEffectsToLoc(row, column) {
        this.applyAntibodyProtection(row, column);
    }

    removeEffects() {
        this.removeAntibodyProtection();
    }

    getAffectedCells(row, column) {
        if (this.canPlaceHere(row, column)) {
            return this.getAffectedCellsForAntibodies(row, column);
        }
        return [];
    }

    canPlaceHere(row, column) {
        return (
            gameState.grid[row][column].isClean()
            && gameState.grid[row][column].isTissue(Tissue.LIVER)
        );
    }

    getEffectCSSClass() {
        return "antibodies-liver";
    }
}
AntibodiesLiver.title = "Liver Antibodies";
AntibodiesLiver.kind = "Antibodies";
AntibodiesLiver.art = "assets/cards/card-immune-antibodies-liver.png";
AntibodiesLiver.needsInteraction = true;
AntibodiesLiver.oneshot = false;

class AntibodiesLung extends ImmuneCard {
    applyEffectsToLoc(row, column) {
        this.applyAntibodyProtection(row, column);
    }

    removeEffects() {
        this.removeAntibodyProtection();
    }

    getAffectedCells(row, column) {
        if (this.canPlaceHere(row, column)) {
            return this.getAffectedCellsForAntibodies(row, column);
        }
        return [];
    }

    canPlaceHere(row, column) {
        return (
            gameState.grid[row][column].isClean()
            && gameState.grid[row][column].isTissue(Tissue.LUNG)
        );
    }

    getEffectCSSClass() {
        return "antibodies-lung";
    }
}
AntibodiesLung.title = "Lung Antibodies";
AntibodiesLung.kind = "Antibodies";
AntibodiesLung.art = "assets/cards/card-immune-antibodies-lung.png";
AntibodiesLung.needsInteraction = true;
AntibodiesLung.oneshot = false;

class AntibodiesIntestine extends ImmuneCard {
    applyEffectsToLoc(row, column) {
        this.applyAntibodyProtection(row, column);
    }

    removeEffects() {
        this.removeAntibodyProtection();
    }

    getAffectedCells(row, column) {
        if (this.canPlaceHere(row, column)) {
            return this.getAffectedCellsForAntibodies(row, column);
        }
        return [];
    }

    canPlaceHere(row, column) {
        return (
            gameState.grid[row][column].isClean()
            && gameState.grid[row][column].isTissue(Tissue.INTESTINE)
        );
    }

    getEffectCSSClass() {
        return "antibodies-intestine";
    }
}
AntibodiesIntestine.title = "Intestine Antibodies";
AntibodiesIntestine.kind = "Antibodies";
AntibodiesIntestine.art = "assets/cards/card-immune-antibodies-intestine.png";
AntibodiesIntestine.needsInteraction = true;
AntibodiesIntestine.oneshot = false;

class TCellsLiver extends ImmuneCard {
    applyEffectsToLoc(row, column) {
        this.applyTCells(row, column);
    }

    getAffectedCells(row, column) {
        if (this.canPlaceHere(row, column)) {
            return this.getAffectedCellsForTCells(row, column);
        }
        return [];
    }

    canPlaceHere(row, column) {
        return gameState.grid[row][column].isTissue(Tissue.LIVER);
    }

    getEffectCSSClass() {
        return "virus-removal";
    }
}
TCellsLiver.title = "Liver T Cells";
TCellsLiver.kind = "T Cells";
TCellsLiver.art = "assets/cards/card-immune-t-cell-liver.png";
TCellsLiver.needsInteraction = true;
TCellsLiver.oneshot = true;

class TCellsLung extends ImmuneCard {
    applyEffectsToLoc(row, column) {
        this.applyTCells(row, column);
    }

    getAffectedCells(row, column) {
        if (this.canPlaceHere(row, column)) {
            return this.getAffectedCellsForTCells(row, column);
        }
        return [];
    }

    canPlaceHere(row, column) {
        return gameState.grid[row][column].isTissue(Tissue.LUNG);
    }

    getEffectCSSClass() {
        return "virus-removal";
    }
}
TCellsLung.title = "Lung T Cells";
TCellsLung.kind = "T Cells";
TCellsLung.art = "assets/cards/card-immune-t-cell-lung.png";
TCellsLung.needsInteraction = true;
TCellsLung.oneshot = true;

class TCellsIntestine extends ImmuneCard {
    applyEffectsToLoc(row, column) {
        this.applyTCells(row, column);
    }

    getAffectedCells(row, column) {
        if (this.canPlaceHere(row, column)) {
            return this.getAffectedCellsForTCells(row, column);
        }
        return [];
    }

    canPlaceHere(row, column) {
        return gameState.grid[row][column].isTissue(Tissue.INTESTINE);
    }

    getEffectCSSClass() {
        return "virus-removal";
    }
}
TCellsIntestine.title = "Intestine T Cells";
TCellsIntestine.kind = "T Cells";
TCellsIntestine.art = "assets/cards/card-immune-t-cell-intestine.png";
TCellsIntestine.needsInteraction = true;
TCellsIntestine.oneshot = true;

let immuneCardClassPool = [
    Antiviral,
    CytokinesBlue,
    CytokinesRed,
    CytokinesGreen,
    AntibodiesLiver,
    AntibodiesLung,
    AntibodiesIntestine,
    TCellsLiver,
    TCellsLung,
    TCellsIntestine,
];