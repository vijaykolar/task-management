import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";

type AsyncRequestHandler<P = ParamsDictionary> = (
  req: Request<P>,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/**
 * Wraps an async route handler so rejected promises are forwarded to Express.
 * Pass the route params as the type argument to get them typed, e.g.
 * `asyncHandler<{ projectId: string }>(async (req) => ...)`.
 */
const asyncHandler = <P = ParamsDictionary>(
  requestHandler: AsyncRequestHandler<P>,
): RequestHandler<P> => {
  return (req, res, next) => {
    Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err));
  };
};

export { asyncHandler };
export type { AsyncRequestHandler };
