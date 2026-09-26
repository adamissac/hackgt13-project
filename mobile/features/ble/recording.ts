// AK6 labeled Bluetooth recordings (MASTER_SPEC 6.8). Each recording is one phone's raw view of
// one situation, exported as JSON for Alan's encounter classifier (AL8). The phone's local name
// is included so the two sides of a pair can be joined.
import * as Device from 'expo-device';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export const RECORDING_LABELS = [
  { key: 'talking', title: 'Talking face to face', conversation: true },
  { key: 'in_line', title: 'Standing in line', conversation: false },
  { key: 'walking_past', title: 'Walking past', conversation: false },
  { key: 'across_room', title: 'Across the room', conversation: false },
  { key: 'same_table_laptops', title: 'Same table, on laptops', conversation: false },
] as const;

export type RecordingLabel = (typeof RECORDING_LABELS)[number]['key'];

export interface RawSighting {
  peer: string; // advertised local name (ble-plx device.id differs per observer, so it's not joinable)
  ts: number; // epoch ms
  rssi: number;
  app_state: string; // 'active' | 'background' | 'inactive'
}

export interface Recording {
  version: 1;
  label: RecordingLabel;
  conversation: boolean;
  distance_note: string;
  self_name: string;
  device_model: string | null;
  platform: string;
  os_version: string | null;
  started_at: string;
  ended_at: string;
  sightings: RawSighting[];
}

export function buildRecording(args: {
  label: RecordingLabel;
  distanceNote: string;
  selfName: string;
  startedAt: number;
  endedAt: number;
  sightings: RawSighting[];
}): Recording {
  const meta = RECORDING_LABELS.find((l) => l.key === args.label)!;
  return {
    version: 1,
    label: args.label,
    conversation: meta.conversation,
    distance_note: args.distanceNote,
    self_name: args.selfName,
    device_model: Device.modelName,
    platform: Platform.OS,
    os_version: Device.osVersion,
    started_at: new Date(args.startedAt).toISOString(),
    ended_at: new Date(args.endedAt).toISOString(),
    sightings: args.sightings,
  };
}

/** Writes the recording to the cache dir and opens the share sheet (AirDrop, Drive, Slack). */
export async function shareRecording(rec: Recording): Promise<void> {
  const stamp = rec.started_at.replace(/[:.]/g, '-');
  const file = new File(Paths.cache, `ak6_${rec.label}_${rec.self_name}_${stamp}.json`);
  file.create({ overwrite: true });
  file.write(JSON.stringify(rec));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Send recording to Alan' });
}
