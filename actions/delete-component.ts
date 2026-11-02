import { defineAction, fail } from "@agent-native/core/action";
import { assertAccess } from "@agent-native/core/sharing";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { loadComponent } from "../server/lib/arena.js";

export default defineAction({
  description:
    "Permanently delete a component along with its viewport runs and learned rules. Only the component's owner or an admin can delete it.",
  schema: z.object({ id: z.string().describe("Component id to delete") }),
  outputSchema: z.object({ id: z.string(), deleted: z.literal(true) }),
  mcpAnnotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  changeResource: (input) => ({ resourceType: "component", resourceId: input.id }),
  run: async ({ id }) => {
    if (Boolean(process.env.VERCEL) || process.env.ARENA_OPEN_ACCESS === "1") { // guard:allow-env-credential — hosted arena protection
      fail("Deleting components is turned off on the hosted stage. Use Reset demo to start over.", {
        errorCode: "hosted_stage_locked",
        statusCode: 403,
      });
    }
    await assertAccess("component", id, "admin");
    const component = await loadComponent(id);
    const [removed] = await getDb()
      .delete(schema.components)
      .where(
        and(
          eq(schema.components.id, component.id),
          eq(schema.components.ownerEmail, component.ownerEmail),
        ),
      )
      .returning({ id: schema.components.id });
    if (!removed) fail("Component not found.", { errorCode: "not_found", statusCode: 404 });
    return { id: removed.id, deleted: true as const };
  },
});
