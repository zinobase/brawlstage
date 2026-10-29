import { createGetDb } from "@agent-native/core/db";
import { registerShareableResource } from "@agent-native/core/sharing";

import * as schema from "./schema.js";

export const getDb = createGetDb(schema);
export { schema };

registerShareableResource({
  type: "component",
  resourceTable: schema.components,
  sharesTable: schema.componentShares,
  displayName: "Component",
  titleColumn: "name",
  getResourcePath: (component) => `/arena/${component.id}`,
  getDb,
});
