import { Router, type IRouter } from "express";
import healthRouter from "./health";
import learningRouter from "./learning";
import professorRouter from "./professor";

const router: IRouter = Router();

router.use(healthRouter);
router.use(professorRouter);
router.use(learningRouter);

export default router;
