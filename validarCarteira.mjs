#!/usr/bin/env node
/**
 * Valida o carteira-processed.json gerado pelo prebuild e, opcionalmente,
 * compara com a versao anterior.
 *
 * Uso:
 *   node validarCarteira.mjs public/data/carteira-processed.json
 *   node validarCarteira.mjs public/data/carteira-processed.json carteira-processed.anterior.json
 *
 * Para gerar o "anterior", antes de rodar o build:
 *   copy public\data\carteira-processed.json carteira-processed.anterior.json
 */

import { readFileSync } from 'node:fs';

const [novoPath, antigoPath] = process.argv.slice(2);
if (!novoPath) {
  console.error('Informe o caminho do carteira-processed.json');
  process.exit(1);
}

const novo = JSON.parse(readFileSync(novoPath, 'utf8'));
const antigo = antigoPath ? JSON.parse(readFileSync(antigoPath, 'utf8')) : null;

const brl = (n) =>
  (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct = (a, b) => (b === 0 ? '—' : `${(((a - b) / b) * 100).toFixed(1)}%`);
const soma = (arr, f) => arr.reduce((s, x) => s + (f(x) ?? 0), 0);

const titulo = (t) => console.log(`\n${'='.repeat(64)}\n${t}\n${'='.repeat(64)}`);
const alertas = [];
const alerta = (msg) => alertas.push(msg);

/* ---------- 1. Metadados ---------- */
titulo('1. METADADOS');
console.log('Arquivo de origem :', novo.nomeArquivo);
console.log('Data-base         :', novo.dataBase);
console.log('Processado em     :', novo.atualizadoEm);
console.log('Fluxo mensal real :', novo.temFluxoMensalReal);
console.log('Projetos          :', novo.projetos.length);

if (antigo && antigo.dataBase === novo.dataBase) {
  alerta(`dataBase continua ${novo.dataBase} — o script pode nao ter lido o Excel novo.`);
}
if (novo.temFluxoMensalReal === false) {
  alerta('temFluxoMensalReal = false — a curva mensal nao foi montada (checar NF_DT_PAGAMENTO).');
}

/* ---------- 2. Integridade por projeto ---------- */
titulo('2. INTEGRIDADE POR PROJETO');

const semCurva = [];
const curvaDivergente = [];
const semGestor = [];
const semAprovador = [];
const orcamentoZero = [];
const compromissoMaiorQueOrcamento = [];
const nomesDuplicados = new Map();

for (const p of novo.projetos) {
  const chave = (p.nome ?? '').trim().toLowerCase();
  nomesDuplicados.set(chave, (nomesDuplicados.get(chave) ?? 0) + 1);

  if (!p.gestor) semGestor.push(p.nome);
  if (!p.aprovador) semAprovador.push(p.nome);
  if (!p.orcamentoPlurianual) orcamentoZero.push(p.nome);

  if (!p.executadoMensal2026) {
    if (p.realizado2026) semCurva.push(p.nome);
  } else {
    const somaCurva = soma(p.executadoMensal2026, (x) => x);
    if (Math.abs(somaCurva - (p.realizado2026 ?? 0)) > 1) {
      curvaDivergente.push({
        nome: p.nome,
        curva: somaCurva,
        realizado: p.realizado2026 ?? 0,
      });
    }
  }

  if ((p.compromisso ?? 0) > (p.orcamentoPlurianual ?? 0) && p.orcamentoPlurianual) {
    compromissoMaiorQueOrcamento.push({
      nome: p.nome,
      compromisso: p.compromisso,
      orcamento: p.orcamentoPlurianual,
    });
  }
}

const dups = [...nomesDuplicados.entries()].filter(([, n]) => n > 1);

console.log('Projetos sem curva mas com realizado :', semCurva.length);
console.log('Curva != realizado2026              :', curvaDivergente.length);
console.log('Sem gestor                          :', semGestor.length);
console.log('Sem aprovador                       :', semAprovador.length);
console.log('Orcamento plurianual zerado         :', orcamentoZero.length);
console.log('Compromisso > orcamento             :', compromissoMaiorQueOrcamento.length);
console.log('Nomes duplicados                    :', dups.length);

if (curvaDivergente.length) {
  console.log('\n  -> curva mensal que nao fecha com realizado2026:');
  for (const c of curvaDivergente.slice(0, 10)) {
    console.log(`     ${c.nome.slice(0, 40).padEnd(42)} curva ${brl(c.curva)}  realizado ${brl(c.realizado)}`);
  }
  if (curvaDivergente.length > 10) console.log(`     ... e mais ${curvaDivergente.length - 10}`);
  alerta(`${curvaDivergente.length} projetos com curva mensal divergente do realizado.`);
}
if (dups.length) {
  console.log('\n  -> nomes repetidos:', dups.map(([n]) => n).slice(0, 10).join(' | '));
  alerta(`${dups.length} nomes de projeto duplicados.`);
}

/* ---------- 3. Cobertura entre abas ---------- */
titulo('3. COBERTURA ENTRE AS ABAS');
const so = novo.projetosSoOrcamento ?? [];
const sr = novo.projetosSoRealizado ?? [];
console.log('So na aba Orcamento (sem realizado) :', so.length);
console.log('So na aba Realizado (sem orcamento) :', sr.length);

if (antigo) {
  const soAnt = (antigo.projetosSoOrcamento ?? []).length;
  const srAnt = (antigo.projetosSoRealizado ?? []).length;
  console.log(`   (anterior: ${soAnt} / ${srAnt})`);
  if (so.length > soAnt * 1.5 + 2 || sr.length > srAnt * 1.5 + 2) {
    alerta('Projetos orfaos cresceram muito — provavel divergencia de NomeLB entre as abas.');
  }
}
if (so.length) console.log('\n  so orcamento:', so.slice(0, 15).join(' | '));
if (sr.length) console.log('\n  so realizado:', sr.slice(0, 15).join(' | '));

/* ---------- 4. Linhas ignoradas ---------- */
titulo('4. LINHAS IGNORADAS NO PARSE');
const motivos = new Map();
for (const l of novo.linhasIgnoradas ?? []) {
  const k = `${l.aba} :: ${l.motivo}`;
  motivos.set(k, (motivos.get(k) ?? 0) + 1);
}
const motivosConhecidos = [
  'Sem DT_REQ_APROV nem DT_REQ',
  'Projeto nao encontrado na aba nova',
  'Projeto não encontrado na aba nova',
  'NomeLB vazio',
];
for (const [k, v] of [...motivos.entries()].sort((a, b) => b[1] - a[1])) {
  const conhecido = motivosConhecidos.some((m) => k.includes(m));
  console.log(`${String(v).padStart(7)}  ${conhecido ? ' ' : '!'} ${k}`);
  if (!conhecido) alerta(`Motivo de descarte novo: ${k}`);
}

/* ---------- 5. Totais por plataforma ---------- */
titulo('5. TOTAIS POR PLATAFORMA (N4)');
const porN4 = (dados) => {
  const m = new Map();
  for (const p of dados.projetos) {
    const k = p.n4Curta ?? p.n4 ?? '(sem N4)';
    const acc = m.get(k) ?? { n: 0, orc: 0, orc26: 0, real26: 0, pgto26: 0, comp: 0 };
    acc.n += 1;
    acc.orc += p.orcamentoPlurianual ?? 0;
    acc.orc26 += p.orcamento2026 ?? 0;
    acc.real26 += p.realizado2026 ?? 0;
    acc.pgto26 += p.emPagamento2026 ?? 0;
    acc.comp += p.compromisso ?? 0;
    m.set(k, acc);
  }
  return m;
};
const n4Novo = porN4(novo);
const n4Ant = antigo ? porN4(antigo) : null;

for (const [k, v] of n4Novo) {
  console.log(`\n${k}  (${v.n} projetos)`);
  console.log(`  Orcamento plurianual : ${brl(v.orc)}`);
  console.log(`  Orcamento 2026       : ${brl(v.orc26)}`);
  console.log(`  Realizado 2026       : ${brl(v.real26)}`);
  console.log(`  Em pagamento 2026    : ${brl(v.pgto26)}`);
  console.log(`  Compromisso          : ${brl(v.comp)}`);
  console.log(`  A emitir (calc)      : ${brl(v.orc26 - v.real26 - v.pgto26 - v.comp)}`);
  const a = n4Ant?.get(k);
  if (a) {
    console.log(`  var. realizado 2026  : ${pct(v.real26, a.real26)}  (antes ${brl(a.real26)})`);
    if (v.real26 < a.real26 - 1) {
      alerta(`${k}: realizado 2026 caiu de ${brl(a.real26)} para ${brl(v.real26)} — realizado nao deveria retroceder.`);
    }
  }
}

/* ---------- 6. Diff projeto a projeto ---------- */
if (antigo) {
  titulo('6. DIFF CONTRA A VERSAO ANTERIOR');
  const mapa = (d) => new Map(d.projetos.map((p) => [p.id ?? p.nome, p]));
  const a = mapa(antigo);
  const b = mapa(novo);

  const entraram = [...b.keys()].filter((k) => !a.has(k));
  const sairam = [...a.keys()].filter((k) => !b.has(k));

  console.log(`Projetos que entraram : ${entraram.length}`);
  console.log(`Projetos que sairam   : ${sairam.length}`);
  if (entraram.length) {
    console.log('\n  entraram:');
    for (const k of entraram.slice(0, 30)) console.log('   +', b.get(k).nome);
    if (entraram.length > 30) console.log(`   ... e mais ${entraram.length - 30}`);
  }
  if (sairam.length) {
    console.log('\n  sairam:');
    for (const k of sairam.slice(0, 30)) console.log('   -', a.get(k).nome);
    if (sairam.length > 30) console.log(`   ... e mais ${sairam.length - 30}`);
    alerta(`${sairam.length} projetos sumiram em relacao a versao anterior.`);
  }

  const mudancas = [];
  for (const [k, p] of b) {
    const q = a.get(k);
    if (!q) continue;
    const campos = ['orcamentoPlurianual', 'orcamento2026', 'realizado2026', 'emPagamento2026', 'compromisso'];
    for (const c of campos) {
      const dif = (p[c] ?? 0) - (q[c] ?? 0);
      if (Math.abs(dif) > 1) mudancas.push({ nome: p.nome, campo: c, de: q[c] ?? 0, para: p[c] ?? 0, dif });
    }
  }
  mudancas.sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif));
  console.log(`\nMaiores variacoes (${mudancas.length} campos alterados):`);
  for (const m of mudancas.slice(0, 25)) {
    console.log(
      `  ${m.nome.slice(0, 32).padEnd(34)} ${m.campo.padEnd(20)} ${brl(m.de).padStart(16)} -> ${brl(m.para).padStart(16)}  (${m.dif > 0 ? '+' : ''}${brl(m.dif)})`
    );
  }
}

/* ---------- 7. Resumo ---------- */
titulo('RESUMO');
if (!alertas.length) {
  console.log('Nenhum alerta. JSON consistente para publicar.');
} else {
  console.log(`${alertas.length} ponto(s) para revisar antes do push:\n`);
  alertas.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
}
console.log();
