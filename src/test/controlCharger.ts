import readline from 'readline';
import emulatorManager from '../core/EmulatorManager';

const CHARGER_ID = 'T1';

// spawn charger
emulatorManager.spawnCharger(CHARGER_ID);
emulatorManager.spawnCharger("T2");
emulatorManager.spawnCharger("T3");

console.log('Control Charger CLI');
console.log('Commands:');
console.log('  start <sessionId>  - start charging session');
console.log('  stop               - stop charging session');
console.log('  fault <type>       - inject a fault');
console.log('  status             - show charger status');
console.log('  list               - list all chargers');
console.log('  stopall            - stop sessions on all chargers');
console.log('  stopalltelemetry   - stop telemetry on all chargers');
console.log('  exit               - quit');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

rl.prompt();

rl.on('line', async (line) => {
  const input = line.trim();
  if (!input) {
    rl.prompt();
    return;
  }

  const parts = input.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  try {
    switch (cmd) {
      case 'start': {
        const sessionId = parts[1];
        if (!sessionId) {
          console.log('Usage: start <sessionId>');
          break;
        }
        try {
          const result = await emulatorManager.startSession(CHARGER_ID, sessionId);
          if (result.ok) {
            console.log(`Started session ${sessionId}`);
          } else {
            console.log(`Failed to start session: ${result.error}`);
          }
        } catch (e) {
          console.error('Error starting session:', e);
        }
        break;
      }
      case 'stop': {
        const ok = emulatorManager.stopSession(CHARGER_ID);
        console.log(ok ? 'Stopped session' : 'Failed to stop session');
        break;
      }
      case 'fault': {
        const type = parts[1] ?? 'UNKNOWN';
        const ok = emulatorManager.injectFault(CHARGER_ID, type);
        console.log(ok ? `Injected fault ${type}` : 'Failed to inject fault');
        break;
      }
      case 'status': {
        const c = emulatorManager.getCharger(CHARGER_ID);
        if (!c) {
          console.log('Charger not found');
        } else {
          console.log(`id: ${c.id}`);
          console.log(`status: ${c.status}`);
          console.log(`currentSessionId: ${c.currentSessionId}`);
          console.log(`meterKWh: ${c.meterKWh}`);
        }
        break;
      }
      case 'list': {
        const list = emulatorManager.listChargers();
        console.log('Chargers:', list);
        break;
      }
      case 'stopall': {
        emulatorManager.stopAll();
        console.log('stopAll executed');
        break;
      }
      case 'stopalltelemetry': {
        emulatorManager.stopAllTelemetry();
        console.log('stopAllTelemetry executed');
        break;
      }
      case 'exit': {
        const c = emulatorManager.getCharger(CHARGER_ID);
        if (c) {
          c.stopTelemetry();
        }
        console.log('Exiting...');
        rl.close();
        process.exit(0);
        break;
      }
      default:
        console.log(`Unknown command: ${cmd}`);
    }
  } catch (err) {
    console.error('Error handling command:', err);
  }

  rl.prompt();
}).on('close', () => {
  console.log('CLI closed');
});
