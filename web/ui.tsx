import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { errorMessage, request, values } from "./api.ts";

export function useData<T>(path: string) {
  const [result, setResult] = useState<{
    path: string;
    data?: T;
    error?: string;
  }>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    request<T>(path).then(
      (data) => {
        if (current) setResult({ path, data });
      },
      (error) => {
        if (current) setResult({ path, error: errorMessage(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [path, revision]);
  return {
    ...(result?.path === path ? result : undefined),
    refresh: () => setRevision((v) => v + 1),
    reload: () => {
      setResult(undefined);
      setRevision((v) => v + 1);
    },
  };
}

export function Notice({ children }: { children: ReactNode }) {
  return <p role="status">{children}</p>;
}

export function ActionForm({
  children,
  label,
  action,
  onSaved,
}: {
  children: ReactNode;
  label: string;
  action: (fields: ReturnType<typeof values>) => Promise<unknown>;
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = values(form);
    setBusy(true);
    setMessage("");
    try {
      await action(fields);
      for (const input of form.querySelectorAll<HTMLInputElement>(
        'input[type="password"]',
      ))
        input.value = "";
      onSaved?.();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        {children}
        <button type="submit">{busy ? "Aguarde…" : label}</button>
      </fieldset>
      {message && <p role="alert">{message}</p>}
    </form>
  );
}

export function Pager({
  offset,
  length,
  change,
}: {
  offset: number;
  length: number;
  change: (n: number) => void;
}) {
  return (
    <div className="row">
      <button
        type="button"
        disabled={!offset}
        onClick={() => change(Math.max(0, offset - 50))}
      >
        Anterior
      </button>
      <button
        type="button"
        disabled={length < 50}
        onClick={() => change(offset + 50)}
      >
        Próxima
      </button>
    </div>
  );
}
