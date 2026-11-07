import { createToolkitAuthPlugin } from "@agent-native/toolkit/app/auth/server";

const resolveArenaChallenger = () =>
  Boolean(process.env.VERCEL) || process.env.ARENA_OPEN_ACCESS === "1" // guard:allow-env-credential — hosted arena guest toggle
    ? { email: "challenger@brawlstage.app", emailVerified: true }
    : null;

export default createToolkitAuthPlugin({
  workspaceAppPublicPaths: ["/"],
  rootAuth: true,
  marketing: false,
  getAdditionalSession: async () => resolveArenaChallenger(),
  getAdditionalBrowserSession: async () => resolveArenaChallenger(),
});
