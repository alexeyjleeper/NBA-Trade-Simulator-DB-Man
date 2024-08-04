import express from "express"
import dotenv from "dotenv"
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import PlayerData from './storage/playerData.json' assert { type: 'json' };

dotenv.config();
const PORT = process.env.PORT;
const app = express();
const dbClient = new DynamoDBClient({
    region: "us-east-1",
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const playerData = PlayerData["playerData"];


// need a dict with team:starting_ovr

app.get("/search", async (req, res) => {
    // Description - Returns a list of players, draft picks, and the current score
    // for the provided team
    // @param {string} uuid
    // @param {string} team
    // @param {bool} db_access
    // @returns {Promise<Object>} json object
    //      - {Array} players array
    //      - {Array} draft picks
    //          - {Array} [year, round, "P" (protected) or "U" (unprotected)]
    //      - {Int} score

    let players, picks, score;
    const handler = GetDataHandler(req.query);

    if (!db) {
        console.log('non-db');
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

// request body is going to have to contain teams and the players to swap
app.put("/update", async (req, res) => {
    //params: uuid, new teams (post trade), new picks (post trade) players, curr user team
    //returns: curr team score
    const data = new PutDataHandler(req.body, res);
    const [team1, team2] = data.formatForDBPut();
    

    //need to add a call to getCurrTeamScore


    try {
        const [put_res1, put_res2] = Promises.all([
            await dbClient.send(new PutItemCommand(team1)),
            await dbClient.send(new PutItemCommand(team2))
        ]);
    } catch(err) {
        console.log(err);
    }
});

app.listen(PORT, () => {
    console.log(`Player search server listening on port ${PORT}...`);
});

class GetDataHandler {
    constructor (query) {
        this.uuid = query.uuid;
        this.team = query.team;
        this.db = query.team === 'true';
    }

    localBuildItems () {
        console.log('non-db build');
    }

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

class PutDataHandler {
    constructor (data, res) {
        this.uuid = data["Uuid"];
        this.tradeTeams = data["TradeTeams"];
        this.rosters = data["NewRosters"];
        this.picks = data["Picks"];
        this.team = data["Team"];
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
                    "Score" : {}
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
                    "Score" : {}
                },
                "ReturnConsumedCapacity" : "TOTAL"
            }
        ]
    }

    getScore(team) {
        // get index for accessing rosters
        const accessIndex = this.tradeTeams.indexOf(team);
        
        //if user's team is not in the trade, score will not
        // have to be returned by the update endpoint
        if (accessIndex === -1){
            return 0;
        }

        let insideScoring = 0;
        let outsideScoring = 0;
        let athleticism = 0;
        let playmaking = 0;
        let rebounding = 0;
        let defending = 0;
        
        //get array of top 8 players by overall
        const sortByOvr = this.rosters[accessIndex].slice().sort((a, b) => playerData[b][1] - playerData[a][1]);
        const top8 = sortByOvr.length > 7 ? sortByOvr.slice(0, 8) : sortByOvr;
        
        //score calculation
        top8.forEach(player => {
            insideScoring += playerData[player][2];
            console.log(`accumulated: ${insideScoring}`);
            outsideScoring += playerData[player][3];
            athleticism += playerData[player][4];
            playmaking += playerData[player][5];
            rebounding += playerData[player][6];
            defending += playerData[player][7];
        });
        const length = top8.length;
        insideScoring = Math.floor(insideScoring / length);
        outsideScoring = Math.floor(outsideScoring / length);
        athleticism = Math.floor(athleticism / length);
        playmaking = Math.floor(playmaking / length);
        rebounding = Math.floor(rebounding / length);
        defending = Math.floor(defending / length);
        const scoreSum = (insideScoring + outsideScoring + athleticism + playmaking + rebounding + defending) * 10;
        return scoreSum;
    }

    populatePutItem() {
        //populate dictionaries for both teams in trade
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
            this.putData[i]["Item"]["Score"]["N"] = `${this.getScore(this.tradeTeams[i])}`;
        }
    }

    formatForDBGet() {
        this.populatePutItem();
        return this.putData;
    }

    getCurrTeamScore() {
        return this.getScore(this.team);
    }
}