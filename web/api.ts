export class ApiError extends Error {
  constructor(publicStatus: number, message: string) {
    super(message);
    this.status = publicStatus;
  }
  status: number;
}

export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      data?.error ||
        (
          {
            400: "Confira os dados informados.",
            401: "Credenciais inválidas ou sessão expirada.",
            403: "Acesso não autorizado. Confira seu e-mail ou a confirmação do segundo fator.",
            404: "Registro indisponível.",
            429: "Aguarde antes de tentar novamente.",
          } as Record<number, string>
        )[response.status] ||
        "Não foi possível concluir a operação.",
    );
  return data as T;
}
export const auth = <T>(path: string, body?: unknown) =>
  request<T>("/auth/" + path, body === undefined ? "GET" : "POST", body);
export const errorMessage = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : "Não foi possível acessar o Retivvo.";
export const values = (form: HTMLFormElement) =>
  Object.fromEntries(new FormData(form));
export const orgPath = (id: string) => "/organizations/" + id;
