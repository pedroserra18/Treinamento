declare module "hpp" {
  import { RequestHandler } from "express";

  interface HppOptions {
    whitelist?: string[];
    checkBody?: boolean;
    checkQuery?: boolean;
  }

  export default function hpp(options?: HppOptions): RequestHandler;
}

declare module "express-xss-sanitizer" {
  import { RequestHandler } from "express";

  interface XssOptions {
    allowedKeys?: string[];
    maxDepth?: number;
  }

  export function xss(options?: XssOptions): RequestHandler;
}
