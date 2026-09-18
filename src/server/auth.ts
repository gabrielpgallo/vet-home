import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { pool } from "./db";
import { appUrl } from "../lib/app-url";
import { authPolicyPool } from "./auth-policy";
export function googleReady() {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.BETTER_AUTH_SECRET &&
    appUrl()
  );
}
export const auth = betterAuth({
  appName: "IR Saúde Animal",
  baseURL: appUrl() || "http://127.0.0.1:3010",
  database: pool,
  user: {
    modelName: "auth_user",
    changeEmail: { enabled: false },
    deleteUser: { enabled: false },
  },
  session: {
    modelName: "auth_session",
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
  account: {
    modelName: "auth_account",
    accountLinking: { enabled: false },
    encryptOAuthTokens: true,
  },
  verification: { modelName: "auth_verification" },
  emailAndPassword: { enabled: false },
  socialProviders: googleReady()
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          prompt: "select_account",
          disableIdTokenSignIn: true,
        },
      }
    : {},
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "auth_rate_limit",
    window: 60,
    max: 60,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!user.emailVerified)
            throw new APIError("FORBIDDEN", {
              message: "Use um e-mail verificado pelo Google.",
            });
          const invited = await authPolicyPool.query(
            "SELECT 1 FROM iam_invitations WHERE lower(email)=lower($1) AND status='pending' AND expires_at>now()",
            [user.email],
          );
          if (!invited.rowCount)
            throw new APIError("FORBIDDEN", {
              message: "É necessário um convite ativo para acessar.",
            });
          return { data: user };
        },
      },
    },
  },
});
