import * as Clipboard from "expo-clipboard";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { ErrorState, Loading } from "@/components/States";
import {
  AiBadge,
  Avatar,
  Button,
  Card,
  Chip,
  firstName,
  SectionTitle,
  useColors,
} from "@/components/ui";
import { useOpenToMeet } from "@/features/presence/openToMeet";
import { StageTracker } from "@/features/relationship/StageTracker";
import { stageLabel, type Relationship } from "@/features/relationship/stage";
import { api, type Facet, type QuickProfile } from "@/lib/api";
import { emitChange } from "@/lib/changes";
import { HACKGT_EVENT_ID } from "@/lib/constants";
import { env } from "@/lib/env";
import { useAsync } from "@/lib/useAsync";

const FACETS: { key: Facet; label: string }[] = [
  { key: "technical", label: "Technical" },
  { key: "career", label: "Career" },
  { key: "academic", label: "Academic" },
  { key: "personal", label: "Personal" },
];
const BAND = {
  immediate: "Very close",
  near: "Nearby",
  far: "Farther away",
} as const;

// "Why should I talk to this person?" Quick profile (api.md 15), AI starters (api.md 7), and the
// relationship stage with the one action that moves it forward. Only shared topics are shown.
export default function MatchScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useAsync(() => api.quickProfile(id), [id], ["relationships"]);
  const rel = useAsync(
    () => api.relationship(id),
    [id],
    ["relationships", "chats"],
  );
  const band = useAsync(
    () =>
      api
        .matches(HACKGT_EVENT_ID)
        .then(
          (r) => r.matches.find((m) => m.user_id === id)?.proximity ?? null,
        ),
    [id],
    ["profile"],
  );
  // While I'm waiting on their answer, check again every few seconds (demo attendees answer in seconds).
  const stage = rel.state.status === "ready" ? rel.state.data.stage : null;
  useEffect(() => {
    if (stage !== "MEET_INTEREST_PENDING") return;
    const t = setInterval(() => emitChange("relationships"), 4000);
    return () => clearInterval(t);
  }, [stage]);

  if (profile.state.status === "loading")
    return <Loading label="Loading profile…" />;
  if (profile.state.status === "error")
    return (
      <ErrorState message={profile.state.message} onRetry={profile.reload} />
    );
  const p = profile.state.data;
  const proximity = band.state.status === "ready" ? band.state.data : null;

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.container}
    >
      <Stack.Screen options={{ title: firstName(p.name, "Profile") }} />

      <View style={styles.header}>
        <Avatar name={p.name} size={80} />
        <Text style={[styles.name, { color: c.text }]}>{p.name}</Text>
        <Text style={[styles.body, { color: c.muted, textAlign: "center" }]}>
          {p.headline || (p.role === "recruiter" ? "Recruiter" : "Student")}
        </Text>
        <View style={styles.chips}>
          <Chip label={`Match score: ${Math.round(p.score * 100)}`} tone="tint" />
          {proximity && <Chip label={BAND[proximity]} tone="success" />}
          {p.role === "recruiter" && <Chip label="Recruiter" />}
        </View>
      </View>

      {rel.state.status === "ready" && (
        <Actions
          rel={rel.state.data}
          name={p.name}
          demoAttendee={!!p.demo_attendee}
        />
      )}

      <Icebreakers userId={id} name={p.name} />
      <ScoreExplanation p={p} />

      <SectionTitle>What you have in common</SectionTitle>
      <Card>
        {p.shared_topics.length === 0 ? (
          <Text style={[styles.body, { color: c.muted }]}>
            No shared topics yet.
          </Text>
        ) : (
          p.shared_topics.map((t) => (
            <View key={t.interest_id} style={styles.topic}>
              <View style={styles.barHead}>
                <Text style={[styles.topicName, { color: c.text }]}>
                  {t.name}
                </Text>
                <Text style={[styles.pct, { color: c.muted }]}>
                  {Math.round(t.strength * 100)}%
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: c.surfaceAlt }]}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${Math.round(t.strength * 100)}%`,
                      backgroundColor: c.ai,
                    },
                  ]}
                />
              </View>
              {!!t.evidence && (
                <Text style={[styles.small, { color: c.muted }]}>
                  {t.evidence}
                </Text>
              )}
            </View>
          ))
        )}
      </Card>

      <SectionTitle>Overlap by area</SectionTitle>
      <OverlapBars p={p} />

      {(!!p.seeking || !!p.offering) && (
        <Card>
          {!!p.seeking && (
            <Text style={[styles.body, { color: c.text }]}>
              <Text style={{ fontWeight: "700" }}>Looking for: </Text>
              {p.seeking}
            </Text>
          )}
          {!!p.offering && (
            <Text style={[styles.body, { color: c.text }]}>
              <Text style={{ fontWeight: "700" }}>Can offer: </Text>
              {p.offering}
            </Text>
          )}
        </Card>
      )}
    </ScrollView>
  );
}

function Actions({
  rel,
  name,
  demoAttendee,
}: {
  rel: Relationship;
  name: string;
  demoAttendee: boolean;
}) {
  const c = useColors();
  const presence = useOpenToMeet();
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = firstName(name);

  const respond = async (response: "yes" | "no") => {
    if (!rel.suggestion_id || busy) return;
    setBusy(response);
    setError(null);
    try {
      await api.respondToSuggestion(rel.suggestion_id, response);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const openChat = () =>
    rel.chat_id !== null &&
    router.push({
      pathname: "/chat/[id]",
      params: { id: String(rel.chat_id), name, other: rel.user_id },
    });

  let body: React.ReactNode = null;
  switch (rel.stage) {
    case "DISCOVERED":
    case "DECLINED":
      body = !presence.on ? (
        <Button
          label="Turn on Open to Meet"
          onPress={() => presence.toggle(true)}
          loading={presence.status === "saving"}
        />
      ) : rel.suggestion_id ? (
        <View style={styles.buttons}>
          <Button
            label="Not now"
            variant="secondary"
            onPress={() => respond("no")}
            disabled={!!busy}
            style={{ flex: 1 }}
          />
          <Button
            label="Want to meet"
            onPress={() => respond("yes")}
            loading={busy === "yes"}
            style={{ flex: 1.3 }}
          />
        </View>
      ) : demoAttendee ? (
        // Demo attendees can't be "around"; asking now keeps the synthetic loop usable.
        <Button
          label="Want to meet"
          onPress={async () => {
            setBusy("yes");
            setError(null);
            try {
              await api.demoMeet(rel.user_id);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(null);
            }
          }}
          loading={busy === "yes"}
        />
      ) : (
        <Text style={[styles.small, { color: c.muted }]}>
          When you’re both around and open to meet, we’ll ask you both. Nobody
          sees a “no”.
        </Text>
      );
      break;
    case "MUTUAL_MEET":
    case "MEETUP_IN_PROGRESS":
      body = (
        <>
          <View style={styles.buttons}>
            <Button
              label="Message"
              variant="secondary"
              onPress={openChat}
              style={{ flex: 1 }}
            />
            <Button
              label={
                rel.stage === "MEETUP_IN_PROGRESS"
                  ? "Keep finding"
                  : `Find ${first}`
              }
              onPress={() =>
                rel.suggestion_id &&
                router.push({
                  pathname: "/meetup/[id]",
                  params: { id: String(rel.suggestion_id) },
                })
              }
              style={{ flex: 1 }}
            />
          </View>
          {(demoAttendee || env.useMocks) && (
            <Button
              label="Simulate meeting (demo attendee)"
              variant="ghost"
              loading={simulating}
              onPress={async () => {
                setSimulating(true);
                try {
                  const conv = await api.simulateConversation(rel.user_id);
                  router.push({
                    pathname: "/checklist/[id]",
                    params: { id: String(conv.conversation_id) },
                  });
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setSimulating(false);
                }
              }}
            />
          )}
        </>
      );
      break;
    case "CONVERSATION_VERIFIED":
    case "POST_CONVERSATION_PENDING":
      body = (
        <Button
          label="How did it go?"
          onPress={() =>
            rel.conversation_id &&
            router.push({
              pathname: "/checklist/[id]",
              params: { id: String(rel.conversation_id) },
            })
          }
        />
      );
      break;
    case "CONNECTED":
      body =
        rel.chat_id !== null ? (
          <Button label="Message" variant="secondary" onPress={openChat} />
        ) : null;
      break;
    default:
      body = null;
  }

  return (
    <Card highlight={rel.stage !== "DISCOVERED" && rel.stage !== "DECLINED"}>
      <StageTracker stage={rel.stage} />
      <Text style={[styles.status, { color: c.text }]}>
        {stageLabel(rel.stage, first)}
      </Text>
      {body}
      {error && (
        <Text style={[styles.small, { color: c.danger }]}>{error}</Text>
      )}
    </Card>
  );
}

function Icebreakers({ userId, name }: { userId: string; name: string }) {
  const c = useColors();
  const [variant, setVariant] = useState(0);
  const [copied, setCopied] = useState(false);
  const starters = useAsync(() => api.starters(userId), [userId]);
  const first = firstName(name);
  const openers =
    starters.state.status === "ready" ? starters.state.data.openers : [];
  const opener = openers.length ? openers[variant % openers.length] : null;

  const copy = async () => {
    if (!opener) return;
    await Clipboard.setStringAsync(opener);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card>
      <AiBadge label="Why you should talk" />
      {starters.state.status === "loading" && (
        <Text style={[styles.body, { color: c.muted }]}>Thinking…</Text>
      )}
      {starters.state.status === "error" && (
        <ErrorState
          message="Couldn’t load conversation ideas right now."
          onRetry={starters.reload}
        />
      )}
      {starters.state.status === "ready" && (
        <>
          <Text style={[styles.why, { color: c.text }]}>
            {starters.state.data.why}
          </Text>
          {opener && (
            <View style={[styles.opener, { backgroundColor: c.aiSoft }]}>
              <Text style={[styles.small, { color: c.ai, fontWeight: "800" }]}>
                ICEBREAKER
              </Text>
              <Text style={[styles.body, { color: c.text }]}>{opener}</Text>
            </View>
          )}
          <View style={styles.buttons}>
            <Button
              label={copied ? "Copied" : "Copy"}
              variant="secondary"
              onPress={copy}
              style={{ flex: 1 }}
            />
            <Button
              label="Another"
              variant="secondary"
              onPress={() => setVariant((v) => v + 1)}
              disabled={openers.length < 2}
              style={{ flex: 1 }}
            />
            <Button
              label="Ask AI"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: "/assistant",
                  params: { q: `What should I ask ${first}?` },
                })
              }
              style={{ flex: 1 }}
            />
          </View>
        </>
      )}
    </Card>
  );
}

function ScoreExplanation({ p }: { p: QuickProfile }) {
  const c = useColors();
  const e = p.explanation;
  return (
    <Card>
      <Text style={[styles.why, { color: c.text }]}>How this score works</Text>
      <Text style={[styles.body, { color: c.muted }]}>
        This is a ranking signal, not a probability of friendship or mutual interest.
        {e?.basis === 'v1_proxy' ? ' These factors are an approximate rules-based explanation, not a breakdown of the learned score.'
          : e?.basis === 'lr' ? ' Factors describe contributions to the model’s log-odds, not percentage points.'
            : ' This profile score uses weighted matching rules; AI-generated wording does not set the score.'}
      </Text>
      {e ? <>
        <Text style={[styles.body, { color: c.text }]}>{e.summary}</Text>
        {(e.all_factors ?? e.factors).map((f) => (
          <Text key={f.name} style={[styles.small, { color: c.muted }]}>
            {f.label}: {f.contribution >= 0 ? '+' : ''}{(f.contribution * (e.basis === 'lr' ? 1 : 100)).toFixed(1)} {e.basis === 'lr' ? 'log-odds' : 'points'}
          </Text>
        ))}
      </> : <Text style={[styles.small, { color: c.muted }]}>Detailed score factors are not available for this profile yet.</Text>}
    </Card>
  );
}

function OverlapBars({ p }: { p: QuickProfile }) {
  const c = useColors();
  return (
    <Card>
      {FACETS.map((f) => {
        const v = Math.max(0, Math.min(1, p.facet_overlap[f.key] ?? 0));
        return (
          <View key={f.key} style={styles.facetRow}>
            <Text style={[styles.facetLabel, { color: c.text }]}>
              {f.label}
            </Text>
            <View
              style={[styles.track, { flex: 1, backgroundColor: c.surfaceAlt }]}
            >
              <View
                style={[
                  styles.fill,
                  { width: `${Math.round(v * 100)}%`, backgroundColor: c.tint },
                ]}
              />
            </View>
            <Text
              style={[
                styles.pct,
                { color: c.muted, width: 40, textAlign: "right" },
              ]}
            >
              {Math.round(v * 100)}%
            </Text>
          </View>
        );
      })}
      <Text style={[styles.small, { color: c.muted }]}>
        How similar your interests are in each area.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 16,
    paddingBottom: 48,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  header: { alignItems: "center", gap: 8, paddingVertical: 8 },
  name: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  status: { fontSize: 16, fontWeight: "600", lineHeight: 22 },
  why: { fontSize: 17, lineHeight: 24, fontWeight: "600" },
  opener: { borderRadius: 14, padding: 14, gap: 6 },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  buttons: { flexDirection: "row", gap: 8 },
  topic: { gap: 6 },
  barHead: { flexDirection: "row", justifyContent: "space-between" },
  topicName: { fontSize: 16, fontWeight: "700", flex: 1 },
  pct: { fontSize: 13, fontWeight: "700" },
  facetRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  facetLabel: { width: 82, fontSize: 15, fontWeight: "600" },
  track: { height: 10, borderRadius: 5, overflow: "hidden" },
  fill: { height: 10, borderRadius: 5 },
});
