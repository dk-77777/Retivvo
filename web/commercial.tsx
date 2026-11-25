import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { request, errorMessage, ApiError } from "./api.ts";
import { money, parseAmount } from "./money.ts";
import { ActionForm, Notice, Pager, useData } from "./ui.tsx";

type Entity = { id: string };
type Client = Entity & { name: string };
type Proposal = Entity & {
  clientId: string;
  clientName: string;
  title: string;
  amountCents: string;
  sentOn: string;
  status: keyof typeof statuses;
  notes: string;
};
type Followup = Entity & {
  proposalId: string;
  proposalTitle: string;
  action: string;
  dueOn: string;
  done: boolean;
  outcome: string;
};
const statuses = { open: "Em aberto", won: "Ganha", lost: "Perdida" };
const date = (iso: string) => iso.split("-").reverse().join("/");

function Listing<T extends Entity>({
  path,
  title,
  label,
  describe,
  nameOf,
  fields,
  filters,
  query = "",
}: {
  path: string;
  title: string;
  label: string;
  describe: (item: T) => ReactNode;
  nameOf: (item: T) => string;
  fields: (item?: T) => ReactNode;
  filters?: ReactNode;
  query?: string;
}) {
  const [page, setPage] = useState({ filter: query, offset: 0 });
  const offset = page.filter === query ? page.offset : 0;
  const setOffset = (next: number) => setPage({ filter: query, offset: next });
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<T | null>();
  const creationKey = useRef<string>(undefined);
  const editHeading = useRef<HTMLHeadingElement>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const cancelDeletion = useRef<HTMLButtonElement>(null);
  const createTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (edit !== undefined) editHeading.current?.focus();
  }, [edit]);
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  const list = useData<T[]>(
    path +
      "?offset=" +
      offset +
      query +
      (search ? "&q=" + encodeURIComponent(search) : ""),
  );
  useEffect(() => {
    if (confirm) cancelDeletion.current?.focus();
  }, [confirm]);
  function closeEditor() {
    setEdit(undefined);
    editTrigger.current?.focus();
  }
  function saved() {
    list.refresh();
    closeEditor();
    setNotice("Registro salvo.");
  }
  async function remove(id: string) {
    setDeleting(true);
    try {
      await request(path + "/" + id, "DELETE");
      setConfirm(undefined);
      if (list.data?.length === 1 && offset) setOffset(offset - 50);
      list.refresh();
      createTrigger.current?.focus();
      setNotice("Registro excluído.");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }
  return (
    <section>
      <div className="section-heading">
        <h1>{title}</h1>
        <button
          ref={createTrigger}
          className="primary"
          onClick={(event) => {
            editTrigger.current = event.currentTarget;
            if (edit !== null) creationKey.current = crypto.randomUUID();
            setEdit(null);
            setNotice("");
          }}
        >
          {label}
        </button>
      </div>
      {edit !== undefined && (
        <article>
          <h2 ref={editHeading} tabIndex={-1}>
            {edit ? "Editar " + nameOf(edit) : label}
          </h2>
          <ActionForm
            key={edit?.id ?? "new"}
            label="Salvar"
            action={(data) =>
              request(
                path + (edit ? "/" + edit.id : ""),
                edit ? "PATCH" : "POST",
                "amountCents" in data
                  ? {
                      ...data,
                      amountCents: parseAmount(String(data.amountCents)),
                    }
                  : "completed" in data
                    ? Object.fromEntries(
                        Object.entries({
                          ...data,
                          done: data.completed === "yes",
                        }).filter(([key]) => key !== "completed"),
                      )
                    : data,
                edit ? undefined : creationKey.current,
              )
            }
            onSaved={saved}
          >
            {fields(edit ?? undefined)}
          </ActionForm>
          <button type="button" onClick={closeEditor}>
            Cancelar edição
          </button>
        </article>
      )}
      <ActionForm
        label="Buscar"
        action={async (fields) => {
          setOffset(0);
          setSearch(String(fields.q ?? "").trim());
        }}
      >
        <label>
          Buscar em {title.toLowerCase()}
          <input type="search" name="q" maxLength={120} />
        </label>
      </ActionForm>
      {filters}
      {notice && <Notice>{notice}</Notice>}
      {list.error && (
        <p role="alert">
          {list.error} <button onClick={list.refresh}>Tentar novamente</button>
        </p>
      )}
      {!list.data && !list.error && <Notice>Carregando…</Notice>}
      {list.data?.length === 0 && (
        <Notice>
          {search
            ? "Nenhum registro corresponde à busca."
            : "Nenhum registro nesta página."}
        </Notice>
      )}
      {!!list.data?.length && (
        <ul className="records">
          {list.data.map((item) => (
            <li key={item.id}>
              <div className="record-details">{describe(item)}</div>
              <div className="row record-actions">
                <button
                  aria-label={"Editar " + nameOf(item)}
                  onClick={(event) => {
                    editTrigger.current = event.currentTarget;
                    setEdit(item);
                    setNotice("");
                  }}
                >
                  Editar
                </button>
                <button
                  aria-label={"Excluir " + nameOf(item)}
                  onClick={(event) => {
                    deleteTrigger.current = event.currentTarget;
                    setConfirm(item.id);
                    setNotice("");
                  }}
                >
                  Excluir
                </button>
              </div>
              {confirm === item.id && (
                <div className="row confirmation">
                  <span role="status">Excluir {nameOf(item)}?</span>
                  <button
                    disabled={deleting}
                    onClick={() => void remove(item.id)}
                  >
                    Confirmar exclusão
                  </button>
                  <button
                    disabled={deleting}
                    ref={cancelDeletion}
                    onClick={() => {
                      setConfirm(undefined);
                      deleteTrigger.current?.focus();
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {(offset > 0 || (list.data?.length ?? 0) >= 50) && (
        <Pager
          offset={offset}
          length={list.data?.length ?? 0}
          change={setOffset}
        />
      )}
    </section>
  );
}

function Related<T extends Entity>({
  path,
  label,
  name,
  defaultId,
  display,
}: {
  path: string;
  label: string;
  name: string;
  defaultId?: string;
  display: (value: T) => string;
}) {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(defaultId ?? "");
  const page = useData<T[]>(path + "?offset=" + offset);
  return (
    <div>
      <label>
        {label}
        <select
          name={name}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          required
        >
          <option value="">Selecione</option>
          {selected && !page.data?.some((item) => item.id === selected) && (
            <option value={selected}>Registro selecionado</option>
          )}
          {page.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {display(item)}
            </option>
          ))}
        </select>
      </label>
      {page.error && <p role="alert">{page.error}</p>}
      {(offset > 0 || (page.data?.length ?? 0) >= 50) && (
        <Pager
          offset={offset}
          length={page.data?.length ?? 0}
          change={setOffset}
        />
      )}
    </div>
  );
}

export function Clients({ path }: { path: string }) {
  return (
    <Listing<Client>
      path={path + "/clients"}
      title="Clientes"
      label="Novo cliente"
      nameOf={(item) => item.name}
      describe={(item) => <h2>{item.name}</h2>}
      fields={(item) => (
        <label>
          Nome do cliente
          <input
            required
            name="name"
            maxLength={160}
            defaultValue={item?.name}
          />
        </label>
      )}
    />
  );
}

export function Proposals({ path }: { path: string }) {
  const [filter, setFilter] = useState("");
  return (
    <Listing<Proposal>
      path={path + "/proposals"}
      title="Propostas"
      label="Nova proposta"
      query={filter ? "&status=" + filter : ""}
      filters={
        <label>
          Filtrar situação
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(statuses).map(([id, text]) => (
              <option key={id} value={id}>
                {text}
              </option>
            ))}
          </select>
        </label>
      }
      nameOf={(item) => item.title}
      describe={(item) => (
        <>
          <h2>{item.title}</h2>
          <p>{item.clientName}</p>
          <p className="record-meta">
            {statuses[item.status]} · {money(item.amountCents)} · Enviada em{" "}
            {date(item.sentOn)}
          </p>
          {item.notes && <p>{item.notes}</p>}
        </>
      )}
      fields={(item) => (
        <>
          <label>
            Título
            <input
              name="title"
              defaultValue={item?.title}
              maxLength={160}
              required
            />
          </label>
          <Related<Client>
            path={path + "/clients"}
            label="Cliente"
            name="clientId"
            defaultId={item?.clientId}
            display={(row) => row.name}
          />
          <label>
            Valor em reais
            <input
              name="amountCents"
              inputMode="decimal"
              pattern="[0-9]{1,9}([.,][0-9]{1,2})?"
              defaultValue={
                item ? String(Number(item.amountCents) / 100) : undefined
              }
              required
            />
          </label>
          <label>
            Data de envio
            <input
              name="sentOn"
              type="date"
              defaultValue={item?.sentOn}
              required
            />
          </label>
          <label>
            Situação
            <select name="status" defaultValue={item?.status ?? "open"}>
              {Object.entries(statuses).map(([id, text]) => (
                <option key={id} value={id}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <label>
            Observações
            <textarea
              name="notes"
              maxLength={2000}
              defaultValue={item?.notes}
            />
          </label>
        </>
      )}
    />
  );
}

export function Followups({ path }: { path: string }) {
  return (
    <Listing<Followup>
      path={path + "/followups"}
      title="Acompanhamentos"
      label="Novo acompanhamento"
      nameOf={(item) => item.action}
      describe={(item) => (
        <>
          <h2>{item.action}</h2>
          <p>{item.proposalTitle}</p>
          <p className="record-meta">
            {item.done ? "Concluído" : "Pendente"} · {date(item.dueOn)}
          </p>
          {item.outcome && <p>{item.outcome}</p>}
        </>
      )}
      fields={(item) => (
        <>
          {!item && (
            <Related<Proposal>
              path={path + "/proposals"}
              label="Proposta"
              name="proposalId"
              display={(row) => row.title}
            />
          )}
          <label>
            Próxima ação
            <input
              name="action"
              required
              defaultValue={item?.action}
              maxLength={200}
            />
          </label>
          <label>
            Prazo
            <input
              name="dueOn"
              type="date"
              required
              defaultValue={item?.dueOn}
            />
          </label>
          <label>
            Situação
            <select name="completed" defaultValue={item?.done ? "yes" : "no"}>
              <option value="no">Pendente</option>
              <option value="yes">Concluído</option>
            </select>
          </label>
          <label>
            Resultado do contato (obrigatório ao concluir)
            <textarea
              name="outcome"
              defaultValue={item?.outcome}
              maxLength={2000}
            />
          </label>
        </>
      )}
    />
  );
}

type Summary = {
  statuses: {
    status: keyof typeof statuses;
    count: number;
    amountCents: string;
  }[];
  pending: number;
};
export function Reports({
  path,
  dashboard = false,
}: {
  path: string;
  dashboard?: boolean;
}) {
  const [query, setQuery] = useState("");
  const report = useData<Summary>(path + "/reports" + query);
  return (
    <section>
      <h1>{dashboard ? "Visão geral" : "Relatórios"}</h1>
      {!dashboard && (
        <ActionForm
          label="Aplicar período de envio"
          action={async (fields) => {
            const from = String(fields.from ?? ""),
              to = String(fields.to ?? "");
            if (from && to && from > to)
              throw new ApiError(400, "A data inicial deve anteceder a final.");
            const params = new URLSearchParams();
            if (from) params.set("from", from);
            if (to) params.set("to", to);
            setQuery("?" + params);
          }}
        >
          <div className="row">
            <label>
              De
              <input type="date" name="from" />
            </label>
            <label>
              Até
              <input type="date" name="to" />
            </label>
          </div>
        </ActionForm>
      )}
      {report.error && <p role="alert">{report.error}</p>}
      {!report.error && !report.data && (
        <Notice>Calculando indicadores…</Notice>
      )}
      {report.data && (
        <>
          <dl className="metrics">
            {Object.entries(statuses).map(([key, label]) => {
              const total = report.data?.statuses.find(
                (row) => row.status === key,
              );
              return (
                <div key={key}>
                  <dt>Propostas · {label}</dt>
                  <dd>
                    {total?.count ?? 0}{" "}
                    <span>{total?.count === 1 ? "proposta" : "propostas"}</span>
                  </dd>
                  <dd>{money(total?.amountCents ?? "0")}</dd>
                </div>
              );
            })}
          </dl>
          <div className="pending-summary">
            <p>
              Acompanhamentos pendentes em propostas abertas{" "}
              <strong>{report.data.pending}</strong>
            </p>
            {dashboard && (
              <Link to="/app/acompanhamentos">Ver acompanhamentos</Link>
            )}
          </div>
          {report.data.statuses.length === 0 && (
            <Notice>Nenhuma proposta no período.</Notice>
          )}
        </>
      )}
    </section>
  );
}
