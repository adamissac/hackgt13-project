import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class EventModeModule extends NativeModule<Record<string, never>> {
  start(title: string, body: string): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  lastError(): string | null;
}

// Android dev builds only. Null on iOS (no foreground services), on web, and in Expo Go.
export default requireOptionalNativeModule<EventModeModule>('EventMode');
