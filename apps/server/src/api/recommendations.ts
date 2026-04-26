import { Router } from "express";
import { requireUser } from "../middleware/auth.js";

export const recommendationsRouter: Router = Router();

recommendationsRouter.use(requireUser);

recommendationsRouter.post("/generate", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

recommendationsRouter.get("/", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});
