const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const app = express();
app.use(express.json());

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const authentication = (request, response, next) => {
  let jwtToken;
  const authorHeader = request.headers["authorization"];
  if (authorHeader !== undefined) {
    jwtToken = authorHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    request.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "yytYGITYJU", async (error, payload) => {
      if (error) {
        request.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const userDetails = request.body;
  const { username, name, password, gender } = userDetails;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
      INSERT INTO 
        user (username, name, password, gender) 
      VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}'
        )`;
      await db.run(createUserQuery);

      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const getDetails = `SELECT *
    FROM user
    WHERE username = '${username}'`;
  const userDetails = await db.get(getDetails);

  if (userDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const passwordVerified = await bcrypt.compare(
      password,
      userDetails.password
    );
    if (passwordVerified) {
      const payLoad = { username: username };
      const jwtToken = jwt.sign(payLoad, "yytYGITYJU");
      response.status(200);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authentication, async (request, response) => {
  const { username } = request;

  const getUsersDetails = `SELECT *
  FROM user
  WHERE username = '${username}'
  `;
  const userDetails = await db.get(getUsersDetails);

  const getFeeds = `
  SELECT user.username AS username,
  tweet.tweet AS tweet,
  tweet.date_time AS dateTime
  FROM tweet INNER JOIN follower 
  ON tweet.user_Id = follower.following_user_id
  INNER JOIN user ON user.user_id = follower.following_user_id
  WHERE follower.follower_user_id = ${userDetails.user_id}
  ORDER BY tweet.date_time DESC
  LIMIT 4

  `;
  const feedDetails = await db.all(getFeeds);
  response.send(feedDetails);
});

app.get("/user/following/", authentication, async (request, response) => {
  const { username } = request;

  const getUsersDetails = `SELECT *
  FROM user
  WHERE username = '${username}'
  `;
  const userDetails = await db.get(getUsersDetails);

  const followingDetails = `
  SELECT user.name
  FROM user INNER JOIN follower 
  ON user.user_Id = follower.following_user_id
  WHERE follower.follower_user_id = ${userDetails.user_id}
  
  `;
  const Details = await db.all(followingDetails);
  response.send(Details);
});

app.get("/user/followers/", authentication, async (request, response) => {
  const { username } = request;

  const getUsersDetails = `SELECT *
  FROM user
  WHERE username = '${username}'
  `;
  const userDetails = await db.get(getUsersDetails);

  const followingDetails = `
  SELECT DISTINCT user.name
  FROM user INNER JOIN follower 
  ON  follower.follower_user_id = user.user_id
  WHERE follower.following_user_id = ${userDetails.user_id}
  
  `;
  const Details = await db.all(followingDetails);
  response.send(Details);
});

app.get("/tweets/:tweetId/", authentication, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;

  const getUsersDetails = `SELECT *
  FROM user
  WHERE username = '${username}'
  `;
  const userDetails = await db.get(getUsersDetails);

  const followingDetails = `
  SELECT 
   tweet.tweet,
   COUNT(DISTINCT like.user_id) AS likes,
  COUNT(reply.reply) AS replies,
  tweet.date_time AS dateTime
  FROM tweet INNER JOIN user ON user.user_id = tweet.user_id
  INNER JOIN follower ON follower.following_user_id = tweet.user_id
  INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
   INNER JOIN like ON like.tweet_id = tweet.tweet_id
  
  WHERE follower.follower_user_id = ${userDetails.user_id} AND tweet.tweet_id = ${tweetId}
  GROUP BY tweet.tweet
  
  `;
  const Details = await db.all(followingDetails);
  if (Details.length === 0) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(Details);
  }
});

app.get("/tweets/:tweetId/likes", authentication, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;

  const getUsersDetails = `SELECT *
  FROM user
  WHERE username = '${username}'
  `;
  const userDetails = await db.get(getUsersDetails);

  const followingDetails = `
  SELECT DISTINCT user.username
  FROM user INNER JOIN follower 
  ON user.user_Id = follower.following_user_id
  INNER JOIN like ON like.tweet_id = ${tweetId}
  WHERE follower.follower_user_id = ${userDetails.user_id}

  `;
  const Details = await db.all(followingDetails);
  if (Details.length === 0) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    let userName = Details.map((user) => user.username);
    response.send({ likes: userName });
  }
});

app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;

    const getUsersDetails = `SELECT *
  FROM user
  WHERE username = '${username}'
  `;
    const userDetails = await db.get(getUsersDetails);

    const followingDetails = `
  SELECT DISTINCT user.username,
  reply.reply
  FROM user INNER JOIN follower 
  ON user.user_Id = follower.following_user_id
  INNER JOIN reply ON reply.tweet_id = ${tweetId}
  WHERE follower.follower_user_id = ${userDetails.user_id}

  `;
    const Details = await db.all(followingDetails);
    if (Details.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({
        replies: Details.map((user) => {
          return {
            name: user.username,
            reply: user.reply,
          };
        }),
      });
    }
  }
);

app.get("/user/tweets/", authentication, async (request, response) => {
  const { username } = request;

  const TweetDetails = `
  SELECT 
  tweet.tweet,
  COUNT(like.user_id) AS likes,
  COUNT(reply.user_id) AS replies,
  tweet.date_time AS dateTime

  FROM user 
  INNER JOIN tweet ON user.user_id = tweet.user_id
  INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
  INNER JOIN like ON tweet.tweet_id = like.tweet_id
 WHERE user.username = '${username}' 

  `;
  const Details = await db.all(TweetDetails);

  response.send(Details);
});

const { format } = require("date-fns");
app.post("/user/tweets/", authentication, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;

  const getUsersDetails = `SELECT *
  FROM user
  WHERE username = '${username}'
  `;
  const userDetails = await db.get(getUsersDetails);
  let dateNow = format(new Date(), "yyyy-MM-dd hh:mm:ss");
  console.log(dateNow);
  const TweetDetails = `
  INSERT INTO tweet
  (tweet,user_id,date_time)
  VALUES ('${tweet}',${userDetails.user_id},'${dateNow}')

  `;
  const Details = await db.run(TweetDetails);

  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;

  const getUsersDetails = `SELECT *
  FROM user
  WHERE username = '${username}'
  `;
  const userDetails = await db.get(getUsersDetails);

  const TweetDetails = `
  SELECT * 
  FROM  tweet
  WHERE  tweet_id = ${tweetId}
  `;
  const tweet = await db.run(TweetDetails);
  if (tweet.user_id === userDetails.userId) {
    const TweetDetails = `
  DELETE FROM  tweet
  WHERE user_id = ${userDetails.user_id} AND tweet_id = ${tweetId}
  `;
    await db.run(TweetDetails);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
