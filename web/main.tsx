import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { auth, errorMessage, orgPath, request } from "./api.ts";
import { Profile, PublicAccount, type Session } from "./account.tsx";
import { Clients, Followups, Proposals, Reports } from "./commercial.tsx";
import { ActionForm, Notice, useData } from "./ui.tsx";
import "./styles.css";

type Org = { id: string; name: string; administrator: boolean };
const pages = [
  ["painel", "Visão geral"],
  ["clientes", "Clientes"],
  ["propostas", "Propostas"],
  ["acompanhamentos", "Acompanhamentos"],
  ["relatorios", "Relatórios"],
  ["organizacoes", "Organizações"],
  ["conta", "Minha conta"],
];

function Organizations({
  org,
  refresh,
  mfa,
  onCreated,
}: {
  org?: Org;
  refresh: () => void;
  mfa?: boolean;
  onCreated: (id: string) => void;
}) {
  const [notice, setNotice] = useState("");
  return (
    <section>
      <h1>Organizações</h1>
      {mfa ? (
        <ActionForm
          label="Criar organização"
          action={async (fields) => {
            const row = await request<Org>("/organizations", "POST", fields);
            onCreated(row.id);
            refresh();
            setNotice("Organização criada.");
          }}
        >
          <label>
            Nome da organização
            <input name="name" required maxLength={120} />
          </label>
        </ActionForm>
      ) : (
        <p>
          <Link to="/app/conta">Configure o segundo fator</Link> para
          administrar organizações.
        </p>
      )}
      {org?.administrator && (
        <>
          <h2>Gerenciar acesso a {org.name}</h2>
          <ActionForm
            label="Conceder acesso"
            action={(fields) =>
              request(orgPath(org.id) + "/members", "POST", fields)
            }
            onSaved={() => setNotice("Acesso concedido.")}
          >
            <label>
              Identificador do usuário
              <input name="userId" maxLength={128} required />
            </label>
          </ActionForm>
          <ActionForm
            label="Revogar acesso"
            action={(fields) =>
              request(
                orgPath(org.id) +
                  "/members/" +
                  encodeURIComponent(String(fields.userId)),
                "DELETE",
              )
            }
            onSaved={() => setNotice("Acesso revogado.")}
          >
            <label>
              Identificador do membro
              <input name="userId" maxLength={128} required />
            </label>
          </ActionForm>
          <section className="account-warning">
            <h2>Encerrar organização</h2>
            <p>
              O encerramento remove esta organização. Ela precisa estar vazia.
            </p>
            <ActionForm
              label="Encerrar organização vazia"
              action={(fields) => request(orgPath(org.id), "DELETE", fields)}
              onSaved={() => {
                refresh();
                setNotice("Organização encerrada.");
              }}
            >
              <label>
                Confirme o nome da organização
                <input name="confirmName" required maxLength={120} />
              </label>
            </ActionForm>
          </section>
        </>
      )}
      {notice && <Notice>{notice}</Notice>}
    </section>
  );
}

function Workspace({
  session,
  refresh,
}: {
  session: Session;
  refresh: () => void;
}) {
  const orgs = useData<Org[]>("/organizations");
  const [selection, setSelection] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLElement>(null);
  const [logoutError, setLogoutError] = useState("");
  const org = orgs.data?.find((row) => row.id === selection) ?? orgs.data?.[0];
  const navigate = useNavigate();
  const { page = "painel" } = useParams();
  const path = org ? orgPath(org.id) : "";
  const previousPage = useRef(page);
  useEffect(() => {
    if (previousPage.current !== page) main.current?.focus();
    previousPage.current = page;
  }, [page]);
  return (
    <>
      <a className="skip-link" href="#conteudo">
        Ir para o conteúdo principal
      </a>
      <header className="workspace-header">
        <Link className="brand" to="/app">
          Retivvo
        </Link>
        <button
          ref={menuButton}
          type="button"
          className="menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="workspace-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          Menu
        </button>
        {!!orgs.data?.length && (
          <label className="organization-switcher">
            Organização
            <select
              value={org?.id ?? ""}
              onChange={(e) => setSelection(e.target.value)}
            >
              {orgs.data.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          onClick={async () => {
            try {
              await auth("sign-out", {});
              refresh();
              navigate("/entrar");
            } catch (error) {
              setLogoutError(errorMessage(error));
            }
          }}
        >
          Sair
        </button>
      </header>
      <nav
        id="workspace-navigation"
        className="workspace-navigation"
        aria-label="Principal"
        data-expanded={menuOpen}
        onKeyDown={(event) => {
          if (event.key === "Escape" && menuOpen) {
            setMenuOpen(false);
            menuButton.current?.focus();
          }
        }}
      >
        {pages.map(([id, label]) => (
          <NavLink
            key={id}
            to={"/app/" + id}
            end
            onClick={() => {
              setMenuOpen(false);
              if (id === page) main.current?.focus();
            }}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <main ref={main} id="conteudo" tabIndex={-1} key={org?.id ?? "empty"}>
        {logoutError && <p role="alert">{logoutError}</p>}
        {orgs.error && (
          <p role="alert">
            {orgs.error}{" "}
            <button onClick={orgs.refresh}>Tentar novamente</button>
          </p>
        )}
        {page === "conta" ? (
          <Profile session={session} refresh={refresh} />
        ) : page === "organizacoes" ? (
          <Organizations
            org={org}
            refresh={orgs.refresh}
            mfa={session.session.mfaVerified}
            onCreated={setSelection}
          />
        ) : !orgs.data ? (
          <Notice>Carregando organizações…</Notice>
        ) : !org ? (
          <section>
            <h1>Comece pelo cadastro da organização</h1>
            <Link to="/app/organizacoes">Gerenciar organizações</Link>
          </section>
        ) : page === "clientes" ? (
          <Clients path={path} />
        ) : page === "propostas" ? (
          <Proposals path={path} />
        ) : page === "acompanhamentos" ? (
          <Followups path={path} />
        ) : page === "relatorios" ? (
          <Reports key="reports" path={path} />
        ) : page === "painel" ? (
          <Reports key="dashboard" path={path} dashboard />
        ) : (
          <section>
            <h1>Página indisponível</h1>
            <Link to="/app">Voltar à visão geral</Link>
          </section>
        )}
      </main>
    </>
  );
}

function App() {
  const session = useData<Session | null>("/auth/get-session");
  const workspace = session.error ? (
    <main>
      <p role="alert">{session.error}</p>
      <button onClick={session.refresh}>Tentar novamente</button>
    </main>
  ) : session.data === undefined ? (
    <Notice>Verificando sessão…</Notice>
  ) : session.data === null ? (
    <Navigate to="/entrar" replace />
  ) : (
    <Workspace session={session.data} refresh={session.refresh} />
  );
  return (
    <Routes>
      {["/entrar", "/cadastro", "/recuperar"].map((path) => (
        <Route
          key={path}
          path={path}
          element={<PublicAccount key={path} refresh={session.reload} />}
        />
      ))}
      <Route path="/app" element={workspace} />
      <Route path="/app/:page" element={workspace} />
      <Route
        path="*"
        element={
          <main>
            <h1>Página indisponível</h1>
            <a href="/">Ir para o início</a>
          </main>
        }
      />
    </Routes>
  );
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
