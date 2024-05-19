const sqlite = require('sqlite3').verbose();

function initDatabase() {
    const db = new sqlite.Database("./database.db", (error) => {
        if (error) {
            console.error("Error:", error);
            return;
        }
        console.log("Connected to database!");

        // Tables
        const sql_user = `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY, 
            name TEXT, 
            email TEXT UNIQUE, 
            password TEXT
        )`;
        const sql_channel = `CREATE TABLE IF NOT EXISTS channels (
            id INTEGER PRIMARY KEY, 
            name TEXT, 
            owner_id INTEGER, 
            FOREIGN KEY(owner_id) REFERENCES users(id)
        )`;
        const sql_message = `CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY, 
            content TEXT, 
            user_id INTEGER, 
            channel_id INTEGER, 
            FOREIGN KEY(user_id) REFERENCES users(id), 
            FOREIGN KEY(channel_id) REFERENCES channels(id)
        )`;
        const sql_user_channel = `CREATE TABLE IF NOT EXISTS user_channels (
            user_id INTEGER, 
            channel_id INTEGER, 
            PRIMARY KEY(user_id, channel_id), 
            FOREIGN KEY(user_id) REFERENCES users(id), 
            FOREIGN KEY(channel_id) REFERENCES channels(id)
        )`;

        db.serialize(() => {
            db.run(sql_user, (error) => {
                if (error) console.error("Error", error);
            });
            db.run(sql_channel, (error) => {
                if (error) console.error("Error:", error);
            });
            db.run(sql_message, (error) => {
                if (error) console.error("Error:", error);
            });
            db.run(sql_user_channel, (error) => {
                if (error) console.error("Error:", error);
            });
        });
    });

    return db;
}

module.exports = { initDatabase };
