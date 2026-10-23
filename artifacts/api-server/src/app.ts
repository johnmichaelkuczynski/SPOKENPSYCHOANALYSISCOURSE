import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { CourseUnavailableError } from "./lib/courseContent";
import { browserProgress } from "./middlewares/browserProgress";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", (req, res, next) => {
  if (req.path === "/" || req.path === "/healthz") {
    next();
    return;
  }
  browserProgress(req, res, next);
});
app.use("/api", router);

const courseErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (err instanceof CourseUnavailableError) {
    res.status(404).json({ error: err.message });
    return;
  }
  next(err);
};
app.use(courseErrorHandler);

export default app;
