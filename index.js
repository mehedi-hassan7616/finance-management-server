const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

const serviceAccount = require("./firebase-adminsdk.json");
const URI = process.env.MONGODB_URI;

app.use(
  cors({
    origin: ["http://localhost:3000"],
  })
);
app.use(express.json());

const client = new MongoClient(URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const authGuard = async (req, res, next) => {
  const { authorization: bearerToken } = req.headers;
  if (!bearerToken) {
    return res.status(401).json({
      success: false,
      massage: "Unauthorized access",
    });
  }
  const token = bearerToken.split(" ")[1];
  if (!token) {
    return res.status(401).json({
      success: false,
      massage: "Unauthorized access",
    });
  }
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.log(error);
    return res.status(401).json({
      success: false,
      message: "Forbidden access",
    });
  }
};

app.get("/", (_req, res) => {
  res.send("Hello World!");
});

async function run() {
  try {
    await client.connect();
    const db = await client.db("finantial_management");
    const Transaction = db.collection("transactions");

    // ================TRANSACTIONS================

    // Create transaction
    app.post("/transactions", authGuard, async (req, res) => {
      const body = req.body;
      const user = req.user;
      console.log(user);
      const payload = {
        ...body,
        user_name: user?.name,
        user_email: user?.email,
        created_at: new Date(),
      };

      const result = await Transaction.insertOne(payload);

      return res.status(201).json({
        success: true,
        message: "Transaction created successfully",
        data: result,
      });
    });

    // Get transactions
    app.get("/transactions", authGuard, async (req, res) => {
      const { email } = req.user;
      const { type } = req.query;

      const query = {
        user_email: email,
      };

      if (type !== "all") {
        query.type = type;
      }

      const result = await Transaction.find(query)
        .sort({ created_at: -1 })
        .toArray();

      return res.status(200).json({
        success: true,
        message: "Transactions retrieved successfully",
        data: result,
      });
    });

    // Get single transaction
    app.get("/transactions/:id", authGuard, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await Transaction.findOne(query);

      if (!result) {
        return res.status(404).json({
          success: false,
          message: "Transaction not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Transaction retrieved successfully",
        data: result,
      });
    });

    // Update transaction
    app.patch("/transactions/:id", authGuard, async (req, res) => {
      const { id } = req.params;
      const payload = req.body;

      const query = { _id: new ObjectId(id) };

      const transaction = await Transaction.findOne(query);

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: "Transaction not found",
        });
      }

      const update = {
        $set: {
          type: payload?.type || transaction.type,
          amount: Number(payload?.amount) || transaction.amount,
          description: payload?.description || transaction.description,
          category: payload?.category || transaction.category,
          date: payload?.date || transaction.date,
        },
      };
      const options = { returnDocument: "after" };
      const result = await Transaction.updateOne(query, update, options);
      return res.json({
        statusCode: 201,
        success: true,
        data: result,
      });
    });

    // Delete transaction
    app.delete("/transactions/:id", authGuard, async (req, res) => {
      const { id } = req.params;
      const user = req.user;
      const query = { _id: new ObjectId(id) };

      const transaction = await Transaction.findOne(query);

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: "Transaction not found",
        });
      }

      if (transaction.user_email !== user?.email) {
        return res.status(401).json({
          success: false,
          message: "You can't delete this transaction",
        });
      }

      await Transaction.deleteOne({
        _id: new ObjectId(id),
        user_email: user.email,
      });

      return res.status(200).json({
        success: false,
        message: "Transaction deleted successfully",
      });
    });

    console.log("Connected to MongoDB successfully!");
  } catch (error) {
    console.log("Error from mongodb", error);
  }
}
run();

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
