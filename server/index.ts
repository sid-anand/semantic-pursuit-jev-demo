import "dotenv/config";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PursuitService } from "./pursuit.ts";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distDirectory = join(root, "dist");
const port = Number.parseInt(process.env.PORT ?? "8787", 10);
const pursuit = new PursuitService();

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readBody(request: NodeJS.ReadableStream): Promise<string> {
  let body = "";
  for await (const chunk of request) {
    body += String(chunk);
    if (body.length > 16_384) throw new Error("Request body is too large");
  }
  return body;
}

async function serveStatic(pathname: string, response: ServerResponse): Promise<void> {
  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const safePath = normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = join(distDirectory, safePath);

  if (!filePath.startsWith(distDirectory) || !existsSync(filePath) || (await stat(filePath)).isDirectory()) {
    filePath = join(distDirectory, "index.html");
  }

  if (!existsSync(filePath)) {
    sendJson(response, 404, {
      error: "The web build was not found. Run `npm run build`, or use `npm run dev`.",
    });
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/status") {
    const configured = Boolean(process.env.TYPESAFE_API_KEY?.trim());
    sendJson(response, 200, {
      engine: "jev",
      ready: configured,
      model: configured ? "jev-latest" : null,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/pursuit/evaluate") {
    try {
      if (!process.env.TYPESAFE_API_KEY?.trim()) {
        sendJson(response, 503, { error: "TYPESAFE_API_KEY is not configured." });
        return;
      }
      const body = JSON.parse(await readBody(request)) as unknown;
      sendJson(response, 200, { snapshot: await pursuit.evaluate(body) });
    } catch (error) {
      const message = error instanceof SyntaxError
        ? "The request body must be valid JSON."
        : error instanceof Error
          ? error.message
          : "Jev could not evaluate the clues.";
      sendJson(response, 400, { error: message });
    }
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "API route not found." });
    return;
  }

  await serveStatic(url.pathname, response);
});

server.listen(port, "127.0.0.1", () => {
  const mode = process.env.TYPESAFE_API_KEY?.trim() ? "TypeSafe Jev ready" : "API key required";
  console.log(`Semantic Pursuit listening at http://127.0.0.1:${port} (${mode})`);
});

function shutdown(): void {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
