declare module 'compression' {
  import { RequestHandler } from 'express';
  interface CompressionOptions {
    level?: number;
    threshold?: number | string;
    filter?: (
      req: import('express').Request,
      res: import('express').Response
    ) => boolean;
    chunkSize?: number;
    windowBits?: number;
    memLevel?: number;
    strategy?: number;
  }
  function compression(options?: CompressionOptions): RequestHandler;
  export = compression;
}
