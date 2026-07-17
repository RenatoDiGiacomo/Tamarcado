import { Injectable } from "@nestjs/common";
import { ClientsRepository } from "./clients.repository";
import { normalizePhoneBR } from "./phone.util";

export interface ClientView {
  id: string;
  name: string;
  phone_whatsapp: string | null;
}

/**
 * Clientes — busca + cadastro inline (Story 3.3). Sem gestão completa (Épico 4).
 * Tudo tenant-scoped via `ClientsRepository`.
 */
@Injectable()
export class ClientsService {
  constructor(private readonly clients: ClientsRepository) {}

  /** Autocomplete: vazio/curto → lista vazia; senão busca por nome/telefone. */
  async search(term: string | undefined): Promise<ClientView[]> {
    const trimmed = (term ?? "").trim();
    if (trimmed.length === 0) return [];
    const rows = await this.clients.search(trimmed);
    return rows.map(toView);
  }

  /**
   * Cadastro inline (FR-D7). WhatsApp opcional → normalizado (E.164). Se já existe
   * cliente com o mesmo telefone normalizado, retorna o existente (idempotente) —
   * evita estourar a UNIQUE e duplicar no encaixe rápido.
   */
  async create(input: {
    name: string;
    phone_whatsapp?: string;
  }): Promise<ClientView> {
    const normalized = normalizePhoneBR(input.phone_whatsapp);
    if (normalized) {
      const existing = await this.clients.findOne({
        where: { phone_whatsapp_normalized: normalized, is_deleted: false },
      });
      if (existing) return toView(existing);
    }
    const saved = await this.clients.save({
      name: input.name.trim(),
      phone_whatsapp: input.phone_whatsapp?.trim() || null,
      phone_whatsapp_normalized: normalized,
    });
    return toView(saved);
  }
}

function toView(c: {
  id: string;
  name: string;
  phone_whatsapp: string | null;
}): ClientView {
  return { id: String(c.id), name: c.name, phone_whatsapp: c.phone_whatsapp };
}
