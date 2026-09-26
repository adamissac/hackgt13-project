import { Redirect } from 'expo-router';
// Preserve old AI links while opening the shared assistant sheet.
export default function LegacyAiRoute() { return <Redirect href="/assistant" />; }
