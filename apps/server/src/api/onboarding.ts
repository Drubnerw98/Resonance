import { Router } from "express";
import { requireUser } from "../middleware/auth.js";

export const onboardingRouter: Router = Router();

onboardingRouter.use(requireUser);

onboardingRouter.post("/message", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

onboardingRouter.get("/session", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

onboardingRouter.post("/complete", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});
