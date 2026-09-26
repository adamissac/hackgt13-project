import GraphView from "@/components/GraphView";

export const metadata = { title: "Connection Graph · Formal Connection" };

export default function GraphPage() {
  return <GraphView eventId={1} initialMode="matches" />;
}
