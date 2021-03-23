let NUM_TISSUES = 3;
let TISSUE_WIDTH = 5;
let TISSUE_HEIGHT = 10;
let ALL_TISSUE_WIDTH = TISSUE_WIDTH * NUM_TISSUES;
let NUM_CARDS_TO_DRAFT_FROM_PER_TURN = 3;
let NUM_CARDS_TO_SELECT_IN_DRAFT_PER_TURN = 2;
let MAX_MUTATION_ATTEMPTS = 2;
let STATE_TRANSITION_WAIT = 4000; // Make super slow for now, optimise later.

// Game presentation related vars
let gridDivs = null;

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

//
// -- BETA FEATURES --
//
const BetaFeature = {
    CYTOKINE_NEUT_PREVENTS_PLAY: "bfCytokineNeutPreventsPlay",
    CYTOKINE_TIME_LIMIT: "bfCytokineTimeLimit",
    CHOOSE_3_FROM_5: "bfChoose3From5",
    PLAY_2_PER_TURN: "bfPlay2PerTurn",
}

let betaFeatures = null;

function checkBetaFeatureInUI(featureName) {
    return $(`#${featureName}`).is(":checked");
}

function setBetaFeaturesFromUI() {
    betaFeatures = {};
    for (const [_, value] of Object.entries(BetaFeature)) {
        betaFeatures[value] = checkBetaFeatureInUI(value);
    }
}

function isBetaFeatureEnabled(feature) {
    return betaFeatures[feature];
}

function forceOnBetaFeature(feature) {
    betaFeatures[feature] = true;
}

function forceOffBetaFeature(feature) {
    betaFeatures[feature] = false;
}
//
// -- END BETA FEATURES --
//

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
    WAITING_TO_START: 1,
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

function placeVirusOnGridIfClean(row, column) {
    if (gameState.grid[row][column].isClean()) {
        gameState.grid[row][column].markInfected();
    }
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
    let infectingLiver = gameState.virusCards.filter(c => c.title == "Liver Tropism").length > 0;
    let infectingLung = gameState.virusCards.filter(c => c.title == "Lung Tropism").length > 0;
    let infectingIntestine = gameState.virusCards.filter(c => c.title == "Intestine Tropism").length > 0;
    for (let row = TISSUE_HEIGHT - 2; row >= 0; row--) {
        if (areAnyCellsInRowInfected(row)) {
            for (let column = 0; column < ALL_TISSUE_WIDTH; column++) {
                if (column >= 0 && column < TISSUE_WIDTH && !infectingLiver) {
                    continue;
                }
                if (column >= (TISSUE_WIDTH) && column < (TISSUE_WIDTH * 2) && !infectingLung) {
                    continue;
                }
                if (column >= (TISSUE_WIDTH * 2) && column < (TISSUE_WIDTH * 3) && !infectingIntestine) {
                    continue;
                }
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

function checkVirusCardExpiry() {
    gameState.virusCards.forEach(function (card) {
        if (card.expires) {
            card.duration--;
            if (card.duration == 0) {
                card.removeEffects();
            }
        }
    });
    gameState.virusCards = gameState.virusCards.filter(c => (!c.expires) || (c.duration > 0));
    gameState.virusCardsChanged = true;
}

function checkImmuneCardExpiry() {
    gameState.activeImmuneCards.forEach(function (card) {
        if (card.expires) {
            card.duration--;
            if (card.duration == 0) {
                card.removeEffects();
            }
        }
    });
    gameState.activeImmuneCards = gameState.activeImmuneCards.filter(c => (!c.expires) || (c.duration > 0));
    gameState.activeImmuneCardsChanged = true;
}

function generateInitialVirusCards() {
    let cards = [];

    let numTropismsToGive = 2;
    if (gameState.hardMode) {
        numTropismsToGive = 3
    }

    let tropismCardClassPool = shuffle(virusCardClassPool.filter(cl => cl.kind === "Tropism"));
    for (let i = 0; i < numTropismsToGive; i++) {
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
                    case "Orange Cytokines":
                        newCardClass = OrangeCytokineNeutralisation;
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
    if (percentChance(80) || gameState.virusCards.length == 1) {
        // Add a new card...
        let newCardClass = getSuitableNewVirusCardClass();
        let newCard = new newCardClass();
        newCard.applyEffects()
        gameState.virusCards.push(newCard);
        gameState.virusCardsChanged = true;
        if (newCard.expires) {
            toastMessage(`The virus mutated and played ${newCard.title}!`);
        } else {
            toastMessage(`The virus mutated and gained ${newCard.title}!`);
        }
    } else {
        // Remove a card...
        let cardToRemove = getSuitableVirusCardToRemove();
        let newVirusCards = gameState.virusCards.filter(c => c != cardToRemove);
        gameState.virusCards = newVirusCards;
        gameState.virusCardsChanged = true;
        cardToRemove.removeEffects();
        toastMessage(`The virus mutated and lost ${cardToRemove.title}!`);
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

function setupGame(hardMode) {
    gameState = {
        grid: generateGameStateGrid(),
        virusCards: [],
        virusCardsChanged: true,
        activeImmuneCards: [],
        inactiveImmuneCards: [],
        activeImmuneCardsChanged: true,
        inactiveImmuneCardsChanged: true,
        state: PlayStates.WAITING_TO_START,
        playerDraftPool: [],
        numCardsSelectedInDraftPool: 0,
        interactionCard: null,
        oldReplicationSpeed: null,
        numCardsPlayedThisTurn: 0,
    }

    if (hardMode) {
        gameState.replicationSpeed = 10;
        gameState.hardMode = true;
    } else {
        gameState.replicationSpeed = 8;
        gameState.hardMode = false;
    }

    if (isBetaFeatureEnabled(BetaFeature.CHOOSE_3_FROM_5)) {
        // Guess these weren't constant after all.
        NUM_CARDS_TO_DRAFT_FROM_PER_TURN = 5;
        NUM_CARDS_TO_SELECT_IN_DRAFT_PER_TURN = 3;
    }

    gameState.virusCards = generateInitialVirusCards();
    gameState.virusCardsChanged = true;
    placeVirusBasedOnCards();

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
    return gameState.numCardsSelectedInDraftPool == NUM_CARDS_TO_SELECT_IN_DRAFT_PER_TURN;
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
                    placeVirusOnGridIfClean(newSpawnLoc[0], newSpawnLoc[1]);
                }
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
    switchPlayState(PlayStates.PLAYER_PLAY_PHASE_READY);
    finishedHandlingState(500);
}

handlers[PlayStates.PLAYER_PLAY_PHASE_READY] = function () {
    if (isBetaFeatureEnabled(BetaFeature.PLAY_2_PER_TURN)) {
        toastMessage("Play up to two immune cards!");
        $("#endTurnButton").text("End my turn - 2 cards remaining");
    } else {
        toastMessage("Play immune cards!");
        $("#endTurnButton").text("End my turn");
    }
    gameState.numCardsPlayedThisTurn = 0;
    switchPlayState(PlayStates.PLAYER_PLAY_PHASE_WAITING);
    setupUIForPlayPhase();
    finishedHandlingState();
}

handlers[PlayStates.PLAYER_PLAY_PHASE_DONE] = function () {
    switchPlayState(PlayStates.VIRUS_MUTATION_READY);
    finishedHandlingState(1000);
}

handlers[PlayStates.VIRUS_MUTATION_READY] = function () {
    checkVirusCardExpiry();
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
    finishedHandlingState(5000);
}

handlers[PlayStates.VIRUS_MUTATION_DONE] = function () {
    switchPlayState(PlayStates.VIRUS_MOVES_DOWN_READY);
    finishedHandlingState(500);
}

handlers[PlayStates.VIRUS_MOVES_DOWN_READY] = function () {
    gameState.replicationAttempts = 0;
    switchPlayState(PlayStates.VIRUS_MOVES_DOWN_ACTIVE);
    toastMessage("The virus is trying to replicate and spread!");
    finishedHandlingState(700);
}

handlers[PlayStates.VIRUS_MOVES_DOWN_ACTIVE] = function () {
    if (gameState.replicationAttempts == gameState.replicationSpeed) {
        if (virusHasWon()) {
            switchPlayState(PlayStates.BODY_DEFEATED);
        } else {
            switchPlayState(PlayStates.VIRUS_MOVES_DOWN_DONE);
        }
    } else {
        if (virusHasWon()) {
            switchPlayState(PlayStates.BODY_DEFEATED);
        } else if (!doesVirusHaveAnyAttackPoints()) {
            if (!doesVirusHaveAnySpawnPoints()) {
                switchPlayState(PlayStates.VIRUS_DEFEATED);
            } else {
                switchPlayState(PlayStates.VIRUS_MOVES_DOWN_DONE);
            }
        } else {
            if (coinFlip()) {
                let virusAttackPoints = findValidVirusAttackPoints();
                let newSpawnLoc = randomElement(virusAttackPoints);
                placeVirusOnGridIfClean(newSpawnLoc[0], newSpawnLoc[1]);
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

function getInteractiveDivForCard(card, isActiveCard) {
    let div = null;

    let cssClasses = "card";
    if (isActiveCard) {
        cssClasses += " activeCard";
    }

    if (card.smallart !== null && card.smallart !== undefined) {
        div = $(`<div class="cardContainer"><div class="${cssClasses}" style="background-image: url('${card.smallart}'); "><div class="cardBlowUp hidden" style="background-image: url('${card.art}'); "></div></div></div>`);
    } else {
        if (card.art !== null) {
            div = $(`<div class="cardContainer"><div class="${cssClasses}"><div class="cardText">${card.title}</div><div class="cardBlowUp hidden" style="background-image: url('${card.art}');"></div></div></div>`);
        } else {
            div = $(`<div class="cardContainer"><div class="${cssClasses}"><div class="cardText">${card.title}</div></div></div>`);
        }
    }


    div.mouseenter(function () {
        div.find(".cardBlowUp").removeClass("hidden");
    });
    div.mouseleave(function () {
        div.find(".cardBlowUp").addClass("hidden");
    });
    return div;
}

function showEndScreen(msg) {
    $("#chooseCardMsg").empty();
    let msgDiv = $(`<div>${msg}</div>`);

    let resetButton = $('<div class="button marginButton">Reset Game</div>');
    $(resetButton).click(resetGame);

    let learnMoreButton = $('<div class="button marginButton">Learn More!</div>');
    $(learnMoreButton).click(function () {
        window.location.href = "http://lab.tevelthuis.com/game-virus-vs-host";
    });

    $("#chooseCardMsg").append(msgDiv);
    $("#chooseCardMsg").append(resetButton);
    $("#chooseCardMsg").append(learnMoreButton);

    $("#chooseCardPanel").empty();
    $("#chooseCardDisplay").addClass("show");
}

function showLossScreen() {
    showEndScreen("The virus has spread through the entire tissue - you've lost!");
}

function showWinScreen() {
    showEndScreen("You've contained the virus - you've won!");
}

function generateGridForTissue(cellsGridDiv, tissueIndex) {
    cellsGridDiv.empty();
    for (let row = 0; row < TISSUE_HEIGHT; row++) {
        let currentRow = $('<div class="tissueCellRow"></div>');
        cellsGridDiv.append(currentRow);
        if (tissueIndex === 0) {
            gridDivs.push([]);
        }
        for (let column = 0; column < TISSUE_WIDTH; column++) {
            let currentCell = $('<div class="tissueCellColumn"></div>');
            currentRow.append(currentCell);
            gridDivs[row].push(currentCell);
        }
    }
}

function updateGridView() {
    let liverTropismPresent = gameState.virusCards.filter(c => c.title == "Liver Tropism").length > 0;
    let lungTropismPresent = gameState.virusCards.filter(c => c.title == "Lung Tropism").length > 0;
    let intestineTropismPresent = gameState.virusCards.filter(c => c.title == "Intestine Tropism").length > 0;
    for (let row = 0; row < TISSUE_HEIGHT; row++) {
        for (let column = 0; column < ALL_TISSUE_WIDTH; column++) {
            let div = gridDivs[row][column];
            div.removeClass();
            div.addClass("tissueCellColumn");
            if (Math.floor(column / TISSUE_WIDTH) == 0) {
                if (liverTropismPresent) {
                    div.addClass("tropismPresent");
                } else {
                    div.addClass("tropismNotPresent");
                }
            } else if (Math.floor(column / TISSUE_WIDTH) == 1) {
                if (lungTropismPresent) {
                    div.addClass("tropismPresent");
                } else {
                    div.addClass("tropismNotPresent");
                }
            } else {
                if (intestineTropismPresent) {
                    div.addClass("tropismPresent");
                } else {
                    div.addClass("tropismNotPresent");
                }
            }
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
    let cardNumberText = "two";
    if (isBetaFeatureEnabled(BetaFeature.CHOOSE_3_FROM_5)) {
        cardNumberText = "three";
    }

    $("#chooseCardMsg").text(`Pick ${cardNumberText} immune cards`);
    $("#chooseCardPanel").empty();
    gameState.playerDraftPool.forEach(function (item, _) {
        let cardDiv = getInteractiveDivForCard(item);
        cardDiv.click(function () {
            playerDraftedCard(item);
            cardDiv.remove();
            updateCardPanels();
            if (checkIfFinishedDrafting()) {
                $("#chooseCardPanel").empty();
                $("#chooseCardMsg").off("click");
                hideChooseCardPanel();

                switchPlayState(PlayStates.PLAYER_DRAW_PHASE_DONE);
                finishedHandlingState(500);

            }
        });
        $("#chooseCardPanel").append(cardDiv);
    });
    $("#chooseCardMsg").click(function () {
        if ($("#chooseCardPanel").hasClass("gone")) {
            $("#chooseCardPanel").removeClass("gone");
            $("#chooseCardMsg").text(`Pick ${cardNumberText} immune cards`);
        } else {
            $("#chooseCardPanel").addClass("gone");
            $("#chooseCardMsg").text("Click to show cards");
        }
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
                $("#activeImmuneCardPanel").append(getInteractiveDivForCard(item, true));
            });
        }
        gameState.activeImmuneCardsChanged = false;
    }
}

function createCardClickHandler(gameCard, uiCard) {
    return function () {
        if (gameState.state === PlayStates.PLAYER_PLAY_PHASE_WAITING) {
            let cardWasHandled = playCardUISide(gameCard, uiCard);
            if (cardWasHandled) {
                $(uiCard).off("click");
            }
            // Do we ever need to update anything else? GridView?
        }
    }
}

function updateInactiveCardPanel() {
    if (gameState.inactiveImmuneCardsChanged) {
        $("#inactiveImmuneCardPanel").empty();
        for (let index = 0; index < gameState.inactiveImmuneCards.length; index++) {
            let gameCard = gameState.inactiveImmuneCards[index];
            let uiCard = getInteractiveDivForCard(gameCard);
            $("#inactiveImmuneCardPanel").append(uiCard);
            if (gameState.state === PlayStates.PLAYER_PLAY_PHASE_WAITING) {
                $(uiCard).click(createCardClickHandler(gameCard, uiCard));
            }
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
    let newString = gameState.replicationSpeed.toString();
    if (gameState.oldReplicationSpeed !== null) {
        newString += `, was ${gameState.oldReplicationSpeed}`;
    }
    $("#virusReplicationSpeed").text(newString);
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

function makeCardInactive(card) {
    gameState.activeImmuneCards = gameState.activeImmuneCards.filter(c => c !== card);
    gameState.inactiveImmuneCards.push(card);
    gameState.inactiveImmuneCardsChanged = true;
    gameState.activeImmuneCardsChanged = true;
}

function cardWasPlayed() {
    gameState.numCardsPlayedThisTurn++;
    if (isBetaFeatureEnabled(BetaFeature.PLAY_2_PER_TURN)) {
        // We sneakily get away with this right now
        $("#endTurnButton").text("End my turn - 1 card remaining");
        if (gameState.numCardsPlayedThisTurn == 2) {
            toastMessage("Turn is over!");
            teardownUIAfterPlayPhase();
        }
    }
}

function leaveInteractiveMode() {
    gameState.interactionCard = null;
    $("#boardText").addClass("gone");
    removeGridListeners();
    updateGridView();

    // Disable the cancel button
    $("#cancelButton").addClass("gone");
    $("#cancelSpacer").addClass("gone");
    $("#cancelButton").off("click");

    switchPlayState(PlayStates.PLAYER_PLAY_PHASE_WAITING);
}

function enterInteractiveMode(gameCard, uiCard) {
    $("#boardText").text("Click on a cell to play the card!");
    $("#boardText").removeClass("gone");

    gameState.interactionCard = gameCard;
    addGridListeners();
    makeCardActive(gameCard);
    updateActiveCardPanel();
    updateInactiveCardPanel();

    // Enable the cancel button
    $("#cancelButton").removeClass("gone");
    $("#cancelSpacer").removeClass("gone");
    $("#cancelButton").click(function () {
        leaveInteractiveMode();
        makeCardInactive(gameCard);
        updateActiveCardPanel();
        updateInactiveCardPanel();
    });

    switchPlayState(PlayStates.PLAYER_PLAY_PHASE_INTERACTING);
}

// This function returns true if the card was handled successfully.
function playCardUISide(gameCard, uiCard) {
    if (!gameCard.canBePlayed()) {
        toastMessage(gameCard.getUnplayableReason());
        return false;
    } else if (gameCard.causesStateChange) {
        console.log("THIS SHOULD NOT BE HAPPENING - gameCard.causesStateChange!");
        return false;
    } else if (gameCard.needsInteraction) {
        enterInteractiveMode(gameCard, uiCard);
        return true;
    } else {
        gameCard.applyEffects();
        makeCardActive(gameCard);
        updateActiveCardPanel();
        updateInactiveCardPanel();
        updateOtherData();
        cardWasPlayed();
        return true;
    }
}

function teardownUIAfterPlayPhase() {
    if (gameState.state === PlayStates.PLAYER_PLAY_PHASE_WAITING) {
        switchPlayState(PlayStates.PLAYER_PLAY_PHASE_DONE);
        // Force a refresh of inactive cards to get handlers removed
        gameState.inactiveImmuneCardsChanged = true;
        updateInactiveCardPanel();

        $("#controlButtons").addClass("gone");
        $("#endTurnButton").off("click");
        finishedHandlingState(500);
    }
}

function setupUIForPlayPhase() {
    checkImmuneCardExpiry();
    updateGridView();
    updateActiveCardPanel();
    // Force a refresh of inactive cards to get handlers attached
    gameState.inactiveImmuneCardsChanged = true;
    updateInactiveCardPanel();

    $("#endTurnButton").click(function () {
        teardownUIAfterPlayPhase();
    });
    $("#controlButtons").removeClass("gone");
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
            leaveInteractiveMode();
            cardWasPlayed();
        } else {
            toastMessage("Cannot play this here!", 1000);
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

function alertReplicationSpeedChanged() {
    $("#virusReplicationSpeed").addClass("highlight");
    setTimeout(function () {
        $("#virusReplicationSpeed").removeClass("highlight");
        gameState.oldReplicationSpeed = null;
    }, 10000);
}

function resetGame() {
    $("#chooseCardMsg").empty();
    $("#chooseCardDisplay").removeClass("show");
    $("#chooseCardMsg").off("click");
    $("#introText").removeClass("gone");
    $("#wholeGame").addClass("gone");
    generateCompleteGrid();
    switchPlayState(PlayStates.WAITING_TO_START);
}

function hookupDifficultyButtons() {
    $("#startNormalButton").click(function () {
        setBetaFeaturesFromUI();
        // always turn off CYTOKINE_TIME_LIMIT on normal mode
        forceOffBetaFeature(BetaFeature.CYTOKINE_TIME_LIMIT);
        setupGame(false /* normal */);
        $("#introText").addClass("gone")
        $("#wholeGame").removeClass("gone");
        updateUI();
        switchPlayState(PlayStates.VIRUS_MOVES_SIDEWAYS_READY);
        finishedHandlingState(500);
    });

    $("#startHardButton").click(function () {
        setBetaFeaturesFromUI();
        // always turn on CYTOKINE_TIME_LIMIT on hard mode
        forceOnBetaFeature(BetaFeature.CYTOKINE_TIME_LIMIT);
        setupGame(true /* hard */);
        $("#introText").addClass("gone")
        $("#wholeGame").removeClass("gone");
        updateUI();
        switchPlayState(PlayStates.VIRUS_MOVES_SIDEWAYS_READY);
        finishedHandlingState(500);
    });
}

function hookupBetaFeaturePanel() {
    $("#betaFeatureTitle").click(function () {
        $("#betaFeaturePanel").removeClass("gone");
        $("#betaFeatureTitle").text("Beta Features!")
        $("#betaFeatureTitle").addClass("big")
        $("#betaFeatureTitle").off("click");
    });
}

function generateCompleteGrid() {
    gridDivs = [];
    generateGridForTissue($("#liverCells"), 0, "Liver");
    generateGridForTissue($("#lungCells"), 1, "Lung");
    generateGridForTissue($("#intestineCells"), 2, "Intestine");
}

// OnLoad
function onLoad() {
    generateCompleteGrid();
    hookupDifficultyButtons();
    hookupBetaFeaturePanel();
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
        this.smallart = this.constructor.smallart;
        this.expires = this.constructor.expires;
        this.duration = this.constructor.duration;
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
        placeVirusOnGridIfClean(0, Math.floor(TISSUE_WIDTH / 2));
    }

    removeEffects() { }
}
LiverTropism.title = "Liver Tropism";
LiverTropism.kind = "Tropism";
LiverTropism.art = "assets/cards/card-virus-tropism-liver.png";
LiverTropism.smallart = "assets/cards/small/card-virus-tropism-liver.png";
LiverTropism.expires = false;
LiverTropism.duration = 0;

class LungTropism extends VirusCard {
    applyEffects() {
        placeVirusOnGridIfClean(0, TISSUE_WIDTH + Math.floor(TISSUE_WIDTH / 2));
    }

    removeEffects() { }
}
LungTropism.title = "Lung Tropism";
LungTropism.kind = "Tropism";
LungTropism.art = "assets/cards/card-virus-tropism-lung.png";
LungTropism.smallart = "assets/cards/small/card-virus-tropism-lung.png";
LungTropism.expires = false;
LungTropism.duration = 0;

class IntestineTropism extends VirusCard {
    applyEffects() {
        placeVirusOnGridIfClean(0, (TISSUE_WIDTH * 2) + Math.floor(TISSUE_WIDTH / 2));
    }

    removeEffects() { }
}
IntestineTropism.title = "Intestine Tropism";
IntestineTropism.kind = "Tropism";
IntestineTropism.art = "assets/cards/card-virus-tropism-intestine.png";
IntestineTropism.smallart = "assets/cards/small/card-virus-tropism-intestine.png";
IntestineTropism.expires = false;
IntestineTropism.duration = 0;

class AntiviralResistance extends VirusCard {
    applyEffects() {
        if (gameState.replicationSpeed < 16) {
            gameState.oldReplicationSpeed = gameState.replicationSpeed;
            gameState.replicationSpeed++;
            alertReplicationSpeedChanged();
            this.appliedEffect = true;
        } else {
            this.appliedEffect = false;
        }
    }

    removeEffects() {
        if (this.appliedEffect) {
            gameState.oldReplicationSpeed = gameState.replicationSpeed;
            gameState.replicationSpeed--;
            alertReplicationSpeedChanged();
        }
    }
}
AntiviralResistance.title = "Antiviral Resistance";
AntiviralResistance.kind = "Antiviral Resistance";
AntiviralResistance.art = "assets/cards/card-virus-antiviral-resistance.png";
AntiviralResistance.smallart = "assets/cards/small/card-virus-antiviral-resistance.png";
AntiviralResistance.expires = false;
AntiviralResistance.duration = 0;

class BlueCytokineNeutralisation extends VirusCard {
    constructor() {
        super();
        if (isBetaFeatureEnabled(BetaFeature.CYTOKINE_NEUT_PREVENTS_PLAY)) {
            this.art = "assets/cards/card-virus-cytokine-neutralisation-blue-temp.png";
        }
    }

    applyEffects() {
        this.searchAndRemoveRandomImmuneCardWithTitle("Blue Cytokines");
    }

    removeEffects() { }
}
BlueCytokineNeutralisation.title = "Blue Cytokine Neutralisation";
BlueCytokineNeutralisation.kind = "Cytokine Neutralisation";
BlueCytokineNeutralisation.art = "assets/cards/card-virus-cytokine-neutralisation-blue.png";
BlueCytokineNeutralisation.smallart = "assets/cards/small/card-virus-cytokine-neutralisation-blue.png";
BlueCytokineNeutralisation.expires = true;
BlueCytokineNeutralisation.duration = 2;

class OrangeCytokineNeutralisation extends VirusCard {
    constructor() {
        super();
        if (isBetaFeatureEnabled(BetaFeature.CYTOKINE_NEUT_PREVENTS_PLAY)) {
            this.art = "assets/cards/card-virus-cytokine-neutralisation-orange-temp.png";
        }
    }

    applyEffects() {
        this.searchAndRemoveRandomImmuneCardWithTitle("Orange Cytokines");
    }

    removeEffects() { }
}
OrangeCytokineNeutralisation.title = "Orange Cytokine Neutralisation";
OrangeCytokineNeutralisation.kind = "Cytokine Neutralisation";
OrangeCytokineNeutralisation.art = "assets/cards/card-virus-cytokine-neutralisation-orange.png";
OrangeCytokineNeutralisation.smallart = "assets/cards/small/card-virus-cytokine-neutralisation-orange.png";
OrangeCytokineNeutralisation.expires = true;
OrangeCytokineNeutralisation.duration = 2;

class RedCytokineNeutralisation extends VirusCard {
    constructor() {
        super();
        if (isBetaFeatureEnabled(BetaFeature.CYTOKINE_NEUT_PREVENTS_PLAY)) {
            this.art = "assets/cards/card-virus-cytokine-neutralisation-red-temp.png";
        }
    }

    applyEffects() {
        this.searchAndRemoveRandomImmuneCardWithTitle("Red Cytokines");
    }

    removeEffects() { }
}
RedCytokineNeutralisation.title = "Red Cytokine Neutralisation";
RedCytokineNeutralisation.kind = "Cytokine Neutralisation";
RedCytokineNeutralisation.art = "assets/cards/card-virus-cytokine-neutralisation-red.png";
RedCytokineNeutralisation.smallart = "assets/cards/small/card-virus-cytokine-neutralisation-red.png";
RedCytokineNeutralisation.expires = true;
RedCytokineNeutralisation.duration = 2;

class AntibodiesEscapeLiver extends VirusCard {
    applyEffects() {
        this.searchAndRemoveAllImmuneCardsWithTitle("Liver Antibodies");
    }

    removeEffects() { }
}
AntibodiesEscapeLiver.title = "Antibodies Escape Liver";
AntibodiesEscapeLiver.kind = "Antibodies Escape";
AntibodiesEscapeLiver.art = "assets/cards/card-virus-antibodies-escape-liver.png";
AntibodiesEscapeLiver.smallart = "assets/cards/small/card-virus-antibodies-escape-liver.png";
AntibodiesEscapeLiver.expires = true;
AntibodiesEscapeLiver.duration = 1;

class AntibodiesEscapeLung extends VirusCard {
    applyEffects() {
        this.searchAndRemoveAllImmuneCardsWithTitle("Lung Antibodies");
    }

    removeEffects() { }
}
AntibodiesEscapeLung.title = "Antibodies Escape Lung";
AntibodiesEscapeLung.kind = "Antibodies Escape";
AntibodiesEscapeLung.art = "assets/cards/card-virus-antibodies-escape-lung.png";
AntibodiesEscapeLung.smallart = "assets/cards/small/card-virus-antibodies-escape-lung.png";
AntibodiesEscapeLung.expires = true;
AntibodiesEscapeLung.duration = 1;

class AntibodiesEscapeIntestine extends VirusCard {
    applyEffects() {
        this.searchAndRemoveAllImmuneCardsWithTitle("Intestine Antibodies");
    }

    removeEffects() { }
}
AntibodiesEscapeIntestine.title = "Antibodies Escape Intestine";
AntibodiesEscapeIntestine.kind = "Antibodies Escape";
AntibodiesEscapeIntestine.art = "assets/cards/card-virus-antibodies-escape-intestine.png";
AntibodiesEscapeIntestine.smallart = "assets/cards/small/card-virus-antibodies-escape-intestine.png";
AntibodiesEscapeIntestine.expires = true;
AntibodiesEscapeIntestine.duration = 1;

let virusCardClassPool = [
    LiverTropism,
    LungTropism,
    IntestineTropism,
    AntiviralResistance,
    BlueCytokineNeutralisation,
    OrangeCytokineNeutralisation,
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
        this.smallart = this.constructor.smallart;
        this.needsInteraction = this.constructor.needsInteraction;
        this.expires = this.constructor.expires;
        this.duration = this.constructor.duration;
        // NB: this is not implemented as not yet needed.
        this.causesStateChange = this.constructor.causesStateChange;
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

    // We expect this to be overridden if required
    canBePlayed() {
        return true;
    }

    getUnplayableReason() {
        console.log("WARNING: getUnplayableReason not implemented for an immune card that needs it?");
        return "UNKNOWN REASON";
    }

    getAffectedCellsForWeakCytokine(row, column) {
        let affectedCells = [];
        if (!gameState.grid[row][column].isClean()) {
            return [];
        } else {
            affectedCells.push([row, column]);
        }
        return affectedCells;
    }

    getAffectedCellsForMediumCytokine(row, column) {
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

    getAffectedCellsForStrongCytokine(row, column) {
        let affectedCells = [];

        // 1 2 3
        // 4 5 6
        // 7 8 9

        // Position 5
        if (!gameState.grid[row][column].isClean()) {
            return [];
        } else {
            affectedCells.push([row, column]);
        }

        // Position 1
        if (column != 0
            && row != 0
            && gameState.grid[row - 1][column - 1].isSameTissue(gameState.grid[row][column])
            && gameState.grid[row - 1][column - 1].isClean()) {
            affectedCells.push([row - 1, column - 1]);
        }

        // Position 2
        if (row != 0 && gameState.grid[row - 1][column].isClean()) {
            affectedCells.push([row - 1, column]);
        }

        // Position 3
        if (row != 0
            && column != ALL_TISSUE_WIDTH - 1
            && gameState.grid[row - 1][column + 1].isSameTissue(gameState.grid[row][column])
            && gameState.grid[row - 1][column + 1].isClean()) {
            affectedCells.push([row - 1, column + 1]);
        }

        // Position 4
        if (column != 0
            && gameState.grid[row][column - 1].isSameTissue(gameState.grid[row][column])
            && gameState.grid[row][column - 1].isClean()) {
            affectedCells.push([row, column - 1]);
        }

        // Position 6
        if (column != ALL_TISSUE_WIDTH - 1
            && gameState.grid[row][column + 1].isSameTissue(gameState.grid[row][column])
            && gameState.grid[row][column + 1].isClean()) {
            affectedCells.push([row, column + 1]);
        }

        // Position 7
        if (column != 0
            && row != TISSUE_HEIGHT - 1
            && gameState.grid[row + 1][column - 1].isSameTissue(gameState.grid[row][column])
            && gameState.grid[row + 1][column - 1].isClean()) {
            affectedCells.push([row + 1, column - 1]);
        }

        // Position 8
        if (row != TISSUE_HEIGHT - 1 && gameState.grid[row + 1][column].isClean()) {
            affectedCells.push([row + 1, column]);
        }

        // Position 9
        if (row != TISSUE_HEIGHT - 1
            && column != ALL_TISSUE_WIDTH - 1
            && gameState.grid[row + 1][column + 1].isSameTissue(gameState.grid[row][column])
            && gameState.grid[row + 1][column + 1].isClean()) {
            affectedCells.push([row + 1, column + 1]);
        }

        return affectedCells;
    }

    applyCytokineProtection(row, column, affectedFunction) {
        let affectedCells = affectedFunction(row, column);
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
        if (gameState.replicationSpeed > 1) {
            gameState.oldReplicationSpeed = gameState.replicationSpeed;
            gameState.replicationSpeed--;
            alertReplicationSpeedChanged();
            this.appliedEffect = true;
        } else {
            this.appliedEffect = false;
        }
    }

    removeEffects() {
        if (this.appliedEffect) {
            gameState.oldReplicationSpeed = gameState.replicationSpeed;
            gameState.replicationSpeed++;
            alertReplicationSpeedChanged();
        }
    }
}
Antiviral.title = "Antiviral";
Antiviral.kind = "Antiviral";
Antiviral.art = "assets/cards/card-immune-antiviral.png";
Antiviral.smallart = "assets/cards/small/card-immune-antiviral.png";
Antiviral.needsInteraction = false;
Antiviral.expires = false;
Antiviral.duration = 0;
Antiviral.causesStateChange = false;

class CytokinesBlue extends ImmuneCard {
    constructor() {
        super()
        if (isBetaFeatureEnabled(BetaFeature.CYTOKINE_TIME_LIMIT)) {
            this.expires = true;
            this.art = "assets/cards/card-immune-cytokines-blue-temp.png";
        }
    }

    applyEffectsToLoc(row, column) {
        return this.applyCytokineProtection(row, column, this.getAffectedCellsForWeakCytokine);
    }

    removeEffects() {
        this.removeCytokineProtection();
    }

    getAffectedCells(row, column) {
        return this.getAffectedCellsForWeakCytokine(row, column);
    }

    canPlaceHere(row, column) {
        return gameState.grid[row][column].isClean();
    }

    getEffectCSSClass() {
        if (isBetaFeatureEnabled(BetaFeature.CYTOKINE_TIME_LIMIT)) {
            return "cytokine-blue-" + this.duration.toString();
        }
        return "cytokine-blue";
    }

    canBePlayed() {
        if (isBetaFeatureEnabled(BetaFeature.CYTOKINE_NEUT_PREVENTS_PLAY)) {
            return (
                gameState.virusCards.filter(
                    c => c.title === "Blue Cytokine Neutralisation"
                ).length == 0
            );
        } else {
            return true;
        }
    }

    getUnplayableReason() {
        return "Cannot play this card while the virus has a Blue Cytokine Neutralisation card!";
    }
}
CytokinesBlue.title = "Blue Cytokines";
CytokinesBlue.kind = "Cytokines";
CytokinesBlue.art = "assets/cards/card-immune-cytokines-blue.png";
CytokinesBlue.smallart = "assets/cards/small/card-immune-cytokines-blue.png";
CytokinesBlue.needsInteraction = true;
CytokinesBlue.expires = false;
CytokinesBlue.duration = 3; // only applies if we turn expires on
CytokinesBlue.causesStateChange = false;

class CytokinesRed extends ImmuneCard {
    constructor() {
        super()
        if (isBetaFeatureEnabled(BetaFeature.CYTOKINE_TIME_LIMIT)) {
            this.expires = true;
            this.art = "assets/cards/card-immune-cytokines-red-temp.png";
        }
    }

    applyEffectsToLoc(row, column) {
        return this.applyCytokineProtection(row, column, this.getAffectedCellsForStrongCytokine);
    }

    removeEffects() {
        this.removeCytokineProtection();
    }

    getAffectedCells(row, column) {
        return this.getAffectedCellsForStrongCytokine(row, column);
    }

    canPlaceHere(row, column) {
        return gameState.grid[row][column].isClean();
    }

    getEffectCSSClass() {
        if (isBetaFeatureEnabled(BetaFeature.CYTOKINE_TIME_LIMIT)) {
            return "cytokine-red-" + this.duration.toString();
        }
        return "cytokine-red";
    }

    canBePlayed() {
        if (isBetaFeatureEnabled(BetaFeature.CYTOKINE_NEUT_PREVENTS_PLAY)) {
            return (
                gameState.virusCards.filter(
                    c => c.title === "Red Cytokine Neutralisation"
                ).length == 0
            );
        } else {
            return true;
        }
    }

    getUnplayableReason() {
        return "Cannot play this card while the virus has a Red Cytokine Neutralisation card!";
    }
}
CytokinesRed.title = "Red Cytokines";
CytokinesRed.kind = "Cytokines";
CytokinesRed.art = "assets/cards/card-immune-cytokines-red.png";
CytokinesRed.smallart = "assets/cards/small/card-immune-cytokines-red.png";
CytokinesRed.needsInteraction = true;
CytokinesRed.expires = false;
CytokinesRed.duration = 3; // only applies if we turn expires on
CytokinesRed.causesStateChange = false;

class CytokinesOrange extends ImmuneCard {
    constructor() {
        super()
        if (isBetaFeatureEnabled(BetaFeature.CYTOKINE_TIME_LIMIT)) {
            this.expires = true;
            this.art = "assets/cards/card-immune-cytokines-orange-temp.png";
        }
    }

    applyEffectsToLoc(row, column) {
        return this.applyCytokineProtection(row, column, this.getAffectedCellsForMediumCytokine);
    }

    removeEffects() {
        this.removeCytokineProtection();
    }

    getAffectedCells(row, column) {
        return this.getAffectedCellsForMediumCytokine(row, column);
    }

    canPlaceHere(row, column) {
        return gameState.grid[row][column].isClean();
    }

    getEffectCSSClass() {
        if (isBetaFeatureEnabled(BetaFeature.CYTOKINE_TIME_LIMIT)) {
            return "cytokine-orange-" + this.duration.toString();
        }
        return "cytokine-orange";
    }

    canBePlayed() {
        if (isBetaFeatureEnabled(BetaFeature.CYTOKINE_NEUT_PREVENTS_PLAY)) {
            return (
                gameState.virusCards.filter(
                    c => c.title === "Orange Cytokine Neutralisation"
                ).length == 0
            );
        } else {
            return true;
        }
    }

    getUnplayableReason() {
        return "Cannot play this card while the virus has an Orange Cytokine Neutralisation card!";
    }
}
CytokinesOrange.title = "Orange Cytokines";
CytokinesOrange.kind = "Cytokines";
CytokinesOrange.art = "assets/cards/card-immune-cytokines-orange.png";
CytokinesOrange.smallart = "assets/cards/small/card-immune-cytokines-orange.png";
CytokinesOrange.needsInteraction = true;
CytokinesOrange.expires = false;
CytokinesOrange.duration = 3; // only applies if we turn expires on
CytokinesOrange.causesStateChange = false;

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
AntibodiesLiver.smallart = "assets/cards/small/card-immune-antibodies-liver.png";
AntibodiesLiver.needsInteraction = true;
AntibodiesLiver.expires = false;
AntibodiesLiver.duration = 0;
AntibodiesLiver.causesStateChange = false;

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
AntibodiesLung.smallart = "assets/cards/small/card-immune-antibodies-lung.png";
AntibodiesLung.needsInteraction = true;
AntibodiesLung.expires = false;
AntibodiesLung.duration = 0;
AntibodiesLung.causesStateChange = false;

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
AntibodiesIntestine.smallart = "assets/cards/small/card-immune-antibodies-intestine.png";
AntibodiesIntestine.needsInteraction = true;
AntibodiesIntestine.expires = false;
AntibodiesIntestine.duration = 0;
AntibodiesIntestine.causesStateChange = false;

class TCellsLiver extends ImmuneCard {
    applyEffectsToLoc(row, column) {
        this.applyTCells(row, column);
    }

    removeEffects() { }

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
TCellsLiver.smallart = "assets/cards/small/card-immune-t-cell-liver.png";
TCellsLiver.needsInteraction = true;
TCellsLiver.expires = true;
TCellsLiver.duration = 1;
TCellsLiver.causesStateChange = false;

class TCellsLung extends ImmuneCard {
    applyEffectsToLoc(row, column) {
        this.applyTCells(row, column);
    }

    removeEffects() { }

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
TCellsLung.smallart = "assets/cards/small/card-immune-t-cell-lung.png";
TCellsLung.needsInteraction = true;
TCellsLung.expires = true;
TCellsLung.duration = 1;
TCellsLung.causesStateChange = false;

class TCellsIntestine extends ImmuneCard {
    applyEffectsToLoc(row, column) {
        this.applyTCells(row, column);
    }

    removeEffects() { }

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
TCellsIntestine.smallart = "assets/cards/small/card-immune-t-cell-intestine.png";
TCellsIntestine.needsInteraction = true;
TCellsIntestine.expires = true;
TCellsIntestine.duration = 1;
TCellsIntestine.causesStateChange = false;

class NucleotideSensing extends ImmuneCard {
    applyEffects() {
        // Get random cytokine card
        let cytokinePool = immuneCardClassPool.filter(cl => cl.kind === "Cytokines");
        let randomCytokineClass = randomElement(cytokinePool);
        let randomCytokineCard = new randomCytokineClass();
        gameState.inactiveImmuneCards.push(randomCytokineCard);

        // Get a random other card (anything but NucleotideSensing)
        let otherPool = immuneCardClassPool.filter(cl => cl.name !== "DNA/RNA Sensing");
        let randomOtherClass = randomElement(otherPool);
        let randomOtherCard = new randomOtherClass();
        gameState.inactiveImmuneCards.push(randomOtherCard);

        gameState.inactiveImmuneCardsChanged = true;
        updateInactiveCardPanel();
    }

    removeEffects() { }
}
NucleotideSensing.title = "DNA/RNA Sensing";
NucleotideSensing.kind = "Sensing";
NucleotideSensing.art = "assets/cards/card-immune-nucleotide-sensing.png";
NucleotideSensing.smallart = "assets/cards/small/card-immune-nucleotide-sensing.png";
NucleotideSensing.needsInteraction = false;
NucleotideSensing.expires = true;
NucleotideSensing.duration = 1;
NucleotideSensing.causesStateChange = false;

let immuneCardClassPool = [
    Antiviral,
    CytokinesBlue,
    CytokinesRed,
    CytokinesOrange,
    AntibodiesLiver,
    AntibodiesLung,
    AntibodiesIntestine,
    TCellsLiver,
    TCellsLung,
    TCellsIntestine,
    NucleotideSensing,
];