import express from "express";
import dotenv from "dotenv";
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import PlayerData from './storage/playerData.json' assert { type: 'json' };
import TeamData from './storage/teamData.json' assert { type: 'json' };
import cors from "cors";

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
    methods: ['GET', 'PUT']
}));

/**
 * @api {get} /search Get Players, Picks, and Score
 * @apiDescription Returns a list of players, draft picks, and the current score for the provided team.
 * @apiParam {String} uuid The unique identifier for the team.
 * @apiParam {String} team The name of the team.
 * @apiParam {Boolean} db Access the database if true, otherwise use local file storage.
 * @apiSuccess {Object} response The response object.
 * @apiSuccess {String[]} response.Players Array of player names.
 * @apiSuccess {Object[][]} response.Picks Array of draft picks, where each pick is an array of [year, round, type].
 * @apiSuccess {Number} response.Score The current score of the team.
 * @apiError (500) {String} InternalServerError Internal Server Error message.
 */
app.get("/search", async (req, res) => {
    let players, picks, score;
    const handler = new GetDataHandler(req.query);
    const db = req.query.db === 'true';

    if (!db) {
        [players, picks, score] = handler.fromFileStorage();
    } else {
        forDBGet = handler.formatForDBGet();
        let dbRes;

        try {
            dbRes = await dbClient.send(new GetItemCommand(forDBGet));
        } catch(err) {
            console.log(err);
            res.status(500).send('Error contacting DynamoDB: ', err);
        }

        [players, picks, score] = handler.dbResToEndpointRes(dbRes);
    }

    try {
        res.json({
            "Players" : players,
            "Picks" : picks,
            "Score" : score
        });
    } catch(err) {
        console.log(err);
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
 * @apiParam {Object[][]} req.body.Picks Array of two arrays representing the draft picks for each team post-trade.
 * @apiParam {String} req.body.Team The user's currently selected team.
 * @apiSuccess {Number[]} score The updated score array for the user's team. Array contains [insideScoring, outsideScoring, athleticism, playmaking, rebounding, defending].
 * @apiError (500) {String} InternalServerError Internal Server Error message.
 */
app.put("/update", async (req, res) => {
    const handler = new PutDataHandler(req.body);
    const [team1, team2] = handler.formatForDBPut();

    try {
        const [put_res1, put_res2] = Promises.all([
            await dbClient.send(new PutItemCommand(team1)),
            await dbClient.send(new PutItemCommand(team2))
        ]);
    } catch(err) {
        console.log(err);
        res.status(500).send("Error contacting DynamoDB: ", err);
    }

    try {
        res.send(handler.getBothScores());
    } catch(err) {
        res.status(500).send("Internal Server Error: ", err);
    }
});

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
        this.db = query.team === 'true';
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
     * @returns {Object} The formatted query object for DynamoDB.
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
     * @description Converts DynamoDB response format to endpoint response format.
     * @param {Object} dbObj The DynamoDB response object.
     * @returns {Array} Array containing players, picks, and score.
     */
    dbResToEndpointRes (dbObj) {
        const players = [];
        for (const item of dbObj.Item.Players.L) {
            players.push(item.S);
        }

        const picks = []
        for (const item of dbObj.Item.Picks.L) {
            const pickData = []
            for (const pick_part of item.L) {
                pickData.push(Object.values(pick_part)[0]);
            }
            picks.push(pickData)
        }

        return [players, picks, dbObj.Item.Score.N]
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
                this.putData[i]["Item"]["Picks"]["L"].push({
                    "L" : [
                        { "N" : pick[0]},
                        { "N" : pick[1]},
                        { "S" : pick[2]}
                    ]
                });
            }

            const scoreArr = this.getScore(this.tradeTeams[i]);
            this.newTeamScores.push(scoreArr);
            for (const item of scoreArr) {
                this.putData[i]["Item"]["Score"]["L"].append({ "N" : item})
            }
        }
    }

    /**
     * @method formatForDBPut
     * @description Formats the data for DynamoDB put operations.
     * @returns {Object[]} Array of formatted data for both teams.
     */
    formatForDBGet() {
        this.populatePutItem();
        return this.putData;
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