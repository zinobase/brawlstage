import { defineAction, fail } from "@agent-native/core/action";
import { writeAppStateForCurrentTab } from "@agent-native/core/application-state";
import { z } from "zod";

import { ALL_WIDTHS } from "../shared/arena-protocol.js";
import { saboteurSchema } from "../server/lib/contracts.js";

export default defineAction({
  description:
    "Move the user's arena view: open the fight card (view \"arena\"), open a component on the stage, focus a viewport width lane, and/or select a violation by DOM selector. Also accepts a raw path or a chat thread.",
  schema: z.object({
    view: z
      .enum(["arena", "chat", "home", "settings"])
      .optional()
      .describe("Named view: arena (component list or stage), chat, home, or settings"),
    path: z.string().optional().describe("Explicit in-app path such as /arena/<id>?w=375"),
    componentId: z.string().optional().describe("Component id to open on the stage"),
    width: z.coerce
      .number()
      .int()
      .optional()
      .describe("Viewport width lane to focus, one of the 33 measured widths in px"),
    selector: z.string().optional().describe("DOM selector of a finding to highlight on the stage"),
    saboteur: saboteurSchema.optional().describe("Saboteur profile tab to show (display only; use inject-saboteur-payload to arm it)"),
    threadId: z.string().optional().describe("Chat thread id to open when view is chat"),
  }),
  outputSchema: z.object({ path: z.string(), message: z.string() }),
  http: false,
  run: async (args) => {
    if (args.width !== undefined && !ALL_WIDTHS.includes(args.width)) {
      fail(`Width must be one of the measured lanes: ${ALL_WIDTHS.join(", ")}.`, {
        errorCode: "invalid_width",
      });
    }
    let path = args.path ?? "";
    if (!path && args.componentId) {
      const params = new URLSearchParams();
      if (args.width !== undefined) params.set("w", String(args.width));
      if (args.selector) params.set("sel", args.selector);
      if (args.saboteur) params.set("sab", args.saboteur);
      const query = params.toString();
      path = `/arena/${encodeURIComponent(args.componentId)}${query ? `?${query}` : ""}`;
    }
    if (!path && args.view === "arena") path = "/arena";
    if (!path && !args.view) {
      fail("Pass a view, path, or componentId.", { errorCode: "missing_target" });
    }
    const nav: Record<string, string> = {
      _writeId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    if (args.view) nav.view = args.view;
    if (path) nav.path = path;
    if (args.threadId) nav.threadId = args.threadId;
    await writeAppStateForCurrentTab("navigate", nav);
    return { path: path || `view:${args.view}`, message: `Navigating to ${path || args.view}` };
  },
});
