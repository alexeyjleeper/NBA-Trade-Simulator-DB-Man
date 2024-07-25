import express from 'express'
import dotenv from 'dotenv'

dotenv.config();
const PORT = process.env.PORT;
const app = express();

// need a dict with team:starting_ovr

app.get('/search/:team', (req, res) => {
    //params: uuid, team
    //returns: roster data (playerdata, picks, current score)
});

app.listen(PORT, () => {
    console.log(`Player search server listening on port ${PORT}...`);
});