import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import emulatorManager from './core/EmulatorManager';
import { db, initDb } from "./db/database";

export const app = express();

// Initialize database
initDb().catch(console.error);

app.use(express.json());

app.get('/ping', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// POST /spawn - spawn a charger by id (query or body)
app.post('/spawn', (req, res) => {
  const chargerId = (req.query.chargerId as string) || req.body?.chargerId;
  if (!chargerId) {
    console.log('POST /spawn missing chargerId');
    return res.status(400).json({ success: false, error: 'chargerId is required' });
  }
  emulatorManager.spawnCharger(chargerId);
  console.log(`Spawned charger ${chargerId}`);
  return res.json({ success: true, id: chargerId });
});

// POST /command - send simple commands to a charger
app.post('/command', (req, res) => {
  const body = req.body || {};
  const id: string = body.id;
  const cmd: string = body.cmd;
  const sessionId: string | undefined = body.sessionId;
  const type: string | undefined = body.type;

  if (!id || !cmd) {
    console.log('POST /command missing id or cmd');
    return res.status(400).json({ success: false, error: 'id and cmd are required' });
  }

  switch (cmd) {
    case 'start': {
      if (!sessionId) {
        return res.status(400).json({ success: false, error: 'sessionId is required for start' });
      }
      const success = emulatorManager.startSession(id, sessionId);
      if (!success) {
        return res.status(400).json({ success: false, error: 'SESSION_EXISTS' });
      }
      console.log(`Command start for ${id} session ${sessionId}`);
      break;
    }
    case 'stop': {
      emulatorManager.stopSession(id);
      console.log(`Command stop for ${id}`);
      break;
    }
    case 'fault': {
      if (!type) {
        return res.status(400).json({ success: false, error: 'type is required for fault' });
      }
      emulatorManager.injectFault(id, type);
      console.log(`Command fault for ${id} type ${type}`);
      break;
    }
    default:
      return res.status(400).json({ success: false, error: `unknown cmd ${cmd}` });
  }

  return res.json({ success: true, id, cmd });
});

// POST /delete - delete a charger by id
app.post('/delete', (req, res) => {
  const id = req.body?.id as string;
  if (!id) {
    console.log('POST /delete missing id');
    return res.status(400).json({ success: false, error: 'id is required' });
  }
  const ok = emulatorManager.deleteCharger(id);
  if (!ok) {
    return res.json({ success: false, message: 'not found' });
  }
  console.log(`Deleted charger ${id}`);
  return res.json({ success: true, id });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const server = http.createServer(app);

// Socket.IO server
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('disconnect', () => {
    // eslint-disable-next-line no-console
    console.log('Client disconnected');
  });
});

// Register telemetry handler that broadcasts to all connected socket.io clients
emulatorManager.setTelemetryHandler((t: any) => {
  io.emit('telemetry', t);
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Virtual EV Charger Emulator listening on port ${PORT}`);
  console.log(`WebSocket running at ws://localhost:${PORT}`);
});

app.get("/sessions", async (req, res) => {
  const rows = await db.execute("SELECT * FROM sessions");
  res.json(rows.rows);
});
export { server, io };
