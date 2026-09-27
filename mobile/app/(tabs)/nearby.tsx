import { Redirect } from 'expo-router';

// Nearby now lives on Home (features/nearby/NearbySection). Old links and notifications still land here.
export default function NearbyRedirect() {
  return <Redirect href="/" />;
}
