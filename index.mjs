import express from "express"
import dotenv from "dotenv"
import { DynamoDBClient, DynamoDBClientConfig, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import PlayerData from './storage/playerData.json' assert { type: 'json' };

dotenv.config();
const PORT = process.env.PORT;
const app = express();
const dbClient = new DynamoDBClient({
    region: "us-east-1",
    credentials: {
        //env variables
        accessKeyId: "",
        secretAccessKey: ""
    }
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const playerData = PlayerData["playerData"];


// need a dict with team:starting_ovr

app.get("/search", async (req, res) => {
    //params: uuid, team
    //returns: roster data (playerdata, picks, current score)

    // unpack uuid and team from here
    const search_params = req.body

    const client_params = {
        TableName: "Roster_Data",
        "Key": {
            "Uuid" : {
                "S" : ""
            },
            "Team" : {
                "S" : ""
            }
        }
    }

    try {
        const team_data = await dbClient.send(new GetItemCommand(params));
        // Need to do testing so I can format res
        console.log(team_data);
        // need to do score calculations after I get the players list
    } catch(err) {
        console.log(err);
    }
});

// request body is going to have to contain teams and the players to swap
app.put("/update", async (req, res) => {
    //params: uuid, new teams (post trade), new picks (post trade) players, curr user team
    //returns: curr team score
    const data = new putDataHandler(req.body);
    const [team1, team2] = data.getPutData();
    console.log(team1, team2);


    //need to add a call to getCurrTeamScore

    try {
        const put_res = await dbClient.send(new PutItemCommand(team1));
        // Need to do testing so I can format res
        console.log(put_res);
    } catch(err) {
        console.log(err);
    }
});

app.listen(PORT, () => {
    console.log(`Player search server listening on port ${PORT}...`);
});

class putDataHandler {
    constructor(data) {
        this.uuid = data["Uuid"];
        this.tradeTeams = data["TradeTeams"];
        this.rosters = data["NewRosters"];
        this.picks = data["Picks"];
        this.team = data["Team"];
        this.putData = [
            {
                "Item" : {
                    "Uuid" : {},
                    "Team" : {},
                    "Players" : {
                        "L" : []
                    },
                    "Picks" : {
                        "L" : []
                    },
                    "Score" : {},
                    "ReturnConsumedCapacity" : "Total",
                    "TableName": "Roster_Data"
                },
            },
            {
                "Item" : {
                    "Uuid" : {},
                    "Team" : {},
                    "Players" : {
                        "L" : []
                    },
                    "Picks" : {
                        "L" : []
                    },
                    "Score" : {},
                    "ReturnConsumedCapacity" : "Total",
                    "TableName": "Roster_Data"
                }
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

    populatePutData() {
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
            this.putData[i]["Item"]["Score"]["N"] = this.getScore(this.tradeTeams[i]);
        }
    }

    getPutData() {
        this.populatePutData();
        return this.putData;
    }

    getCurrTeamScore() {
        return this.getScore(this.team);
    }
}