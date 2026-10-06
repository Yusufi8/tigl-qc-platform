import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prototypePath = "/TIGL-QC-Dev-Packet/prototype/qc-platform-prototype.html";
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const host = process.env.PREVIEW_HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);

createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  if (pathname === "/" || pathname === "/preview") pathname = prototypePath;

  const filePath = path.resolve(projectRoot, `.${pathname}`);
  if (!filePath.startsWith(`${projectRoot}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    const notFound = error?.code === "ENOENT" || error?.code === "EISDIR";
    response.writeHead(notFound ? 404 : 500).end(notFound ? "Not found" : "Preview server error");
  }
}).listen(port, host, () => {
  console.log(`TIGL QC preview: http://${host}:${port}/`);
  console.log("Demo only: data stays in this browser profile and is not sent to a server.");
});
