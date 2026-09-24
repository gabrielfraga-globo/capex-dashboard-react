/** Máscara dd/mm/aa para o campo de entrega. Ano de 2 dígitos assumido como 20xx. */

/** Formata os dígitos já validados/typed em dd/mm/aa, inserindo as barras. */
export function aplicarMascaraData(valorDigitado: string): string {
  const digitos = valorDigitado.replace(/\D/g, "").slice(0, 6);
  const dd = digitos.slice(0, 2);
  const mm = digitos.slice(2, 4);
  const aa = digitos.slice(4, 6);
  let saida = dd;
  if (digitos.length > 2) saida += `/${mm}`;
  if (digitos.length > 4) saida += `/${aa}`;
  return saida;
}

/** dd/mm/aa completo e válido → ISO yyyy-mm-dd. Incompleto, inválido ou fora do intervalo de operação → null. */
export function mascaraParaIso(masked: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(masked);
  if (!match) return null;
  const [, ddStr, mmStr, aaStr] = match;
  const dia = Number(ddStr);
  const mes = Number(mmStr);
  const ano = 2000 + Number(aaStr);
  if (ano < 2020 || ano > 2030) return null;
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) {
    return null;
  }
  return `${ano}-${mmStr}-${ddStr}`;
}

/** ISO yyyy-mm-dd → dd/mm/aa, para preencher o input a partir da curadoria salva. */
export function isoParaMascara(iso: string | null | undefined): string {
  if (!iso) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "";
  const [, ano, mes, dia] = match;
  return `${dia}/${mes}/${ano.slice(2)}`;
}
