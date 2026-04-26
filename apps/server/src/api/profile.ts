import { Router } from "express";
import { requireUser } from "../middleware/auth.js";

export const profileRouter: Router = Router();

profileRouter.use(requireUser);

profileRouter.get("/", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

profileRouter.put("/", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});
