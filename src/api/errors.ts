// throw these anywhere in a handler; the server turns them into {error} with the right status.
export class HttpError extends Error {
  status: number; headers: Record<string, string>;
  constructor(status: number, message: string, headers: Record<string, string> = {}) {
    super(message); this.status = status; this.headers = headers;
  }
}
export const badRequest = (m: string) => new HttpError(400, m);
export const notFound = (m: string) => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);
