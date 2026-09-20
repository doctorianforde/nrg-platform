import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { capitalize } from "@/lib/format";

export type QuestionMeta = {
  cognitive_level?: string | null;
  difficulty?: string | null;
  question_type?: string;
  domainName?: string | null;
  topicName?: string | null;
};

const LEVEL_TONE: Record<string, BadgeTone> = {
  knowledge: "gray",
  comprehension: "blue",
  application: "purple",
  analysis: "amber",
};
const DIFFICULTY_TONE: Record<string, BadgeTone> = {
  easy: "green",
  medium: "amber",
  hard: "red",
};

export function QuestionMetaBadges({ meta }: { meta: QuestionMeta }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {meta.domainName ? <Badge tone="purple">{meta.domainName}</Badge> : null}
      {meta.topicName ? <Badge tone="gray">{meta.topicName}</Badge> : null}
      {meta.cognitive_level ? (
        <Badge tone={LEVEL_TONE[meta.cognitive_level] ?? "gray"}>
          {capitalize(meta.cognitive_level)}
        </Badge>
      ) : null}
      {meta.difficulty ? (
        <Badge tone={DIFFICULTY_TONE[meta.difficulty] ?? "gray"}>{capitalize(meta.difficulty)}</Badge>
      ) : null}
      {meta.question_type === "sata" ? <Badge tone="blue">Select all that apply</Badge> : null}
    </div>
  );
}
