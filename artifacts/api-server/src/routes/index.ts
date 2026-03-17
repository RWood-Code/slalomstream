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
import officialsRouter from "./officials";
import emsRouter from "./ems";
import updateRouter from "./update";

const router = Router();

router.use(healthRouter);
router.use("/network-info", networkRouter);
router.use("/waterskiconnect", waterskiconnectRouter);
router.use("/tournaments", tournamentRouter);
router.use("/tournaments/:id/skiers", skiersTournamentRouter);
router.use("/skiers", skierRouter);
router.use("/tournaments/:id/passes", passesTournamentRouter);
router.use("/passes/:id/judge-scores", judgeScorePassRouter);
router.use("/tournaments/:id/judge-scores", judgeScoreTournamentRouter);
router.use("/passes", passRouter);
router.use("/tournaments/:id/judges", judgesTournamentRouter);
router.use("/judges", judgeRouter);
router.use("/settings", settingsRouter);
router.use("/admin", adminRouter);
router.use("/officials", officialsRouter);
router.use("/ems", emsRouter);
router.use("/update", updateRouter);

export default router;
