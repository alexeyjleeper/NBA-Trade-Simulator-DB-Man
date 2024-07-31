import express from "express"
import dotenv from "dotenv"
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
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

    updateData(req.body);
    




    //send this to the class
    //calculate provided overalls
    //populate players list from like json data that is retreived and then
    // modified with req body player trade data
    const update_data = {
        "Item" : {
            "Uuid" : { "S" : "" },
            "Team" : { "S" : "" },
            "Overall" : { "N" : "" },
            "Players" : {
                //generate from a given list
                "L" : [
                    { "S" : "" },
                    { "S" : "" },
                    { "S" : "" },
                    //...
                ]
            },
            "Picks" : {
                //im going to try automating the generation
                // of this nested list from a given list of picks
                // given list of picks will have to come from a json object
                "L" : [
                    {
                        "L" : [
                            // year
                            { "N" : ""},
                            //round
                            { "N" : ""},
                            //protected or not
                            { "S" : ""}
                        ],
                        //...
                    }
                ]
            }
        },
        "ReturnConsumedCapacity" : "Total",
        "TableName": "Roster_Data"
    }

    try {
        const put_res = await dbClient.send(new PutItemCommand(update_data));
        // Need to do testing so I can format res
        console.log(put_res);
    } catch(err) {
        console.log(err);
    }
});

app.listen(PORT, () => {
    console.log(`Player search server listening on port ${PORT}...`);
});

class updateData {
    constructor(data) {
        this.uuid = data["Uuid"];
        this.tradeTeams = data["TradeTeams"];
        this.rosters = data["NewRosters"];
        this.picks = data["Picks"];
        this.team = data["Team"];
        this.prevScore = data["Score"];
    }

    updateScore() {
        // get index for accessing rosters
        let accessIndex = 0
        let currTeamInTrade = false;
        for (let i = 0; i < tradeTeams.length; i++) {
            if (team == tradeTeams[i]) {
                currTeamInTrade = true;
                accessIndex = i;
            }
        }
        
        //if user's team is not in the trade, score will not
        // have to be returned by the update endpoint
        if (currTeamInTrade) {
            let overall = 0;
            let insideScoring = 0;
            let outsideScoring = 0;
            let athleticism = 0;
            let playmaking = 0;
            let rebounding = 0;
            let defending = 0;
            
            //get array of top 8 players by overall
            const sortByOvr = this.rosters.slice().sort((a, b) => playerData[b][1] - playerData[a][1])
            let top8 = []
            //handle for roster size of less than 8
            if (sortByOvr.length > 7) {
                top8 = sortByOvr.slice(0, 8);
            } else {
                top8 = sortByOvr
            }
            
            //average for all attributes
            for (player in top8) {
                overall += playerData[player][1];
                insideScoring = playerData[player][2];
                outsideScoring = playerData[player][3];
                athleticism = playerData[player][4];
                playmaking = playerData[player][5];
                rebounding = playerData[player][6];
                defending = playerData[player][7];
            }
            overall = Math.floor(overall / top8.length);
            insideScoring = Math.floor(insideScoring / top8.length);
            outsideScoring = Math.floor(outsideScoring / top8.length);
            athleticism = Math.floor(athleticism / top8.length);
            playmaking = Math.floor(playmaking / top8.length);
            rebounding = Math.floor(rebounding / top8.length);
            defending = Math.floor(defending / top8.length);

            
        }
    }
}