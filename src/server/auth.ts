import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { pool } from "./db";
import { appUrl } from "../lib/app-url";
import { authPolicyPool } from "./auth-policy";
import {
  SESSION_ABSOLUTE_SECONDS,
  SESSION_FRESH_SECONDS,
} from "./session-security";
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
    expiresIn: SESSION_ABSOLUTE_SECONDS,
    updateAge: 60 * 60,
    freshAge: SESSION_FRESH_SECONDS,
    cookieCache: { enabled: false },
    additionalFields: {
      sharedDevice: {
        type: "boolean",
        defaultValue: false,
        input: false,
        fieldName: "shared_device",
      },
    },
  },
  account: {
    modelName: "auth_account",
    accountLinking: { enabled: false },
    encryptOAuthTokens: true,
  },
  verification: { modelName: "auth_verification" },
  advanced: {
    useSecureCookies: appUrl()?.startsWith("https:") || false,
    ipAddress: {
      ipAddressHeaders: process.env.VERCEL ? ["x-forwarded-for"] : [],
    },
  },
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
    customRules: { "/sign-in/social": { window: 60, max: 10 } },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session, context) => ({
          data: {
            ...session,
            sharedDevice: /(?:^|;\s*)vet-shared-device=true(?:;|$)/.test(
              context?.headers?.get("cookie") || "",
            ),
          },
        }),
      },
    },
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
