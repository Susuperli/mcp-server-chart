import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import cors from "cors";
import express, { type Request, type Response } from "express";

export const startSSEMcpServer = async (
  server: Server,
  endpoint = "/sse",
  port = 1122,
): Promise<void> => {
  const app = express();
  app.use(express.json());
  app.use(
    cors({
      origin: "*",
      exposedHeaders: ["Content-Type", "Cache-Control"],
      credentials: true,
    }),
  );

  const transports: Record<string, SSEServerTransport> = {};

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // Ping test endpoint
  app.get("/ping", (_req: Request, res: Response) => {
    res.json({ message: "pong" });
  });

  app.get(endpoint, async (req: Request, res: Response) => {
    try {
      const transport = new SSEServerTransport("/messages", res);
      transports[transport.sessionId] = transport;
      transport.onclose = () => delete transports[transport.sessionId];
      await server.connect(transport);
    } catch (error) {
      console.error("SSE connection error:", error);
      if (!res.headersSent)
        res.status(500).send("Error establishing SSE stream");
    }
  });

  app.post("/messages", async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) return res.status(400).send("Missing sessionId parameter");

    const transport = transports[sessionId];
    if (!transport) return res.status(404).send("Session not found");

    try {
      await transport.handlePostMessage(req, res, req.body);
    } catch (error) {
      console.error("Message handling error:", error);
      if (!res.headersSent) res.status(500).send("Error handling request");
    }
  });

  app.listen(port, () => {
    console.log(`SSE Server listening on http://localhost:${port}${endpoint}`);
  });
};
