import { Router, type IRouter } from "express";
import healthRouter from "./health";
import learningRouter from "./learning";
import professorRouter from "./professor";
import { getInternalCourse } from "../lib/courseContent";

const router: IRouter = Router();

router.get("/", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
router.use(healthRouter);
// Load only on requests, after health routes, and before any course side effects.
router.use((_req, _res, next) => {
  try {
    getInternalCourse();
    next();
  } catch (err) {
    next(err);
  }
});
router.use(professorRouter);
router.use(learningRouter);

export default router;
