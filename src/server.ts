import { sync, type Changes } from "aframe-watcher-bun";
// @ts-ignore
import aframeInspector from "../node_modules/aframe-inspector/dist/aframe-inspector.min.js" with { type: "text" };
// @ts-ignore
import aframeMin from "../node_modules/aframe/dist/aframe-master.min.js" with { type: "text" };
import { name as projectName } from "../package.json";
import { config } from "dotenv";
import { readdir } from "node:fs/promises";
import path from "path";

config();

const port = parseInt(process.env.PORT || "3000");

const PROJECT_DIR = process.env.PROJECT_DIR || "public";

// Path resolution: CLI arg > ENV > Default ./index.html
const cliPath = process.argv[2];
const envPath = process.env.AFRAME_WATCHER_HTML;
const defaultPath = path.join(PROJECT_DIR, "/*.html");

let examplePath = cliPath || envPath || defaultPath;
const isDefault = !cliPath && !envPath;

const file = Bun.file(examplePath);


// If the PROJECT_DIR does not exist or is empty, clone the template repository
const projectPath = path.join(process.cwd(), PROJECT_DIR);
const projectDirExists = await Bun.file(projectPath).exists();
const projectDirIsEmpty = projectDirExists && (await readdir(projectPath)).length === 0;


console.log(`[${projectName}] Starting A-Frame Bun Watcher on http://localhost:${port}...`);
console.log(`[${projectName}] Targeting files: ${examplePath}`);

export const serverOptions = {
  port,
  async fetch(req: Request) {
    const url = new URL(req.url);

    // 1. Serve static files from the PROJECT_DIR
    if (url.pathname === "/") {
      // Serve index.html from the project root
      const indexFilePath = path.join(PROJECT_DIR, "index.html");
      const indexFile = Bun.file(indexFilePath);
      if (await indexFile.exists()) {
        return new Response(indexFile, { headers: { "Content-Type": "text/html" } });
      }
    }

    const filePath = path.join(PROJECT_DIR, url.pathname);
    const file = Bun.file(filePath);

    if (await file.exists()) {
      return new Response(file);
    }

    // Serve A-Frame library (Bundled)
    if (url.pathname === "/aframe.min.js") {
      return new Response(aframeMin as any, {
        headers: { "Content-Type": "application/javascript" }
      });
    }

    // Serve A-Frame Inspector (Bundled)
    if (url.pathname === "/aframe-inspector.min.js") {
      return new Response(aframeInspector as any, {
        headers: { "Content-Type": "application/javascript" }
      });
    }

    // Handle Save Endpoint
    if (req.method === "POST" && url.pathname === "/save") {
      console.log("Triggering save...");
      try {

        const changes = (await req.json()) as Changes;
        console.log("Syncing save...");
        sync(changes, [examplePath]);
        console.log("Synched save.");

        return new Response("OK", { 
          status: 200,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      } catch (e) {
        console.error("Error on save:", e);
        return new Response("Error on save", { status: 500 });
      }
    }

    // CORS Preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};

let server: any;
if (import.meta.main) {
  server = Bun.serve(serverOptions);
  console.log(`[${projectName}] ready at ${server.url}`);
}
