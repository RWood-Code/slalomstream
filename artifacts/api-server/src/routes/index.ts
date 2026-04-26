import { Router } from "express";
import healthRouter from "./health";
import tournamentRouter from "./tournaments";
import skiersTournamentRouter, { skierRouter } from "./skiers";
import passesTournamentRouter, { passRouter } from "./passes";
import { judgeScorePassRouter, judgeScoreTournamentRouter } from "./judge_scores";
import judgesTournamentRouter, { judgeRouter } from "./judges";
import settingsRouter, { adminRouter } from "./settings";
import networkRouter from "./network";
import waterskiconnectRouter from "./waterskiconnect";
import surePathRouter from "./surepath";
import officialsRouter from "./officials";
import emsRouter from "./ems";
import systemRouter from "./system";
import { requireAdminIfPublic } from "../middleware/requireAdminIfPublic";

const router = Router();

router.use(healthRouter);
router.use("/network-info", networkRouter);
router.use("/waterskiconnect", waterskiconnectRouter);
router.use("/surepath", surePathRouter);

// Write-route protection: when tunnel is active, POST/PUT/DELETE require admin token.
// Scope is intentionally limited to tournament data (tournaments, skiers, passes).
// Judge routes are excluded so /judges/verify-pin (PIN login) and score submission
// continue to work without admin tokens — judges use PIN sessions only.
router.use("/tournaments", requireAdminIfPublic, tournamentRouter);
router.use("/tournaments/:id/skiers", requireAdminIfPublic, skiersTournamentRouter);
router.use("/skiers", requireAdminIfPublic, skierRouter);
router.use("/tournaments/:id/passes", requireAdminIfPublic, passesTournamentRouter);
// Judge routes: excluded from protection — PIN auth must remain unblocked
router.use("/passes/:id/judge-scores", judgeScorePassRouter);
router.use("/tournaments/:id/judge-scores", judgeScoreTournamentRouter);
router.use("/passes", requireAdminIfPublic, passRouter);
router.use("/tournaments/:id/judges", judgesTournamentRouter);
router.use("/judges", judgeRouter);
// Settings writes (PUT) are also protected when tunnel is active:
// an attacker could otherwise overwrite admin_pin and mint their own token.
// GET /settings remains open (no sensitive auth secrets returned).
// GET+POST /admin/verify-pin remain open (PIN login must work for all users).
router.use("/settings", requireAdminIfPublic, settingsRouter);
router.use("/admin", adminRouter);
router.use("/officials", officialsRouter);
router.use("/ems", emsRouter);
router.use("/system", systemRouter);

export default router;
