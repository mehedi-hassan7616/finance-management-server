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
    origin: [
      "http://localhost:3000",
      "https://finance-management-92d57.web.app",
    ],
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

    app.get("/reports", authGuard, async (req, res) => {
      try {
        const { email } = req.user;

        const allUserTransactions = await Transaction.find({
          user_email: email,
        }).toArray();

        let totalIncome = 0;
        let totalExpenses = 0;

        allUserTransactions.forEach((transaction) => {
          const amount = parseFloat(transaction.amount) || 0;
          if (transaction.type === "income") {
            totalIncome += amount;
          } else if (transaction.type === "expense") {
            totalExpenses += amount;
          }
        });

        const netBalance = totalIncome - totalExpenses;

        const monthlyData = [];
        for (let i = 5; i >= 0; i--) {
          const date = new Date();
          date.setMonth(date.getMonth() - i);
          const year = date.getFullYear();
          const monthNum = date.getMonth() + 1;
          const monthKey = `${year}-${String(monthNum).padStart(2, "0")}`;

          const lastDay = new Date(year, monthNum, 0).getDate();
          const monthStart = `${monthKey}-01`;
          const monthEnd = `${monthKey}-${String(lastDay).padStart(2, "0")}`;

          const monthTransactions = allUserTransactions.filter((t) => {
            if (!t.date) return false;
            const transactionDate = t.date;
            return transactionDate >= monthStart && transactionDate <= monthEnd;
          });

          let monthIncome = 0;
          let monthExpenses = 0;

          monthTransactions.forEach((transaction) => {
            const amount = parseFloat(transaction.amount) || 0;
            if (transaction.type === "income") {
              monthIncome += amount;
            } else if (transaction.type === "expense") {
              monthExpenses += amount;
            }
          });

          monthlyData.push({
            month: monthKey,
            monthLabel: date.toLocaleDateString("en-US", {
              month: "short",
              year: "numeric",
            }),
            income: monthIncome,
            expenses: monthExpenses,
          });
        }

        const categoryBreakdown = {};
        allUserTransactions.forEach((transaction) => {
          const categoryName = transaction.category || "Other";
          const transactionType = transaction.type || "expense";
          const amount = parseFloat(transaction.amount) || 0;

          const key = `${categoryName} (${transactionType})`;

          categoryBreakdown[key] = (categoryBreakdown[key] || 0) + amount;
        });

        const categoryData = Object.entries(categoryBreakdown).map(
          ([name, value]) => ({
            name,
            value: parseFloat(value.toFixed(2)),
          })
        );

        return res.status(200).json({
          success: true,
          message: "Reports data retrieved successfully",
          data: {
            summary: {
              totalIncome: parseFloat(totalIncome.toFixed(2)),
              totalExpenses: parseFloat(totalExpenses.toFixed(2)),
              netBalance: parseFloat(netBalance.toFixed(2)),
            },
            monthlyData,
            categoryData,
          },
        });
      } catch (error) {
        console.log("Reports error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to retrieve reports data",
          error: error.message,
        });
      }
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
