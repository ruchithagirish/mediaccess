import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors";

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Route not found." } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: first?.message ?? "Invalid input.", details: err.flatten().fieldErrors },
    });
  }
  if (err instanceof AppError) {
    return res
      .status(err.status)
      .json({ success: false, error: { code: err.code, message: err.message, details: err.details } });
  }
  console.error(err);
  res.status(500).json({ success: false, error: { code: "INTERNAL", message: "Something went wrong." } });
};
