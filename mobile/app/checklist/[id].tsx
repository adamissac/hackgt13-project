import { Stack, useLocalSearchParams } from 'expo-router';

import { ErrorState, Loading } from '@/components/States';
import { ChecklistForm } from '@/features/checklist/ChecklistForm';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';

export default function ChecklistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Number(id);
  const { state, reload } = useAsync(() => api.pendingConversations(), []);
  const item =
    state.status === 'ready' ? state.data.conversations.find((row) => row.conversation_id === conversationId) : undefined;

  return (
    <>
      <Stack.Screen options={{ title: item ? item.other.name : 'Checklist' }} />
      {state.status === 'loading' && <Loading label="Loading the checklist…" />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={reload} />}
      {state.status === 'ready' && !item && <ErrorState message="This checklist isn’t available." />}
      {item && <ChecklistForm conversationId={item.conversation_id} name={item.other.name} checklist={item.checklist} />}
    </>
  );
}
