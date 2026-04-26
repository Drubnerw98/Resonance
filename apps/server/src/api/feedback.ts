import { Router } from "express";
import { requireUser } from "../middleware/auth.js";

export const feedbackRouter: Router = Router();

feedbackRouter.use(requireUser);

feedbackRouter.patch("/:id/feedback", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});
