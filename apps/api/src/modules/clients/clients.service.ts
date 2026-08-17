import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ClientsRepository } from "./clients.repository";
import { normalizePhoneBR } from "./phone.util";

export interface ClientView {
  id: string;
  name: string;
  phone_whatsapp: string | null;
}

/** Perfil da cliente (Story 4.2) — enriquece a view com observações e cadastro. */
export interface ClientProfileView extends ClientView {
  notes: string | null;
  createdAt: string;
}

export interface ClientListView {
  clients: ClientView[];
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 20;

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
   * Listagem paginada da gestão (Story 4.1, AC1). Exclui deletados (D5). `search`
   * filtra; sem termo → todos (paginado). Defaults: página 1, 20 por página.
   */
  async list(params: {
    search?: string;
    page?: number;
    pageSize?: number;
    /** Recorte por profissional (DL-062): só as clientes que ele atendeu. */
    attendedByProfessionalId?: string;
  }): Promise<ClientListView> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize =
      params.pageSize && params.pageSize > 0
        ? params.pageSize
        : DEFAULT_PAGE_SIZE;
    const { rows, total } = await this.clients.list({
      search: params.search,
      page,
      pageSize,
      attendedByProfessionalId: params.attendedByProfessionalId,
    });
    return { clients: rows.map(toView), total, page, pageSize };
  }

  /** Obter o perfil por id (4.1 AC5 + 4.2) — deletada/fora do tenant → 404 (D5). */
  async getById(id: string): Promise<ClientProfileView> {
    const client = await this.clients.findActiveById(id);
    if (!client) throw new NotFoundException("Cliente não encontrada.");
    return {
      ...toView(client),
      notes: client.notes,
      createdAt: client.created_at.toISOString(),
    };
  }

  /**
   * Edição (AC4). Renormaliza o telefone; colisão com OUTRA cliente → 409 (D3).
   * Telefone vazio remove o WhatsApp e não colide (D6: normalizado null pula a
   * checagem). Cliente deletada/fora do tenant → 404.
   */
  async update(
    id: string,
    input: { name?: string; phone_whatsapp?: string; notes?: string },
  ): Promise<ClientView> {
    const client = await this.clients.findActiveById(id);
    if (!client) throw new NotFoundException("Cliente não encontrada.");

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name === "") throw new BadRequestException("O nome é obrigatório.");
      client.name = name;
    }

    // Observações livres (Story 4.2); vazio remove.
    if (input.notes !== undefined) {
      const notes = input.notes.trim();
      client.notes = notes !== "" ? notes : null;
    }

    if (input.phone_whatsapp !== undefined) {
      const raw = input.phone_whatsapp.trim();
      const normalized = normalizePhoneBR(raw);
      // Só há colisão possível quando há telefone (dois sem telefone não colidem).
      if (normalized) {
        const other = await this.clients.findByNormalizedPhone(normalized, id);
        if (other) {
          throw new ConflictException(
            "Já existe uma cliente com esse WhatsApp.",
          );
        }
      }
      client.phone_whatsapp = raw !== "" ? raw : null;
      client.phone_whatsapp_normalized = normalized;
    }

    const saved = await this.clients.save(client);
    return toView(saved);
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
