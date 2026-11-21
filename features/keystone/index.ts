import { createAuth } from "@keystone-6/auth";
import { config } from "@keystone-6/core";
import "dotenv/config";
import { models } from "./models";
import { statelessSessions } from "@keystone-6/core/session";
import { extendGraphqlSchema } from "./mutations";
import { sendPasswordResetEmail } from "./lib/mail";
import { withMcpBearerSessions } from "./mcp-oauth/session";
import { storageConfig } from "./lib/storage";
import { ROLE_FLAGS } from "./access";
import { ROLE_TEMPLATES } from "./lib/roles";

const databaseURL = process.env.DATABASE_URL || "file:./keystone.db";

const sessionConfig = {
  maxAge: 60 * 60 * 24 * 30,
  secret: process.env.SESSION_SECRET || "this secret should only be used in testing",
};

const { withAuth } = createAuth({
  listKey: "User",
  identityField: "email",
  secretField: "password",
  // The first account is the owner (§9: "the owner's account from the first sign-up").
  initFirstItem: {
    fields: ["name", "email", "password"],
    itemData: { role: { create: ROLE_TEMPLATES.Owner } },
  },
  passwordResetLink: {
    async sendToken(args) {
      await sendPasswordResetEmail(args.token, args.identity);
    },
  },
  sessionData: `
    name
    email
    role { id name ${ROLE_FLAGS.join(" ")} }
    locationMemberships { id role status location { id status } }
    tutor { id }
    family { id }
  `,
});

export default withAuth(
  config({
    db: {
      provider: "postgresql",
      url: databaseURL,
    },
    lists: models,
    storage: storageConfig(),
    ui: {
      isAccessAllowed: ({ session }) => session?.data.role?.canAccessDashboard ?? false,
    },
    // MCP OAuth bearer tokens resolve to the approving user; everything else is unchanged.
    session: withMcpBearerSessions(statelessSessions(sessionConfig)),
    graphql: {
      extendGraphqlSchema,
    },
  })
);
