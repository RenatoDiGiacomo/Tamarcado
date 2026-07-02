import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";

const ACCESS_KEY = "tamarcado.access";

type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Configurações → Identidade visual (owner-only no backend). Logo por URL (DL-034). */
export function ConfiguracoesIdentidade() {
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#6c63ff");
  const [status, setStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    const token = localStorage.getItem(ACCESS_KEY);
    apiRequest("/installation", { token })
      .then(async (res) => {
        if (res.ok) {
          const data = (await res.json()) as {
            name: string;
            logoUrl: string | null;
            primaryColor: string | null;
          };
          setName(data.name ?? "");
          setLogoUrl(data.logoUrl ?? "");
          setPrimaryColor(data.primaryColor ?? "#6c63ff");
        }
      })
      .catch(() => setStatus("error"));
  }, []);

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    setStatus("saving");
    const token = localStorage.getItem(ACCESS_KEY);
    const body: Record<string, unknown> = { name, primaryColor };
    if (logoUrl) {
      body.logoUrl = logoUrl;
    }
    const res = await apiRequest("/installation", {
      method: "PATCH",
      body,
      token,
    });
    setStatus(res.ok ? "saved" : "error");
  }

  return (
    <section>
      <h1>Identidade visual</h1>
      <form onSubmit={(e) => void save(e)}>
        <p>
          <label htmlFor="inst-name">Nome da instalação</label>
          <input
            id="inst-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </p>
        <p>
          <label htmlFor="inst-logo">URL do logo</label>
          <input
            id="inst-logo"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://..."
          />
        </p>
        <p>
          <label htmlFor="inst-color">Cor primária</label>
          <input
            id="inst-color"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
          />
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 20,
              height: 20,
              marginLeft: 8,
              verticalAlign: "middle",
              background: primaryColor,
              border: "1px solid var(--border)",
            }}
          />
        </p>
        <button type="submit">Salvar</button>
        {status === "saved" && <p role="status">Identidade salva.</p>}
        {status === "error" && <p role="alert">Erro ao salvar.</p>}
      </form>
    </section>
  );
}
