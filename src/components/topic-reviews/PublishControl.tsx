"use client";

import { useFormState, useFormStatus } from "react-dom";
import { setReviewStatus, type ReviewStatusState } from "@/lib/topic-reviews/actions";
import { Badge } from "@/components/ui/Badge";

function Submit({ publish }: { publish: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        publish
          ? "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover disabled:opacity-60"
          : "rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-muted disabled:opacity-60"
      }
    >
      {pending ? "Saving…" : publish ? "Publish for students" : "Unpublish"}
    </button>
  );
}

/** Staff only: a review's status and the button that flips it. */
export function PublishControl({ slug, status }: { slug: string; status: "draft" | "published" }) {
  const [state, action] = useFormState<ReviewStatusState, FormData>(setReviewStatus, null);
  const publish = status === "draft";
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={publish ? "amber" : "green"} dot>
          {publish ? "Draft — students can't see this" : "Published"}
        </Badge>
        <form action={action} className="ml-auto">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="status" value={publish ? "published" : "draft"} />
          <Submit publish={publish} />
        </form>
      </div>
      {publish ? (
        <p className="mt-2 text-xs text-amber-900">
          Imported from Jade&apos;s slide deck. Read it through before publishing; once published it appears for students
          and questions on this topic link here.
        </p>
      ) : null}
      {state && "error" in state ? <p role="alert" className="mt-2 text-xs text-red-700">{state.error}</p> : null}
      {state && "ok" in state ? <p className="mt-2 text-xs text-green-700">{state.ok}</p> : null}
    </div>
  );
}
