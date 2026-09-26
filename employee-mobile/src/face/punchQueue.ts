import AsyncStorage from '@react-native-async-storage/async-storage';
import { markKioskPunch } from '../api/kiosk';

const QUEUE_KEY = 'punchpay_kiosk_punch_queue';

type QueuedPunch = {
  id: string;
  employeeId: number;
  savedAt: number;
};

async function readQueue(): Promise<QueuedPunch[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as QueuedPunch[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedPunch[]) {
  if (items.length === 0) {
    await AsyncStorage.removeItem(QUEUE_KEY);
    return;
  }
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

function offlineError(err: unknown) {
  return !(err as { status?: number }).status;
}

export async function markKioskPunchOrQueue(employeeId: number) {
  try {
    const data = await markKioskPunch(employeeId);
    return { data, queued: false as const };
  } catch (err) {
    if (!offlineError(err)) throw err;
    const items = await readQueue();
    items.push({
      id: `${Date.now()}-${employeeId}`,
      employeeId,
      savedAt: Date.now(),
    });
    await writeQueue(items);
    return { data: null, queued: true as const };
  }
}

export async function flushPunchQueue() {
  const items = await readQueue();
  if (items.length === 0) return;
  const pending: QueuedPunch[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    try {
      await markKioskPunch(item.employeeId);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'DUPLICATE_PUNCH') continue;
      if (offlineError(err)) {
        pending.push(...items.slice(index));
        break;
      }
    }
  }
  await writeQueue(pending);
}
