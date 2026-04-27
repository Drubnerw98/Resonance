import { Router } from "express";
import { requireUser } from "../middleware/auth.js";
import { getActiveProfile } from "../services/profile.js";

export const profileRouter: Router = Router();

profileRouter.use(requireUser);

profileRouter.get("/", async (req, res, next) => {
  try {
    const row = await getActiveProfile(req.user!.id);
    if (!row) {
      res.status(404).json({ error: "no profile yet" });
      return;
    }
    res.json({
      id: row.id,
      version: row.currentVersion,
      data: row.profileData,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

profileRouter.put("/", (_req, res) => {
  // Manual profile editing — wire this up when the profile viewer needs an
  // edit mode. For now extraction is the only write path.
  res.status(501).json({ error: "not implemented" });
});
