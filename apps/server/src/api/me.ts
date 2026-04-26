import { Router } from "express";
import { requireUser } from "../middleware/auth.js";

export const meRouter: Router = Router();

meRouter.use(requireUser);

meRouter.get("/", (req, res) => {
  // requireUser guarantees req.user is present.
  res.json({ user: req.user });
});
