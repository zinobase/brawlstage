import { actionErrorMessage, useActionMutation } from "@agent-native/core/client/hooks";
import { IconRestore } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ResetDemoButton({ className = "" }: { className?: string }) {
  const [modalVisible, setModalVisible] = useState(false);
  const qc = useQueryClient();

  const mutation = useActionMutation("reseed-arena", {
    onSuccess: async (_out, args) => {
      setModalVisible(false);
      await qc.invalidateQueries();
      if (args?.preserveRules) {
        toast.success("Demo reset. Learned rules kept: ask the agent again to see them applied.");
      } else {
        toast.success("Demo reset: the fight card is back at the start.");
      }
    },
    onError: (err) => {
      toast.error(actionErrorMessage(err) ?? "Reset failed.");
    },
  });

  const triggerReseed = (preserveRules: boolean) => {
    mutation.mutate(preserveRules ? { preserveRules: true } : {});
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setModalVisible(true)}
        disabled={mutation.isPending}
        className={`inline-flex items-center gap-1.5 ${className}`}
      >
        <IconRestore className="size-4" />
        <span>{mutation.isPending ? "Resetting…" : "Reset demo"}</span>
      </button>
      <Dialog open={modalVisible} onOpenChange={setModalVisible}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset the demo?</DialogTitle>
            <DialogDescription>
              This deletes your sweeps, saboteur settings, edits and learned layout rules, and puts the three starting components back on the card. Keep the learned rules to show the agent applying what it learned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setModalVisible(false)}>
              Cancel
            </Button>
            <Button type="button" variant="outline" onClick={() => triggerReseed(true)} disabled={mutation.isPending}>
              Reset, keep learned rules
            </Button>
            <Button type="button" onClick={() => triggerReseed(false)} disabled={mutation.isPending}>
              Reset everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
