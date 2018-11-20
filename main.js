/*

Inspiration: http://www.datagenetics.com/blog/december32011/

The article above recommends employing a suite of algorithms to win a game of Battleship in the fewest moves. One of these is an algorithm that selects targets based on the probability of a point on the grid being occupied. I was curious how effective an AI opponent would be if it used ONLY this algorithm.

Result: The average win occurs after 62 moves. 

I then attempted to skew the probability on positions adjacent to hits so the AI would focus on areas known to contain a ship. No additional logic was used to take advantage of, for example, two adjacent hits indicating a ship's alignment.

Result: The average win occurs after 55 moves.

*/

(function (document) {
    'use strict';

    var SHIP = 0,
        MISS = 1,
        HIT = 2,
        hitsMade,
        hitsToWin,
        ships = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1],
        // TODO: look into Int8Array on these big matrices for performance
        positions = [],
        probabilities = [],
        hitsSkewProbabilities = true,
        skewFactor = 5,
        boardSize = 10,
        classMapping = ['ship', 'miss', 'hit'],
        board,
        resultMsg,
        volleyButton,
        monteCarlo = false;

    const RANDOM_PLACE_COUNT = 1000; //ОЧЕНЬ ДОЛГО ИДЕТ РАСЧЕТ, СТАВИТЬ НЕБОЛЬШОЕ ЧИСЛО

    class Ship {
        constructor(x, y, size, isVertical) {
            this.x = x;
            this.y = y;
            this.size = size;
            this.isVertical = isVertical;
        }

        isPointAcceptable(x, y) {
            if (this.isVertical) {
                return x == this.x && (y >= this.y && y <= this.y + this.size - 1)
            }
            else {
                return y == this.y && (x >= this.x && x <= this.x + this.size - 1)
            }
        }
    }

    class Player {
        constructor(name, useRandomProbability = false) {
            this.positions = [];
            this.probabilities = [];

            this.ships = [];

            this.moves = 0;
            this.hitsMade = 0;
            this.hitsToWin = 0
            this.name = name;

            this.previousY = 0;
            this.previousX = 0;

            this.useRandomProbability = useRandomProbability;

            this.board = document.querySelector(`#${this.name} > .board`);
        }

        setupBoard() {
            // initialize positions matrix
            for (var y = 0; y < boardSize; y++) {
                this.positions[y] = [];
                for (var x = 0; x < boardSize; x++) {
                    this.positions[y][x] = null;
                }
            }

            // determine hits to win given the set of ships
            this.hitsMade = this.hitsToWin = 0;
            for (var i = 0, l = ships.length; i < l; i++) {
                this.hitsToWin += ships[i];
            }


            if (!this.useRandomProbability) {
                this.distributeShips();
                this.recalculateProbabilities();
            }
            else {
                this.randomizeProbability();
            }

            this.redrawBoard(true);
        }

        distributeShips() {
            this.ships = [];
            console.log('start distribution')
            var pos, shipPlaced, vertical;
            for (var i = 0, l = ships.length; i < l; i++) {
                shipPlaced = false;
                console.log(`place ship with lenght ${l}`)
                vertical = randomBoolean();
                while (!shipPlaced) {
                    pos = this.getRandomPosition();
                    shipPlaced = this.placeShip(pos, ships[i], vertical);
                    if (!shipPlaced) console.log(`Ship is not placed`)
                }
                this.ships.push(new Ship(pos[0], pos[1], ships[i], vertical));
            }
        }

        placeShip(pos, shipSize, vertical) {
            // "pos" is ship origin
            const [x, y] = pos;
            const z = (vertical ? y : x);
            const end = z + shipSize - 1;

            if (this.shipCanOccupyPositionAdvanced(SHIP, pos, shipSize, vertical)) {
                for (var i = z; i <= end; i++) {
                    if (vertical) this.positions[x][i] = SHIP;
                    else this.positions[i][y] = SHIP;
                }
                return true;
            }

            return false;
        }

        randomizeProbability() {
            for (let x = 0; x < boardSize; x++) {
                this.probabilities[x] = [];
                for (let y = 0; y < boardSize; y++) {
                    this.probabilities[x][y] = 0;
                }
            }
            //this.distributeShips();
            for (let i = 0; i < RANDOM_PLACE_COUNT; i++) {

                for (var y = 0; y < boardSize; y++) {
                    this.positions[y] = [];
                    for (var x = 0; x < boardSize; x++) {
                        this.positions[y][x] = null;
                    }
                }

                this.distributeShips();

                for (let x = 0; x < boardSize; x++) {
                    for (let y = 0; y < boardSize; y++) {
                        if (this.positions[x][y] == SHIP) {
                            this.probabilities[x][y] += 1;
                        }
                    }
                }
            }
        }

        recalculateProbabilities() {
            var hits = [];

            // reset probabilities

            for (var y = 0; y < boardSize; y++) {

                if (!this.useRandomProbability) {
                    this.probabilities[y] = [];
                }
                for (var x = 0; x < boardSize; x++) {
                    if (!this.useRandomProbability) {
                        this.probabilities[y][x] = 0;
                    }
                    // we remember hits as we find them for skewing
                    if (hitsSkewProbabilities && this.positions[x][y] === HIT) {
                        hits.push([x, y]);
                    }
                }
            }

            // calculate probabilities for each type of ship
            for (var i = 0, l = ships.length; i < l; i++) {
                for (var y = 0; y < boardSize; y++) {
                    for (var x = 0; x < boardSize; x++) {
                        // horizontal check
                        if (this.shipCanOccupyPosition(MISS, [x, y], ships[i], false)) {
                            this.increaseProbability([x, y], ships[i], false);
                        }
                        // vertical check
                        if (this.shipCanOccupyPosition(MISS, [x, y], ships[i], true)) {
                            this.increaseProbability([x, y], ships[i], true);
                        }
                    }
                }
            }


            // skew probabilities for positions adjacent to hits
            if (hitsSkewProbabilities) {
                this.skewProbabilityAroundHits(hits);
            }
        }

        increaseProbability(pos, shipSize, vertical) {
            // "pos" is ship origin
            var x = pos[0],
                y = pos[1],
                z = (vertical ? y : x),
                end = z + shipSize - 1;

            for (var i = z; i <= end; i++) {
                if (vertical) this.probabilities[x][i]++;
                else this.probabilities[i][y]++;
            }
        }

        skewProbabilityAroundHits(toSkew) {
            var uniques = [];

            // add adjacent positions to the positions to be skewed
            for (var i = 0, l = toSkew.length; i < l; i++) {
                let adjacentsHits = this.getAdjacentPositions(toSkew[i]);
                let ship = this.ships.find(s => s.isPointAcceptable(toSkew[i][0], toSkew[i][1]));
                let skewOrientation = null;
                for (let adjacent of adjacentsHits) {
                    if (this.positions[adjacent[0]][adjacent[1]] == HIT) {
                        if (adjacent[0] == toSkew[i][0]) {
                            skewOrientation = 'vertical';
                            break;
                        }
                        else if (adjacent[1] == toSkew[i][1]) {
                            skewOrientation = 'horizontal';
                            break;
                        }

                    }
                }

                if (ship && this.isShipDrowned(ship)) {
                    for (let adjacent of adjacentsHits) {

                        if (this.positions[adjacent[0]][adjacent[1]] != HIT) {
                            this.probabilities[adjacent[0]][adjacent[1]] = 0;
                            this.positions[adjacent[0]][adjacent[1]] = MISS;
                        }
                    }

                    continue;
                }

                if (skewOrientation)
                    toSkew = toSkew.concat(adjacentsHits.filter(hit => {
                        const [x, y] = hit;
                        if (skewOrientation === 'vertical') {
                            return y == toSkew[1];
                        }
                        else return x == toSkew[0];
                    }));
                else
                    toSkew = toSkew.concat(adjacentsHits);
            }

            // store uniques to avoid skewing positions multiple times
            // TODO: do A/B testing to see if doing this with strings is efficient
            for (var i = 0, l = toSkew.length; i < l; i++) {
                var uniquesStr = uniques.join('|').toString();
                if (uniquesStr.indexOf(toSkew[i].toString()) === -1) {
                    uniques.push(toSkew[i]);
                    // skew probability
                    const [x, y] = toSkew[i];
                    this.probabilities[x][y] *= skewFactor;
                }
            }
        }

        isShipDrowned(ship) {
            const x = ship.x;
            const y = ship.y;
            const isVertical = ship.isVertical;
            const shipSize = ship.size;
            const z = (isVertical ? y : x);
            const end = z + shipSize - 1;

            // check if there's an obstacle
            for (var i = z; i <= end; i++) {
                var thisPos = (isVertical ? this.positions[x][i] : this.positions[i][y]);
                if (thisPos !== HIT) return false;
            }

            return true;
        }

        getAdjacentPositions(pos) {
            var x = pos[0],
                y = pos[1],
                adj = [];

            const isNextYValid = y + 1 < boardSize;
            const isPreviousYValid = y - 1 >= 0;

            const isNextXValid = x + 1 < boardSize;
            const isPreviousXValid = x - 1 >= 0;

            if (isNextYValid) adj.push([x, y + 1]);
            if (isPreviousYValid) adj.push([x, y - 1]);
            if (isNextXValid) adj.push([x + 1, y]);
            if (isPreviousXValid) adj.push([x - 1, y]);

            if (isNextYValid && isNextXValid) adj.push([x + 1, y + 1]);
            if (isNextYValid && isPreviousXValid) adj.push([x - 1, y + 1]);
            if (isPreviousYValid && isNextXValid) adj.push([x + 1, y - 1]);
            if (isPreviousYValid && isPreviousXValid) adj.push([x - 1, y - 1]);

            return adj;
        }

        shipCanOccupyPosition(criteriaForRejection, pos, shipSize, vertical) { // TODO: criteriaForRejection is an awkward concept, improve
            // "pos" is ship origin
            var x = pos[0],
                y = pos[1],
                z = (vertical ? y : x),
                end = z + shipSize - 1;

            // board border is too close
            if (end > boardSize - 1) return false;

            // check if there's an obstacle
            for (var i = z; i <= end; i++) {
                var thisPos = (vertical ? this.positions[x][i] : this.positions[i][y]);
                if (thisPos === criteriaForRejection) return false;
            }

            return true;
        }

        shipCanOccupyPositionAdvanced(criteriaForRejection, pos, shipSize, vertical) { // TODO: criteriaForRejection is an awkward concept, improve
            // "pos" is ship origin
            var x = pos[0],
                y = pos[1],
                z = (vertical ? y : x),
                end = z + shipSize - 1;

            // board border is too close
            if (end > boardSize - 1) return false;

            // check if there's an obstacle
            for (var i = z; i <= end; i++) {
                var coef = [-1, 0, 1];
                for (let c of coef) {
                    let ac = vertical ? x + c : y + c;
                    if (ac < 0 || ac >= boardSize) continue;
                    for (let d of coef) {
                        let bd = i + d;
                        if (bd < 0 || bd >= boardSize) continue;
                        let point = (vertical ? this.positions[ac][bd] : this.positions[bd][ac]);
                        if (point === criteriaForRejection) return false;
                    }

                }
            }

            return true;
        }

        fireAtBestPosition() {
            const [x, y] = this.getBestUnplayedPosition();

            let result;

            if (this.positions[x][y] === SHIP) {
                this.positions[x][y] = HIT;
                this.hitsMade++;
                result = HIT;
            } else {
                this.positions[x][y] = MISS;
                result = MISS;
            }

            this.previousX = x;
            this.previousY = y;

            this.recalculateProbabilities();
            this.redrawBoard(true);

            return result;
        }

        getBestUnplayedPosition() {
            var bestProb = 0,
                bestPos;

            // so far there is no tie-breaker -- first position
            // with highest probability on board is returned
            for (var y = 0; y < boardSize; y++) {
                for (var x = 0; x < boardSize; x++) {
                    if (!this.positions[x][y] && this.probabilities[x][y] > bestProb) {
                        bestProb = this.probabilities[x][y];
                        bestPos = [x, y];
                    }
                }
            }

            return bestPos;
        }

        redrawBoard(displayProbability) {
            if (monteCarlo) return; // no need to draw when testing thousands of boards
            var boardHTML = '';
            for (var y = 0; y < boardSize; y++) {
                boardHTML += '<tr>';
                for (var x = 0; x < boardSize; x++) {
                    var thisPos = this.positions[x][y];
                    boardHTML += '<td class="';
                    if (thisPos !== null) boardHTML += classMapping[thisPos];
                    boardHTML += '">';
                    if (displayProbability && thisPos != MISS && thisPos !== HIT) boardHTML += this.probabilities[x][y];
                    boardHTML += '</td>';
                }
                boardHTML += '</tr>';
            }
            this.board.innerHTML = boardHTML;
        }

        getRandomPosition() {
            var x = Math.floor(Math.random() * 10),
                y = Math.floor(Math.random() * 10);

            return [x, y];
        }
    }

    var computer1 = new Player('computer1', true); // алгоритм через возможные расстановки
    var computer2 = new Player('computer2', false); //старый алгоритм

    computer1.setupBoard();
    computer2.setupBoard();

    // run immediately
    initialize();

    function initialize() {
        board = document.getElementById('board');
        resultMsg = document.getElementById('result');
        volleyButton = document.getElementById('volley');
        volleyButton.onclick = (monteCarlo ? runMonteCarlo : beginVolley);
        //setupBoard();
    }



    function randomBoolean() {
        return (Math.round(Math.random()) == 1);
    }

    function runMonteCarlo() {
        var elapsed, sum = 0,
            runs = (hitsSkewProbabilities ? 50 : 1000);

        elapsed = (new Date()).getTime();

        for (var i = 0; i < runs; i++) {
            var moves = 0;
            setupBoard();
            while (hitsMade < hitsToWin) {
                fireAtBestPosition();
                moves++;
            }
            sum += moves;
        }

        elapsed = (new Date()).getTime() - elapsed;
        console.log('test duration: ' + elapsed + 'ms');

        resultMsg.innerHTML = 'Average moves: ' + (sum / runs);
    }

    var players = [computer1, computer2]

    var activePlayer = computer1;

    function beginVolley() {
        //if (hitsMade > 0) setupBoard();
        if (hitsMade > 0) {
            players.forEach(p => p.setupBoard());
            activePlayer = null;
        }
        resultMsg.innerHTML = '';
        volleyButton.disabled = true;
        var moves = 0,
            volley = setInterval(function () {
                var hitResult = activePlayer.fireAtBestPosition();
                activePlayer.moves++;

                if (hitResult === MISS) {
                    if (activePlayer == computer1) {
                        activePlayer = computer2;
                    } else {
                        activePlayer = computer1;
                    }
                }

                if (activePlayer.hitsMade === activePlayer.hitsToWin) {
                    resultMsg.innerHTML = `${activePlayer.name} победил, сделав ${activePlayer.moves} шагов.`;
                    clearInterval(volley);
                    volleyButton.disabled = false;
                }
            }, 500);
    }

}(document));