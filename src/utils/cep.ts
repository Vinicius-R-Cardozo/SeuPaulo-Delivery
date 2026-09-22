/** Consulta de CEP via ViaCEP (gratuito, sem chave). */

export interface CepResult {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

/**
 * Busca o endereço de um CEP. Retorna null quando o CEP não existe ou a
 * consulta falha — o formulário segue funcionando com preenchimento manual.
 */
export async function lookupCep(cep: string): Promise<CepResult | null> {
  const d = cep.replace(/\D/g, '');
  if (d.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      erro?: boolean;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };
    if (data.erro) return null;
    return {
      street: data.logradouro ?? '',
      neighborhood: data.bairro ?? '',
      city: data.localidade ?? '',
      state: data.uf ?? '',
    };
  } catch {
    return null;
  }
}
