import { Router } from "express";
import { requireUser } from "../middleware/auth.js";

export const mediaRouter: Router = Router();

mediaRouter.use(requireUser);

mediaRouter.get("/:cacheId", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});
