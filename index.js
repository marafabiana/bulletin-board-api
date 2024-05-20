require("dotenv").config();
const express = require("express");
const database = require("./db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");

const app = express();
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = 8000;
const URL = "127.0.0.1";
const secretKey = process.env.SECRET_KEY;

const db = database.initDatabase();

app.listen(PORT, URL, () => {
  console.log(`Listening to http://${URL}:${PORT}`);
});

//Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).send("Access denied");

  jwt.verify(token, secretKey, (error, user) => {
    if (error) return res.status(403).send("Invalid token");
    req.user = user;
    next();
  });
}

// USER REGISTRATION
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).send("Name, email, and password are required");
  }

  const hashedPassword = await bcrypt.hash(password, 8);

  db.run(
    `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`,
    [name, email, hashedPassword],
    function (error) {
      if (error) {
        console.error("Error:", error.message);
        return res
          .status(500)
          .send("Something went wrong. User Registration failed");
      }
      res.send("Your registration has been successul!");
    }
  );
});

// USER LOGIN
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).send("Email and password are required");
  }

  db.get(
    `SELECT * FROM users WHERE email = ?`,
    [email],
    async (error, user) => {
      if (error) {
        console.error("Error:", error.message);
        return res.status(500).send("Error");
      }
      if (!user) {
        return res.status(400).send("Check that you have the right email");
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(400).send("Check that you have the right password");
      }

      const token = jwt.sign({ email: user.email }, secretKey, {
        expiresIn: "2h",
      });
      res.send({ message: "Login successful!", token });
    }
  );
});

// CREATE A CHANNEL AND AUTOMATICALLY SUBSCRIBE OWNER
app.post("/channels", authenticateToken, (req, res) => {
  const { name } = req.body;
  const owner_email = req.user.email;

  if (!name) {
    return res.status(400).send("Channel name is required");
  }

  db.get(
    `SELECT * FROM users WHERE email = ?`,
    [owner_email],
    (error, user) => {
      if (error) {
        console.error("Error:", error.message);
        return res.status(500).send("Error checking channel owner");
      }
      if (!user) {
        return res.status(400).send("Channel owner not found");
      }

      db.run(
        `INSERT INTO channels (name, owner_id) VALUES (?, ?)`,
        [name, user.id],
        function (error) {
          if (error) {
            console.error("Error:", error.message);
            return res.status(500).send("Error creating channel");
          }

          const channelId = this.lastID;

          // Automatically subscribe owner to channel
          db.run(
            `INSERT INTO user_channels (user_id, channel_id) VALUES (?, ?)`,
            [user.id, channelId],
            function (error) {
              if (error) {
                console.error("Error:", error.message);
                return res
                  .status(500)
                  .send("Error subscribing owner to channel");
              }
              res.send({ id: channelId, name, owner_id: user.id });
            }
          );
        }
      );
    }
  );
});

// DELETE A CHANNEL
app.delete("/channels/:channel_id", authenticateToken, (req, res) => {
  const { channel_id } = req.params;
  const user_email = req.user.email;

  db.get(`SELECT * FROM users WHERE email = ?`, [user_email], (error, user) => {
    if (error) {
      console.error("Error:", error.message);
      return res.status(500).send("Error verifying user");
    }
    if (!user) {
      return res.status(400).send("User not found");
    }

    db.get(
      `SELECT * FROM channels WHERE id = ?`,
      [channel_id],
      (error, channel) => {
        if (error) {
          console.error("Error:", error.message);
          return res.status(500).send("Error verifying channel");
        }
        if (!channel) {
          return res.status(400).send("Channel not found");
        }

        if (channel.owner_id !== user.id) {
          return res
            .status(403)
            .send("You do not have permission to delete this channel");
        }

        db.run(
          `DELETE FROM channels WHERE id = ?`,
          [channel_id],
          function (error) {
            if (error) {
              console.error("Error:", error.message);
              return res.status(500).send("Failed to delete channel");
            }

            // Delete related associations in the user_channels table
            db.run(
              `DELETE FROM user_channels WHERE channel_id = ?`,
              [channel_id],
              function (error) {
                if (error) {
                  console.error("Error:", error.message);
                  return res
                    .status(500)
                    .send("Failed to delete user-channel associations");
                }

                // Delete related messages in the messages table
                db.run(
                  `DELETE FROM messages WHERE channel_id = ?`,
                  [channel_id],
                  function (error) {
                    if (error) {
                      console.error("Error:", error.message);
                      return res.status(500).send("Failed to delete messages");
                    }

                    res.send("Channel deleted successfully");
                  }
                );
              }
            );
          }
        );
      }
    );
  });
});

// SUBSCRIBE A USER TO A CHANNEL
app.post("/channels/subscribe", authenticateToken, (req, res) => {
  const { channel_id } = req.body;
  const user_email = req.user.email;

  // Log to check received parameters
  console.log(`User email: ${user_email}, Channel ID: ${channel_id}`);

  db.get(`SELECT * FROM users WHERE email = ?`, [user_email], (error, user) => {
    if (error) {
      console.error("Error:", error.message);
      return res.status(500).send("Error verifying user");
    }
    if (!user) {
      return res.status(400).send("User not found");
    }

    // Log to confirm that the user was found
    console.log(`User found: ${user.id}`);

    // Verify that the channel exists before subscribing
    db.get(
      `SELECT * FROM channels WHERE id = ?`,
      [channel_id],
      (error, channel) => {
        if (error) {
          console.error("Error:", error.message);
          return res.status(500).send("Error verifying channel");
        }
        if (!channel) {
          return res.status(400).send("Channel not found");
        }

        // Log to confirm that the channel was found
        console.log(`Channel found: ${channel.id}`);

        db.run(
          `INSERT INTO user_channels (user_id, channel_id) VALUES (?, ?)`,
          [user.id, channel_id],
          function (error) {
            if (error) {
              if (error.message.includes("UNIQUE constraint failed")) {
                console.error("User is already subscribed to the channel");
                return res
                  .status(400)
                  .send("User is already subscribed to the channel");
              }
              console.error("Error:", error.message);
              return res.status(500).send("Failed to subscribe to channel");
            }

            // Log to confirm registration was successful
            console.log(`User ${user.id} subscribed to channel ${channel_id}`);
            res.send("User subscribed to channel");
          }
        );
      }
    );
  });
});

// POST A MESSAGE TO A CHANNEL
app.post("/channels/:channel_id/messages", authenticateToken, (req, res) => {
  const { channel_id } = req.params;
  const { content } = req.body;
  const user_email = req.user.email;

  db.get(`SELECT * FROM users WHERE email = ?`, [user_email], (error, user) => {
    if (error) {
      console.error("Error", error.message);
      return res.status(500).send("Error verifying user");
    }
    if (!user) {
      return res.status(400).send("User not found");
    }

    // Check if the user is the channel owner
    db.get(
      `SELECT * FROM channels WHERE id = ?`,
      [channel_id],
      (error, channel) => {
        if (error) {
          console.error("Error:", error.message);
          return res.status(500).send("Error checking channel");
        }
        if (!channel) {
          return res.status(400).send("Channel not found");
        }

        if (channel.owner_id === user.id) {
          // If the user is the channel owner, allow posting without checking subscription
          db.run(
            `INSERT INTO messages (content, user_id, channel_id) VALUES (?, ?, ?)`,
            [content, user.id, channel_id],
            function (error) {
              if (error) {
                console.error("Error:", error.message);
                return res.status(500).send("Failed to post message");
              }
              res.send({
                id: this.lastID,
                content,
                user_id: user.id,
                channel_id,
              });
            }
          );
        } else {
          // Check if the user is subscribed to the channel
          db.get(
            `SELECT * FROM user_channels WHERE user_id = ? AND channel_id = ?`,
            [user.id, channel_id],
            (error, row) => {
              if (error) {
                console.error("Error:", error.message);
                return res.status(500).send("Error checking registration");
              }
              if (!row) {
                return res
                  .status(403)
                  .send("User is not subscribed to this channel");
              }

              db.run(
                `INSERT INTO messages (content, user_id, channel_id) VALUES (?, ?, ?)`,
                [content, user.id, channel_id],
                function (error) {
                  if (error) {
                    console.error("Error:", error.message);
                    return res.status(500).send("Failed to post message");
                  }
                  res.send({
                    id: this.lastID,
                    content,
                    user_id: user.id,
                    channel_id,
                  });
                }
              );
            }
          );
        }
      }
    );
  });
});

// VIEW ALL MESSAGES FROM A CHANNEL
app.get("/channels/:channel_id/messages", authenticateToken, (req, res) => {
  const { channel_id } = req.params;
  const user_email = req.user.email;

  db.get(`SELECT * FROM users WHERE email = ?`, [user_email], (error, user) => {
    if (error) {
      console.error("Error:", error.message);
      return res.status(500).send("Error verifying user");
    }
    if (!user) {
      return res.status(400).send("User not found");
    }

    // Check if the user is the channel owner
    db.get(
      `SELECT * FROM channels WHERE id = ?`,
      [channel_id],
      (error, channel) => {
        if (error) {
          console.error("Error:", error.message);
          return res.status(500).send("Error checking channel");
        }
        if (!channel) {
          return res.status(400).send("Channel not found");
        }

        if (channel.owner_id === user.id) {
          // If the user is the channel owner, allow viewing of messages
          db.all(
            `SELECT messages.id, messages.content, users.name AS user_name FROM messages JOIN users ON messages.user_id = users.id WHERE messages.channel_id = ?`,
            [channel_id],
            (error, rows) => {
              if (error) {
                console.error("Error:", error.message);
                return res.status(500).send("Error retrieving messages");
              }
              res.send(rows);
            }
          );
        } else {
          // Check if the user is subscribed to the channel
          db.get(
            `SELECT * FROM user_channels WHERE user_id = ? AND channel_id = ?`,
            [user.id, channel_id],
            (error, row) => {
              if (error) {
                console.error("Error:", error.message);
                return res.status(500).send("Error checking registration");
              }
              if (!row) {
                return res
                  .status(403)
                  .send("User is not subscribed to this channel");
              }

              db.all(
                `SELECT messages.id, messages.content, users.name AS user_name FROM messages JOIN users ON messages.user_id = users.id WHERE messages.channel_id = ?`,
                [channel_id],
                (error, rows) => {
                  if (error) {
                    console.error("Error:", error.message);
                    return res.status(500).send("Error retrieving messages");
                  }
                  res.send(rows);
                }
              );
            }
          );
        }
      }
    );
  });
});

// EDIT A MESSAGE
app.put(
  "/channels/:channel_id/messages/:message_id",
  authenticateToken,
  (req, res) => {
    const { channel_id, message_id } = req.params;
    const { content } = req.body;
    const user_email = req.user.email;

    if (!content) {
      return res.status(400).send("Content is required to update the message");
    }

    db.get(
      `SELECT * FROM users WHERE email = ?`,
      [user_email],
      (error, user) => {
        if (error) {
          console.error("Error:", error.message);
          return res.status(500).send("Error verifying user");
        }
        if (!user) {
          return res.status(400).send("User not found");
        }

        db.get(
          `SELECT * FROM messages WHERE id = ? AND channel_id = ?`,
          [message_id, channel_id],
          (error, message) => {
            if (error) {
              console.error("Error:", error.message);
              return res.status(500).send("Error verifying message");
            }
            if (!message) {
              return res.status(400).send("Message not found");
            }

            // Check if the user is the author of the message
            if (message.user_id !== user.id) {
              return res
                .status(403)
                .send("You do not have permission to edit this message");
            }

            db.run(
              `UPDATE messages SET content = ? WHERE id = ?`,
              [content, message_id],
              function (error) {
                if (error) {
                  console.error("Error:", error.message);
                  return res.status(500).send("Failed to update message");
                }

                res.send("Message updated successfully");
              }
            );
          }
        );
      }
    );
  }
);

// DELETE A MESSAGE
app.delete(
  "/channels/:channel_id/messages/:message_id",
  authenticateToken,
  (req, res) => {
    const { channel_id, message_id } = req.params;
    const user_email = req.user.email;

    db.get(
      `SELECT * FROM users WHERE email = ?`,
      [user_email],
      (error, user) => {
        if (error) {
          console.error("Error:", error.message);
          return res.status(500).send("Error verifying user");
        }
        if (!user) {
          return res.status(400).send("User not found");
        }

        db.get(
          `SELECT * FROM messages WHERE id = ? AND channel_id = ?`,
          [message_id, channel_id],
          (error, message) => {
            if (error) {
              console.error("Error:", error.message);
              return res.status(500).send("Error verifying message");
            }
            if (!message) {
              return res.status(400).send("Message not found");
            }

            db.get(
              `SELECT * FROM channels WHERE id = ?`,
              [channel_id],
              (error, channel) => {
                if (error) {
                  console.error("Error:", error.message);
                  return res.status(500).send("Error verifying channel");
                }
                if (!channel) {
                  return res.status(400).send("Channel not found");
                }

                // Check if the user is the author of the message or the owner of the channel
                if (
                  message.user_id !== user.id &&
                  channel.owner_id !== user.id
                ) {
                  return res
                    .status(403)
                    .send("You do not have permission to delete this message");
                }

                db.run(
                  `DELETE FROM messages WHERE id = ?`,
                  [message_id],
                  function (error) {
                    if (error) {
                      console.error("Error:", error.message);
                      return res.status(500).send("Failed to delete message");
                    }

                    res.send("Message deleted successfully");
                  }
                );
              }
            );
          }
        );
      }
    );
  }
);
