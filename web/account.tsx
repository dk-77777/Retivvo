import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { auth } from "./api.ts";
import { ActionForm, Notice } from "./ui.tsx";

export type Session = {
  user: { id: string; name: string; email: string; twoFactorEnabled?: boolean };
  session: { mfaVerified?: boolean };
};
const email = (
  <label>
    E-mail
    <input
      type="email"
      name="email"
      autoComplete="email"
      required
      maxLength={254}
    />
  </label>
);
const password = (name = "password", fresh = false) => (
  <label>
    {fresh ? "Nova senha" : "Senha"}
    <input
      type="password"
      name={name}
      required
      maxLength={128}
      minLength={fresh ? 15 : undefined}
      autoComplete={fresh ? "new-password" : "current-password"}
    />
  </label>
);

export function PublicAccount({ refresh }: { refresh: () => void }) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [challenge, setChallenge] = useState(false);
  const [backup, setBackup] = useState(false);
  const [message, setMessage] = useState("");
  const token = new URLSearchParams(search).get("token");
  function signedIn() {
    refresh();
    navigate("/app");
  }
  return (
    <>
      <header className="site-header">
        <a className="brand" href="/">
          Retivvo
        </a>
        {pathname !== "/entrar" && <Link to="/entrar">Entrar</Link>}
      </header>
      <main className="public account-shell">
        <section className="account-card">
          {pathname === "/cadastro" && (
            <>
              <h1>Criar conta</h1>
              <p className="account-intro">
                Comece a organizar suas propostas e os próximos contatos.
              </p>
              <ActionForm
                label="Cadastrar"
                action={async (fields) => {
                  await auth("sign-up/email", {
                    ...fields,
                    callbackURL: "/entrar",
                  });
                  setMessage("Confira seu e-mail para confirmar o cadastro.");
                }}
              >
                <label>
                  Nome
                  <input
                    name="name"
                    required
                    maxLength={120}
                    autoComplete="name"
                  />
                </label>
                {email}
                {password("password", true)}
                <p className="field-hint">
                  Use pelo menos 15 caracteres na senha.
                </p>
              </ActionForm>
              <p className="account-links">
                <a href="/privacidade">Política de privacidade</a>
                <a href="/termos">Termos de uso</a>
              </p>
            </>
          )}
          {pathname === "/entrar" && (
            <>
              <h1>{challenge ? "Confirmar segundo fator" : "Entrar"}</h1>
              {challenge ? (
                <>
                  <ActionForm
                    key={String(backup)}
                    label="Confirmar"
                    action={(fields) =>
                      auth(
                        backup
                          ? "two-factor/verify-backup-code"
                          : "two-factor/verify-totp",
                        fields,
                      )
                    }
                    onSaved={signedIn}
                  >
                    <label>
                      {backup
                        ? "Código de recuperação"
                        : "Código do autenticador"}
                      <input
                        name="code"
                        required
                        autoComplete="one-time-code"
                        inputMode={backup ? "text" : "numeric"}
                      />
                    </label>
                  </ActionForm>
                  <button type="button" onClick={() => setBackup(!backup)}>
                    {backup
                      ? "Usar autenticador"
                      : "Usar código de recuperação"}
                  </button>
                  <button type="button" onClick={() => setChallenge(false)}>
                    Voltar ao login
                  </button>
                </>
              ) : (
                <>
                  <ActionForm
                    label="Entrar"
                    action={async (fields) => {
                      const result = await auth<{
                        twoFactorRedirect?: boolean;
                      }>("sign-in/email", fields);
                      if (result.twoFactorRedirect) setChallenge(true);
                      else signedIn();
                    }}
                  >
                    {email}
                    {password()}
                  </ActionForm>
                  <div className="row">
                    <Link to="/recuperar">Esqueci minha senha</Link>
                    <Link to="/cadastro">Criar conta</Link>
                  </div>
                  <details>
                    <summary>Reenviar confirmação de e-mail</summary>
                    <ActionForm
                      label="Reenviar"
                      action={async (fields) => {
                        await auth("send-verification-email", {
                          ...fields,
                          callbackURL: "/entrar",
                        });
                        setMessage("Confira sua caixa de entrada.");
                      }}
                    >
                      {email}
                    </ActionForm>
                  </details>
                </>
              )}
            </>
          )}
          {pathname === "/recuperar" && (
            <>
              <h1>Recuperar acesso</h1>
              {token ? (
                <ActionForm
                  label="Alterar senha"
                  action={(fields) =>
                    auth("reset-password", { ...fields, token })
                  }
                  onSaved={() => navigate("/entrar", { replace: true })}
                >
                  {password("newPassword", true)}
                </ActionForm>
              ) : (
                <ActionForm
                  label="Solicitar link"
                  action={async (fields) => {
                    await auth("request-password-reset", {
                      ...fields,
                      redirectTo: window.location.origin + "/recuperar",
                    });
                    setMessage(
                      "Se o e-mail estiver cadastrado, você receberá um link.",
                    );
                  }}
                >
                  {email}
                </ActionForm>
              )}
            </>
          )}
          {message && (
            <div className="account-feedback">
              <Notice>{message}</Notice>
              {pathname === "/cadastro" && (
                <>
                  <Link to="/entrar">
                    Ir para o login ou reenviar confirmação
                  </Link>
                </>
              )}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

export function Profile({
  session,
  refresh,
}: {
  session: Session;
  refresh: () => void;
}) {
  const [enrollment, setEnrollment] = useState<{
    totpURI: string;
    backupCodes: string[];
  }>();
  const [notice, setNotice] = useState("");
  return (
    <section>
      <h1>Minha conta</h1>
      <p>
        {session.user.name} · {session.user.email}
      </p>
      <p>
        Identificador de usuário <code>{session.user.id}</code>
      </p>
      <h2>Segundo fator</h2>
      {session.session.mfaVerified && (
        <p>Segundo fator confirmado nesta sessão.</p>
      )}
      {!session.user.twoFactorEnabled && !enrollment && (
        <ActionForm
          label="Configurar autenticador"
          action={async (fields) =>
            setEnrollment(await auth("two-factor/enable", fields))
          }
        >
          {password()}
        </ActionForm>
      )}
      {enrollment && (
        <>
          <p>
            Adicione a chave ao autenticador e guarde os códigos de recuperação
            em local seguro.
          </p>
          <p>
            Chave{" "}
            <code>
              {new URL(enrollment.totpURI).searchParams.get("secret")}
            </code>
          </p>
          <ul>
            {enrollment.backupCodes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
          {session.session.mfaVerified && (
            <button type="button" onClick={() => setEnrollment(undefined)}>
              Ocultar códigos
            </button>
          )}
        </>
      )}
      {(enrollment || session.user.twoFactorEnabled) &&
        !session.session.mfaVerified && (
          <>
            {!enrollment && (
              <p>
                Confirme o segundo fator novamente para administrar suas
                organizações nesta sessão.
              </p>
            )}
            <ActionForm
              label="Confirmar autenticador"
              action={(fields) => auth("two-factor/verify-totp", fields)}
              onSaved={refresh}
            >
              <label>
                Código do autenticador
                <input
                  name="code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  required
                />
              </label>
            </ActionForm>
          </>
        )}
      <h2>Alterar senha</h2>
      <ActionForm
        label="Salvar senha"
        action={(fields) => auth("change-password", fields)}
        onSaved={() => {
          setNotice("Senha atualizada.");
          refresh();
        }}
      >
        <label>
          Senha atual
          <input
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        {password("newPassword", true)}
      </ActionForm>
      <section className="account-warning">
        <h2>Excluir conta</h2>
        <p>
          Encerre as organizações que você administra antes de confirmar a
          exclusão por e-mail.
        </p>
        <ActionForm
          label="Enviar confirmação de exclusão"
          action={(fields) =>
            auth("delete-user", { ...fields, callbackURL: "/" })
          }
          onSaved={() =>
            setNotice("Confira seu e-mail para confirmar a exclusão.")
          }
        >
          {password()}
        </ActionForm>
      </section>
      {notice && <Notice>{notice}</Notice>}
    </section>
  );
}
