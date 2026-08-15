import express from "express";
import cors from "cors";
import { apiRouter } from "./routes";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use("/api", apiRouter);

app.listen(PORT, () => {
  console.log(`✅ Trip Wallet backend running at http://localhost:${PORT}`);
  console.log(`   API endpoints under /api/*`);
});
