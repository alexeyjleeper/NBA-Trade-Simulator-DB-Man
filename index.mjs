import express from "express";
import dotenv from "dotenv";
import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import PlayerData from './storage/PlayerData.js';
import TeamData from './storage/TeamData.js';
import cors from "cors";
import logger from './logger.js';

dotenv.config();
const PORT = process.env.PORT;
const app = express();
const dbClient = new DynamoDBClient({
    region: "us-east-1",
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: "http://localhost:3000",
    methods: ['GET', 'PUT', 'DELETE']
}));
logger.info('db_manager started');

/**
 * @api {get} /search Get Players, Picks, and Score
 * @apiDescription Returns a list of players, draft picks, and the current score array for the provided team.
 * @apiParam {String} uuid The unique identifier for the team.
 * @apiParam {String} team The name of the team.
 * @apiParam {Boolean} db Access the database if true, otherwise use local file storage.
 * @apiSuccess {Object} response The response object.
 * @apiSuccess {String[]} response.Players Array of player names.
 * @apiSuccess {String[]} response.Picks Array of draft picks.
 * @apiSuccess {Number[]} response.Score The current score array of the team.
 * @apiError (500) {String} InternalServerError Internal Server Error message.
 */
app.get("/", async (req, res) => {
    logger.info('GET request received', {
        uuid: req.query.uuid,
        team: req.query.team,
        db: req.query.db
    });

    //init variables and class
    let players, picks, score;
    const db = req.query.db === 'true';
    const handler = new GetDataHandler(req.query);

    if (!db) {
        [players, picks, score] = handler.fromFileStorage();
    } else {
        const forDBGet = handler.formatForDBGet();
        let dbRes;

        try {
            dbRes = await dbClient.send(new GetItemCommand(forDBGet));
        } catch(error) {
            console.log(error);
            logger.error('DynamoDbClient error, GetItemCommand', error.message, error.stack);
            res.status(500).send('Internal Server Error: ', err);
        }

        [players, picks, score] = handler.dbResToEndpointRes(dbRes);
    }

    try {
        res.json({
            "Players" : players,
            "Picks" : picks,
            "Score" : score
        });
    } catch(error) {
        logger.error('Error sending response to client', error.message, error.stack);
        res.status(500).send('Internal Server Error: ', err);
    }
});

/**
 * @api {put} /update Update Teams and Picks in DynamoDB
 * @apiDescription Updates the database with new data for two teams involved in a trade and returns the current score of the user's team if involved in the trade.
 * @apiParam {Object} req.body The request body.
 * @apiParam {String} req.body.Uuid The unique identifier for the trade.
 * @apiParam {String[]} req.body.TradeTeams Array of two team names involved in the trade.
 * @apiParam {String[][]} req.body.NewRosters Array of two arrays representing the new rosters for each team post-trade.
 * @apiParam {String[][]} req.body.Picks Array of two arrays representing the draft picks for each team post-trade.
 * @apiSuccess {Number[][]} score The updated score array for both teams in trade.
 * @apiError (500) {String} InternalServerError Internal Server Error message.
 */
app.put("/", async (req, res) => {
    logger.info('PUT request received', req.body);

    const handler = new PutDataHandler(req.body);
    const requests = handler.formatForDBPut();

    try {
        await Promise.all(requests);
    } catch(error) {
        logger.error('DynamoDBClient error, PutItemCommand', error.message, error.stack);
        res.status(500).send("Internal Server Error: ", err);
    }

    try {
        res.send(handler.getBothScores());
    } catch(error) {
        logger.error('Error sending response to client', error.message, error.stack);
        res.status(500).send("Internal Server Error: ", error);
    }
});

/**
 * @api {delete} /delete all data under given uuid in DynamoDB
 * @apiDescription Deletes data for all provided teams under the given uuid and returns a status of 204 if successful
 * @apiParam {Object} req.body The request body.
 * @apiParam {String} req.body.Uuid The unique identifier of the user.
 * @apiParam {String[]} req.body.Teams Array of all teams to be deleted from the db.
 * @apiSuccess (204) NoContent.
 * @apiError (500) {String} InternalServerError Internal Server Error message.
 */
app.delete("/", async (req, res) => {
    logger.info('DELETE request received', req.body);

    const handler = new DeleteDataHandler(req.body);
    const requests = handler.buildDeleteInputs();

    try {
        // handle for empty req.body.Teams array
        if (requests) {
            const putResults = await Promise.all(requests);
        }
    } catch(error) {
        logger.error('DynamoDBClient error, DeleteItemCommand', error.message, error.stack);
        res.status(500).send("Internal Server Error: ", error);
    }

    try {
        res.status(200).send('OK');
    } catch(error) {
        logger.error('Error sending response to client', error.message, error.stack);
        res.status(500).send("Internal Server Error: ", error);
    }
})

app.listen(PORT, () => {
    console.log(`Player search server listening on port ${PORT}...`);
});

/**
 * @class GetDataHandler
 * @description Handles operations related to fetching data for a team.
 */
class GetDataHandler {
    constructor (query) {
        this.uuid = query.uuid;
        this.team = query.team;
    }

    /**
     * @method fromFileStorage
     * @description Retrieves data from local file storage.
     * @returns {Array} Array containing players, picks, and score.
     */
    fromFileStorage() {
        return [TeamData[this.team]["players"], TeamData[this.team]["picks"], TeamData[this.team]["score"]]
    }

    /**
     * @method formatForDBGet
     * @description Formats the query for DynamoDB retrieval.
     * @returns {Object} The formatted query object for DynamoDB Get operation.
     */
    formatForDBGet () {
        return {
            "TableName" : "Roster_Data",
            "Key": {
                "Uuid" : {
                    "S" : this.uuid
                },
                "Team" : {
                    "S" : this.team
                }
            },
            "ReturnConsumedCapacity" : "TOTAL"
        }
    }

    /**
     * @method dbResToEndpointRes
     * @description Converts DynamoDB response to a cleaner endpoint response format.
     * @param {Object} dbObj The DynamoDB response object.
     * @returns {Array} Array containing players, picks, and score.
     */
    dbResToEndpointRes (dbObj) {
        const players = [];
        for (const item of dbObj.Item.Players.L) {
            players.push(item.S);
        }

        const picks = [];
        for (const item of dbObj.Item.Picks.L) {
            picks.push(item.S);
        }

        const score = [];
        for (const item of dbObj.Item.Score.L) {
            score.push(Number(item.N));
        }

        return [players, picks, score]
    }
}

/**
 * @class PutDataHandler
 * @description Handles operations related to updating data for teams involved in a trade.
 */
class PutDataHandler {
    constructor (data) {
        this.uuid = data["Uuid"];
        this.tradeTeams = data["TradeTeams"];
        this.rosters = data["NewRosters"];
        this.picks = data["Picks"];
        this.newTeamScores = [];
        this.putData = [
            {
                "TableName": "Roster_Data",
                "Item" : {
                    "Uuid" : {},
                    "Team" : {},
                    "Players" : {
                        "L" : []
                    },
                    "Picks" : {
                        "L" : []
                    },
                    "Score" : {
                        "L" : []
                    }
                },
                "ReturnConsumedCapacity" : "TOTAL"
            },
            {
                "TableName": "Roster_Data",
                "Item" : {
                    "Uuid" : {},
                    "Team" : {},
                    "Players" : {
                        "L" : []
                    },
                    "Picks" : {
                        "L" : []
                    },
                    "Score" : {
                        "L" : []
                    }
                },
                "ReturnConsumedCapacity" : "TOTAL"
            }
        ]
    }

    /**
     * @method getScore
     * @description Calculates the score for a given team based on the top 8 players.
     * @param {String} team The team for which to calculate the score.
     * @returns {Number[]} Array containing the scores: [insideScoring, outsideScoring, athleticism, playmaking, rebounding, defending].
     */
    getScore(team) {
        // get index for accessing rosters
        const accessIndex = this.tradeTeams.indexOf(team);
        
        // if user's current team is not in trade, return empty array
        if (accessIndex === -1){
            return [];
        }

        let insideScoring = 0;
        let outsideScoring = 0;
        let athleticism = 0;
        let playmaking = 0;
        let rebounding = 0;
        let defending = 0;
        
        //get array of top 8 players by overall
        const sortByOvr = this.rosters[accessIndex].slice().sort((a, b) => PlayerData[b][1] - PlayerData[a][1]);
        const top8 = sortByOvr.length > 7 ? sortByOvr.slice(0, 8) : sortByOvr;
        
        //score calculation
        top8.forEach(player => {
            insideScoring += PlayerData[player][2];
            outsideScoring += PlayerData[player][3];
            athleticism += PlayerData[player][4];
            playmaking += PlayerData[player][5];
            rebounding += PlayerData[player][6];
            defending += PlayerData[player][7];
        });
        const length = top8.length;
        insideScoring = Math.floor(insideScoring / length);
        outsideScoring = Math.floor(outsideScoring / length);
        athleticism = Math.floor(athleticism / length);
        playmaking = Math.floor(playmaking / length);
        rebounding = Math.floor(rebounding / length);
        defending = Math.floor(defending / length);
        const scoreArray = [insideScoring, outsideScoring, athleticism, playmaking, rebounding, defending];
        return scoreArray;
    }

    /**
     * @method populatePutItem
     * @description Populates the data to be put into DynamoDB for both teams involved in the trade.
     */
    populatePutItem() {
        
        // populate dictionaries for both teams in trade
        for (let i = 0; i < 2; i++) {
            this.putData[i]["Item"]["Uuid"]["S"] = this.uuid;
            this.putData[i]["Item"]["Team"]["S"] = this.tradeTeams[i];

            for (const player of this.rosters[i]) {
                this.putData[i]["Item"]["Players"]["L"].push({"S" : player});
            }

            for (const pick of this.picks[i]) {
                this.putData[i]["Item"]["Picks"]["L"].push({"S" : pick});
            }

            const scoreArr = this.getScore(this.tradeTeams[i]);
            this.newTeamScores.push(scoreArr);
            for (const item of scoreArr) {
                this.putData[i]["Item"]["Score"]["L"].push({ "N" : `${item}`});
            }
        }
    }

    /**
     * @method formatForDBPut
     * @description Creates an array of dynamoDB requests to update both teams in put operation
     * @returns {Object[]} Array of dynamoDB requests
     */
    formatForDBPut() {
        this.populatePutItem();
        return this.putData.map(input => dbClient.send(new PutItemCommand(input)));
    }

    /**
     * @method getBothScores
     * @description Returns the calculated score arrays for both teams in trade
     * @returns {[Number[], Number[]]} Array of score arrays for both teams in trade
     */
    getBothScores() {
        return this.newTeamScores;
    }
}

/**
 * @class DeleteDataHandler
 * @description Handles operations related to deleting database entries
 */
class DeleteDataHandler {
    constructor (data) {
        this.uuid = data["Uuid"];
        this.teams = data["Teams"];
    }

    /**
     * @method buildDeleteInputs
     * @description creates an array of dynamoDB requests to clear every team in the database
     * @returns {Object[]} Array of dynamoDB requests
     */
    buildDeleteInputs() {
        return this.teams.map(team => dbClient.send(new DeleteItemCommand({
            "TableName" : "Roster_Data",
            "Key" : {
                "Uuid" : {
                    "S" : this.uuid
                },
                "Team" : {
                    "S" : team
                }
            }
        })));
    }
}