import express from "express"
import dotenv from "dotenv"
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";

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
    //params: uuid, new teams (post trade), new picks (post trade) players
    //returns: confirmation

    // need to extract uuid, teams, and players data
    const data = req.body;

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