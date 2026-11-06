import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { AgentToggleButton } from "@agent-native/toolkit/app/chat";
import { IconArrowRight, IconBook2, IconDevices, IconLock, IconPlus, IconTrash } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ResetDemoButton } from "@/components/ResetDemoButton";
import { cn } from "@/lib/utils";

type ListData = AgentNativeActionRegistry["list-components"]["result"];

const LIST_KEY = ["action", "list-components", {}];

// The fight card is an airy light page in both themes: navy ink on a pale blue-white ground.
const AIR = "#F7FAFF";
const NAVY = "#0A1530";

type Lane = { width: number; pass: boolean; holdout: boolean };

// The latest run's 33 verdicts as a miniature of the stage ribbon.
const MicroRibbon = ({ lanes }: { lanes: Lane[] | null }) => (
  <div className="flex h-5 w-[136px] items-end gap-px" aria-label={lanes ? `${lanes.filter((l) => l.pass).length} of ${lanes.length} widths pass` : "Not measured"}>
    {(lanes ?? Array.from({ length: 33 }, (_, i) => ({ width: i, pass: false, holdout: false }))).map((l, i) => (
      <span
        key={`${l.width}-${i}`}
        className={cn(
          "relative flex-1 rounded-[0.5px]",
          !lanes ? "bg-[#E4E9F2]" : l.pass ? "bg-[#2F9E6E]" : "bg-[#E5484D]",
        )}
        style={{ height: `${30 + (i / 32) * 70}%` }}
      >
        {lanes && l.holdout ? <span className="bs-hatch absolute inset-0" /> : null}
      </span>
    ))}
  </div>
);

export const FightCard = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isPending } = useActionQuery("list-components", {});
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [name, setName] = useState("");
  const [html, setHtml] = useState("");
  const [css, setCss] = useState("");

  const create = useActionMutation("save-component", {
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: LIST_KEY });
      const previous = queryClient.getQueryData(LIST_KEY);
      queryClient.setQueryData(LIST_KEY, (old: ListData | undefined) =>
        old && {
          components: [
            {
              id: `pending-${Date.now()}`,
              name: input.name,
              slug: "",
              lastPassRate: null,
              holdoutPassRate: null,
              saboteurProfile: "none",
              revision: 1,
              hasAgentDraft: false,
              hasHumanEdit: false,
              updatedAt: new Date().toISOString(),
              lanes: null,
            },
            ...old.components,
          ],
        },
      );
      setCreating(false);
      return { previous };
    },
    onError: (err, _input, context) => {
      queryClient.setQueryData(LIST_KEY, (context as { previous?: unknown } | undefined)?.previous);
      setCreating(true);
      toast.error(actionErrorMessage(err) ?? "Could not add the component.");
    },
    onSuccess: (result) => {
      setName("");
      setHtml("");
      setCss("");
      navigate(`/arena/${result.id}`);
    },
  });

  const remove = useActionMutation("delete-component", {
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: LIST_KEY });
      const previous = queryClient.getQueryData(LIST_KEY);
      queryClient.setQueryData(LIST_KEY, (old: ListData | undefined) =>
        old && { components: old.components.filter((c) => c.id !== id) },
      );
      setPendingDelete(null);
      return { previous };
    },
    onError: (err, _input, context) => {
      queryClient.setQueryData(LIST_KEY, (context as { previous?: unknown } | undefined)?.previous);
      toast.error(actionErrorMessage(err) ?? "Could not delete the component.");
    },
  });

  // The hero and the "Try it" steps walk through the pricing header, so feature it when it exists.
  const ready = data?.components.filter((c) => !c.id.startsWith("pending-")) ?? [];
  const first = ready.find((c) => c.slug === "pricing-header") ?? ready[0];

  return (
    <main className="bs-airy min-h-full pb-24" style={{ backgroundColor: AIR, color: NAVY }}>
      {/* Floating pill nav. */}
      <div className="sticky top-0 z-20 px-4 pt-4">
        <nav aria-label="BrawlStage" className="@container mx-auto flex max-w-6xl items-center gap-2 whitespace-nowrap rounded-full bg-white/90 py-2 pl-5 pr-2 shadow-[0_10px_30px_-14px_rgba(10,21,48,0.35)] backdrop-blur">
          <Link to="/arena" className="text-[19px] font-black tracking-tight">
            Brawl<span className="bs-gradient-text">Stage</span>
          </Link>
          <div className="ml-6 hidden items-center gap-1 text-[14px] font-medium text-[#333338] @[560px]:flex">
            <a href="#components" className="rounded-full px-3 py-1.5 hover:bg-[#0A1530]/5">Fight card</a>
            <Link to="/chat" className="rounded-full px-3 py-1.5 hover:bg-[#0A1530]/5">Chat</Link>
            <ResetDemoButton className="rounded-full px-3 py-1.5 hover:bg-[#0A1530]/5" />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              aria-label="Add component"
              onClick={() => setCreating(true)}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold text-white"
              style={{ backgroundColor: NAVY }}
            >
              <IconPlus className="size-4" /> <span className="hidden @[420px]:inline">Add component</span>
            </button>
            <span className="text-[#0A1530] [&_button]:text-[#0A1530]">
              <AgentToggleButton />
            </span>
          </div>
        </nav>
      </div>

      {/* Hero: heavy headline with a gradient phrase, the product window over tilted colour cards. */}
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-20 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wide text-[#2F9E6E]">Responsive QA arena</p>
          <h1 className="mt-3 text-[44px] font-black leading-[1.05] tracking-[-0.02em] sm:text-[52px]">
            See every width,
            <br />
            <span className="bs-gradient-text">before it ships.</span>
          </h1>
          <p className="mt-5 max-w-lg text-[18px] leading-relaxed text-[#333338]">
            A real DOM engine measures each component at 28 public widths and 5 sealed ones. The agent fixes the layout; your hand edits teach it the rules.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {first ? (
              <Link
                to={`/arena/${first.id}`}
                className="inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold text-white"
                style={{ backgroundColor: NAVY }}
              >
                Open {first.name} <IconArrowRight className="size-4" />
              </Link>
            ) : null}
            <a href="#components" className="inline-flex h-12 items-center rounded-full border-2 px-6 text-[15px] font-semibold" style={{ borderColor: NAVY }}>
              All components
            </a>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-[520px]">
          <div aria-hidden="true" className="absolute inset-0 -rotate-6 rounded-3xl bg-[#F472B6]" />
          <div aria-hidden="true" className="absolute inset-0 rotate-3 rounded-3xl bg-[#8B5CF6]" />
          <div className="relative rounded-3xl bg-white p-6 shadow-[0_30px_60px_-30px_rgba(10,21,48,0.45)]">
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#FF5F57]" />
              <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
              <span className="size-2.5 rounded-full bg-[#28C840]" />
              <span className="ml-3 truncate text-[13px] font-semibold">{first?.name ?? "Your component"}</span>
            </div>
            <div className="mt-6 flex h-28 items-end gap-[3px]">
              {(first?.lanes ?? Array.from({ length: 33 }, (_, i) => ({ width: i, pass: i > 16, holdout: i % 7 === 3 }))).map((l, i) => (
                <span
                  key={`${l.width}-${i}`}
                  className={cn("relative flex-1 rounded-t-[2px]", !first?.lanes ? "bg-[#E4E9F2]" : l.pass ? "bg-[#2F9E6E]" : "bg-[#E5484D]")}
                  style={{ height: `${28 + (i / 32) * 72}%` }}
                >
                  {first?.lanes && l.holdout ? <span className="bs-hatch absolute inset-0" /> : null}
                </span>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[12px] text-[#6B7280]">
              <span>320px</span>
              <span>1920px</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#F3F6FB] p-4">
                <p className="text-[13px] text-[#6B7280]">Public widths</p>
                <p className="text-[32px] font-black leading-none">{first?.lastPassRate === null || !first ? "—" : `${Math.round(first.lastPassRate)}%`}</p>
              </div>
              <div className="rounded-2xl bg-[#F3F6FB] p-4">
                <p className="flex items-center gap-1 text-[13px] text-[#6B7280]"><IconLock className="size-3.5" /> Sealed widths</p>
                <p className="text-[32px] font-black leading-none">{first?.holdoutPassRate === null || !first ? "—" : `${Math.round(first.holdoutPassRate)}%`}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Three promises, each behind a chunky icon. */}
      <section className="mx-auto mt-24 grid max-w-6xl gap-10 px-6 text-center sm:grid-cols-3">
        {[
          { Icon: IconDevices, title: "See every width", body: "28 public widths from 320 to 1920, measured by the browser's own layout engine." },
          { Icon: IconLock, title: "Pass the sealed ones", body: "5 holdout widths the agent never sees. Overfit to the public ones and the gate knocks it down." },
          { Icon: IconBook2, title: "Teach it once", body: "Your fixes to the agent's CSS become layout rules it reads before the next patch." },
        ].map(({ Icon, title, body }) => (
          <div key={title}>
            <span className="mx-auto grid size-14 place-items-center rounded-2xl text-white" style={{ backgroundColor: NAVY }}>
              <Icon className="size-7" />
            </span>
            <h2 className="mt-4 text-[22px] font-black leading-tight">{title}</h2>
            <p className="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-[#333338]">{body}</p>
          </div>
        ))}
      </section>

      {/* The two-minute tour: three steps, each one a click away. */}
      {first ? (
        <section aria-labelledby="tour" className="mx-auto mt-24 max-w-6xl px-6">
          <div className="rounded-[28px] p-8 text-white sm:p-12" style={{ backgroundColor: NAVY }}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="tour" className="text-3xl font-black tracking-tight sm:text-[40px]">
                Try it in <span className="bs-gradient-text">two minutes</span>
              </h2>
              <p className="text-[15px] text-white/60">No setup: the components are already broken.</p>
            </div>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                { n: 1, title: "Open the pricing header", body: "33 widths measured in a quarter of a second: half the public widths fail, and most sealed ones." },
                { n: 2, title: "Press Send to agent", body: "It patches the CSS, the stage re-measures, and the holdout gate checks the 5 widths it never sees." },
                { n: 3, title: "Fix what it missed", body: "Hand-edit in Surgery, then bank your edit as a rule the agent reads before its next patch." },
              ].map((step) => (
                <li key={step.n}>
                  <Link
                    to={`/arena/${first.id}`}
                    className="group flex h-full flex-col rounded-2xl bg-white/[0.06] p-6 transition-colors hover:bg-white/[0.1]"
                  >
                    <span className="grid size-9 place-items-center rounded-full text-[15px] font-black text-white" style={{ backgroundImage: "linear-gradient(135deg, #22B573 0%, #2F7FF2 100%)" }}>
                      {step.n}
                    </span>
                    <span className="mt-5 text-[18px] font-bold">{step.title}</span>
                    <span className="mt-2 text-[15px] leading-relaxed text-white/65">{step.body}</span>
                    {step.n === 1 ? (
                      <span className="mt-5 inline-flex items-center gap-1 text-[15px] font-semibold text-[#7FD7AE]">
                        Start here <IconArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      {/* The fight card itself. */}
      <section id="components" className="mx-auto mt-24 max-w-6xl px-6">
        <h2 className="text-[40px] font-black leading-tight tracking-[-0.02em]">
          On the card <span className="bs-gradient-text">tonight.</span>
        </h2>
        <div className="mt-8 space-y-3">
          {isPending ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl bg-white" />)
          ) : !data?.components.length ? (
            <div className="rounded-2xl bg-white p-12 text-center shadow-[0_10px_30px_-18px_rgba(10,21,48,0.35)]">
              <p className="text-[20px] font-black">No components on the card yet</p>
              <button type="button" onClick={() => setCreating(true)} className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-[14px] font-semibold text-white" style={{ backgroundColor: NAVY }}>
                <IconPlus className="size-4" /> Add the first one
              </button>
            </div>
          ) : (
            data.components.map((c, index) => (
              <div
                key={c.id}
                className="group grid grid-cols-1 items-center gap-x-8 gap-y-3 rounded-2xl bg-white px-6 py-5 shadow-[0_10px_30px_-18px_rgba(10,21,48,0.35)] transition-shadow hover:shadow-[0_16px_40px_-18px_rgba(10,21,48,0.45)] sm:grid-cols-[1fr_auto_auto_auto_auto]"
              >
                <Link to={c.id.startsWith("pending-") ? "#" : `/arena/${c.id}`} className="flex min-w-0 items-center gap-4 outline-none focus-visible:ring-2 focus-visible:ring-[#0A1530]">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#F3F6FB] text-[15px] font-black">{index + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[18px] font-extrabold leading-tight group-hover:underline">{c.name}</span>
                    <span className="text-[13px] text-[#6B7280]">
                      Revision {c.revision}
                      {c.saboteurProfile !== "none" ? ` · saboteur ${c.saboteurProfile}` : ""}
                      {c.hasHumanEdit ? " · hand edit" : ""}
                      {c.lastPassRate === null ? " · open it to run the first sweep" : ""}
                    </span>
                  </span>
                </Link>
                <MicroRibbon lanes={c.lanes} />
                <div className="text-right">
                  <p className="text-[12px] text-[#6B7280]">Public</p>
                  <p className="text-[22px] font-black leading-none">{c.lastPassRate === null ? "—" : `${Math.round(c.lastPassRate)}%`}</p>
                </div>
                <div className="text-right">
                  <p className="flex items-center justify-end gap-1 text-[12px] text-[#6B7280]"><IconLock className="size-3" /> Sealed</p>
                  <p className="text-[22px] font-black leading-none">{c.holdoutPassRate === null ? "—" : `${Math.round(c.holdoutPassRate)}%`}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Delete ${c.name}`}
                  disabled={c.id.startsWith("pending-")}
                  onClick={() => setPendingDelete({ id: c.id, name: c.name })}
                  className="grid size-9 place-items-center rounded-full text-[#6B7280] opacity-60 hover:bg-[#F3F6FB] hover:text-[#0A1530] group-hover:opacity-100"
                >
                  <IconTrash className="size-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-2xl rounded-md">
          <DialogHeader>
            <DialogTitle className="font-display">Add a component</DialogTitle>
            <DialogDescription>Paste real markup and CSS. Scripts never run in the stage.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim() || !html.trim()) return;
              create.mutate({ name: name.trim(), html, css });
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="new-name">Name</Label>
              <Input id="new-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-html">HTML</Label>
              <Textarea id="new-html" value={html} onChange={(e) => setHtml(e.target.value)} className="h-36 font-mono-num text-xs" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-css">CSS</Label>
              <Textarea id="new-css" value={css} onChange={(e) => setCss(e.target.value)} className="h-36 font-mono-num text-xs" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!name.trim() || !html.trim() || create.isPending} className="rounded-md font-display text-xs">
                Step into the ring
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="rounded-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Its viewport runs and learned rules are deleted with it. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-md bg-[hsl(var(--bs-knockdown))] text-white hover:bg-[hsl(var(--bs-knockdown)/0.9)]"
              onClick={() => pendingDelete && remove.mutate({ id: pendingDelete.id })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};
