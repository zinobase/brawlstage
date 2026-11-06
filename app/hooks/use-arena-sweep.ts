import {
  actionErrorMessage,
  useActionMutation,
} from "@agent-native/core/client/hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { type Finding, ALL_WIDTHS } from "@shared/arena-protocol";
import {
  type StageDocument,
  buildSrcDoc,
  sweepWidths,
  widthFails,
} from "@/lib/dom-audit";

export type LaneState = "idle" | "measuring" | "pass" | "fail";

export type StageInput = StageDocument & { stateHash: string };

export type SweepOutcome = {
  stateHash: string;
  findings: Finding[];
  durationMs: number;
  recorded: boolean;
};

// Owns the hidden probe iframe and the 33-lane sweep. A sweep runs
// automatically whenever the stage state hash has no current measurement, so
// agent patches are re-measured without anyone pressing a button.
export const useArenaSweep = (
  componentId: string,
  stage: StageInput | undefined,
  measuredHash: string | null,
) => {
  const probeRef = useRef<HTMLIFrameElement | null>(null);
  const [lanes, setLanes] = useState<Record<number, LaneState>>({});
  const [running, setRunning] = useState(false);
  const [liveFindings, setLiveFindings] = useState<Finding[]>([]);
  const [lastDuration, setLastDuration] = useState<number | null>(null);
  const inFlight = useRef<string | null>(null);
  const cancel = useRef({ cancelled: false });

  const attempted = useRef(new Set<string>());

  const record = useActionMutation("record-viewport-audit", {
    onError: (error) => {
      toast.error(actionErrorMessage(error) ?? "Could not record the sweep.");
    },
  });
  const recordRef = useRef(record.mutateAsync);
  recordRef.current = record.mutateAsync;

  const sweep = useCallback(
    async (input: StageInput): Promise<SweepOutcome | null> => {
      const probe = probeRef.current;
      if (!probe || inFlight.current === input.stateHash) return null;
      cancel.current.cancelled = true;
      const token = { cancelled: false };
      cancel.current = token;
      inFlight.current = input.stateHash;
      setRunning(true);
      setLiveFindings([]);
      setLanes(Object.fromEntries(ALL_WIDTHS.map((w) => [w, "measuring" as LaneState])));
      try {
        const result = await sweepWidths(
          probe,
          buildSrcDoc(input),
          [...ALL_WIDTHS],
          (width, found) => {
            setLanes((prev) => ({ ...prev, [width]: widthFails(found) ? "fail" : "pass" }));
            setLiveFindings((prev) => [...prev, ...found]);
          },
          token,
        );
        if (token.cancelled) return null;
        setLastDuration(result.durationMs);
        let recorded = false;
        try {
          await recordRef.current({
            id: componentId,
            mode: "full_33",
            stateHash: input.stateHash,
            widths: result.widths,
            findings: result.findings,
          });
          recorded = true;
        } catch {
          recorded = false;
        }
        return { stateHash: input.stateHash, findings: result.findings, durationMs: result.durationMs, recorded };
      } finally {
        if (inFlight.current === input.stateHash) inFlight.current = null;
        if (!token.cancelled) setRunning(false);
      }
    },
    [componentId],
  );

  useEffect(() => {
    if (!stage || stage.stateHash === measuredHash) return;
    if (attempted.current.has(stage.stateHash)) return;
    attempted.current.add(stage.stateHash);
    void sweep(stage);
  }, [stage, measuredHash, sweep]);

  useEffect(
    () => () => {
      cancel.current.cancelled = true;
    },
    [],
  );

  return { probeRef, lanes, running, liveFindings, lastDuration, sweep };
};
