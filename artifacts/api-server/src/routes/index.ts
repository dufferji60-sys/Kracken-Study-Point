import { Router, type IRouter } from "express";
import healthRouter from "./health";
import studyRouter from "./study";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(studyRouter);
router.use(storageRouter);

export default router;
