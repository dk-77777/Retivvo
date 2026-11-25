import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import type { Pool } from "pg";

export type SendMail = (
  recipient: string,
  subject: string,
  link: string,
) => Promise<void>;

export function buildAuth(
  database: Pool,
  origin: string,
  secret: string,
  mail: SendMail,
  background: (task: Promise<unknown>) => void,
) {
  const sendAccountMail: SendMail = async (recipient, subject, link) => {
    try {
      await mail(recipient, subject, link);
    } catch {
      console.error(
        JSON.stringify({ event: "auth.mail_failed", level: "error" }),
      );
      throw new Error("Falha na entrega de e-mail transacional.");
    }
  };
  return betterAuth({
    appName: "Retivvo",
    baseURL: origin,
    secret,
    database,
    trustedOrigins: [origin],
    telemetry: { enabled: false },
    logger: {
      level: "warn",
      log: (level) =>
        console.error(JSON.stringify({ event: "auth.diagnostic", level })),
    },
    advanced: {
      backgroundTasks: { handler: background },
      disableOriginCheck: false,
      cookiePrefix: "retivvo",
      useSecureCookies: origin.startsWith("https://"),
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
      ipAddress: { ipAddressHeaders: ["x-retivvo-peer"] },
    },
    session: {
      expiresIn: 8 * 3600,
      freshAge: 15 * 60,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
      additionalFields: {
        mfaVerified: { type: "boolean", input: false, defaultValue: false },
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 3600, max: 5 },
        "/request-password-reset": { window: 300, max: 3 },
      },
    },
    verification: { storeIdentifier: "hashed" },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 15,
      maxPasswordLength: 128,
      autoSignIn: false,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 900,
      sendResetPassword: ({ user, url }) =>
        sendAccountMail(user.email, "Recuperar acesso ao Retivvo", url),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      expiresIn: 3600,
      sendVerificationEmail: ({ user, url }) =>
        sendAccountMail(user.email, "Confirmar e-mail no Retivvo", url),
    },
    user: {
      deleteUser: {
        enabled: true,
        deleteTokenExpiresIn: 900,
        beforeDelete: async (user) => {
          const result = await database.query(
            "SELECT public.owns_organization($1) AS owns",
            [user.id],
          );
          if (result.rows[0].owns)
            throw new APIError("CONFLICT", {
              message: "Encerre a organização antes de excluir sua conta.",
            });
        },
        sendDeleteAccountVerification: ({ user, url }) =>
          sendAccountMail(
            user.email,
            "Confirmar exclusão da conta Retivvo",
            url,
          ),
      },
    },
    plugins: [
      twoFactor({
        issuer: "Retivvo",
        twoFactorCookieMaxAge: 300,
        backupCodeOptions: { storeBackupCodes: "encrypted" },
      }),
    ],
  });
}
