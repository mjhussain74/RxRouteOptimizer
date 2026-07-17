import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import MemoryStore from "memorystore";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.stack || err.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

const app = express();
const httpServer = createServer(app);

const isProduction = process.env.NODE_ENV === 'production';

// Use MemoryStore for sessions (simpler and works with Neon serverless)
// Sessions will be lost on restart, but users can log in again
const MemoryStoreSession = MemoryStore(session);
const sessionStore = new MemoryStoreSession({
  checkPeriod: 86400000
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Block common vulnerability scanner paths — bots probe for PHP, WordPress,
// and other attack surfaces. Return 404 immediately rather than serving the
// React app (which currently returns 200 for all unknown paths).
app.use((req, res, next) => {
  const blocked = [
    ".php", ".asp", ".aspx", ".jsp", ".cgi",
    "wp-admin", "wp-login", "phpunit", "eval-stdin",
    "xmlrpc", ".env", ".git", "config.json", "setup.cgi",
  ];
  const path = req.path.toLowerCase();
  if (blocked.some(pattern => path.includes(pattern))) {
    return res.status(404).end();
  }
  next();
});

if (isProduction) {
  // Oracle Cloud routes traffic through multiple proxy hops
  // (Oracle Load Balancer → nginx → Node).
  // Setting trust proxy to true lets Express correctly see:
  //   - req.secure = true  (needed for Secure cookie flag)
  //   - req.ip = real client IP (not the proxy IP)
  // This is safe when nginx is the sole external entry point.
  app.set('trust proxy', true);
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'route-optimizer-secret-key',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    // secure: true sends the cookie only over HTTPS.
    // sameSite 'lax' (not 'none') works for same-site requests behind a
    // reverse proxy and avoids browsers silently dropping the cookie.
    // Use 'none' only if your frontend and backend are on different domains.
    secure: isProduction,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: isProduction ? 'lax' : 'lax'
  },
  proxy: isProduction
}));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        const jsonStr = JSON.stringify(capturedJsonResponse);
        logLine += ` :: ${jsonStr.length > 2000 ? jsonStr.substring(0, 2000) + '...[truncated]' : jsonStr}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Express error:", err.stack || err.message || err);
    res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
