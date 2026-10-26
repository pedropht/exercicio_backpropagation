(function () {
  "use strict";

  const motor = window.RedeNeuralDidatica;
  const graficos = window.VisualizacoesRNA;
  const porId = (id) => document.getElementById(id);
  const estado = {
    rede: null,
    preparacao: null,
    epoca: 0,
    executando: false,
    quadroAnimacao: null,
    historico: [],
    ultimosGradientes: null,
    passagemAcompanhada: null,
    gradientesExemplo: null,
    avaliacaoTreino: null,
    avaliacaoTeste: null,
    etapa: "entrada",
    parametros: [],
    parametroInspecionado: null,
    atualizacaoInspecionada: null,
    superficie: null,
    trajetoriaParametros: [],
    indiceFlorSelecionada: null,
    entradaClassificacao: null,
    passagemClassificacao: null,
    projecao: "2d",
    rotacao: { x: -0.35, y: 0.65 },
    modo: "normal",
    depurador: null,
    estadoDepuracao: null,
    temporizadorDepuracao: null,
    depuracaoAutomatica: false,
    inspetorAberto: true,
  };

  function formatarNumero(valor, casas = 5) {
    if (!Number.isFinite(valor)) return "—";
    if (Math.abs(valor) > 0 && Math.abs(valor) < 0.0001) return valor.toExponential(2);
    return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  }

  function definirStatus(mensagem) {
    porId("status-aplicacao").textContent = mensagem;
  }

  function criarLinhaCamada(neuronios = 8, ativacao = "sigmoide") {
    const linha = document.createElement("div");
    linha.className = "linha-camada";
    linha.innerHTML = `
      <input class="quantidade-neuronios" type="number" min="1" max="16" value="${neuronios}" aria-label="Neurônios da camada">
      <select class="funcao-ativacao" aria-label="Função de ativação">
        <option value="sigmoide" ${ativacao === "sigmoide" ? "selected" : ""}>sigmoide</option>
        <option value="tanh" ${ativacao === "tanh" ? "selected" : ""}>tanh</option>
        <option value="relu" ${ativacao === "relu" ? "selected" : ""}>ReLU</option>
      </select>
      <button class="botao-icone remover-camada" aria-label="Remover camada">−</button>`;
    linha.querySelectorAll("input, select").forEach((controle) => controle.addEventListener("change", reiniciarExperimento));
    linha.querySelector(".remover-camada").addEventListener("click", () => {
      if (porId("editor-camadas").children.length <= 1) return;
      linha.remove();
      reiniciarExperimento();
    });
    return linha;
  }

  function lerArquitetura() {
    const linhas = [...porId("editor-camadas").children];
    const ocultas = linhas.map((linha) => Math.max(1, Math.min(16, Number(linha.querySelector("input").value) || 1)));
    const ativacoes = linhas.map((linha) => linha.querySelector("select").value);
    return { arquitetura: [4, ...ocultas, 3], ativacoes };
  }

  function preencherSeletoresAtributos() {
    ["atributo-x", "atributo-y", "atributo-z"].forEach((id) => {
      const seletor = porId(id);
      seletor.replaceChildren();
      NOMES_ATRIBUTOS_IRIS.forEach((nome, indice) => seletor.add(new Option(nome, indice)));
    });
    porId("atributo-x").value = "2";
    porId("atributo-y").value = "3";
    porId("atributo-z").value = "0";
  }

  function preencherCamposFlor() {
    const recipiente = porId("campos-flor");
    recipiente.replaceChildren();
    NOMES_ATRIBUTOS_IRIS.forEach((nome, indice) => {
      const label = document.createElement("label");
      label.className = "campo-flor";
      label.innerHTML = `<span>${nome} (cm)</span><input type="number" min="0" max="10" step="0.1" data-atributo="${indice}">`;
      label.querySelector("input").addEventListener("input", () => {
        estado.indiceFlorSelecionada = null;
        classificarEntradaDosCampos();
      });
      recipiente.appendChild(label);
    });
  }

  function preencherExemplos() {
    const seletorTreino = porId("exemplo-acompanhado");
    seletorTreino.replaceChildren();
    estado.preparacao.treino.indices.forEach((indiceOriginal, posicao) => {
      const item = DADOS_IRIS[indiceOriginal];
      seletorTreino.add(new Option(`#${indiceOriginal + 1} · ${item.nomeClasse}`, posicao));
    });

    const seletorTeste = porId("seletor-flor-teste");
    seletorTeste.replaceChildren();
    estado.preparacao.teste.indices.forEach((indiceOriginal, posicao) => {
      const item = DADOS_IRIS[indiceOriginal];
      seletorTeste.add(new Option(`#${indiceOriginal + 1} · ${item.nomeClasse}`, posicao));
    });
    seletorTeste.value = "0";
    selecionarFlorTeste(0);
  }

  function preencherSeletoresParametros() {
    estado.parametros = motor.listarParametros(estado.rede);
    ["parametro-eixo-x", "parametro-eixo-y"].forEach((id) => {
      const seletor = porId(id);
      seletor.replaceChildren();
      estado.parametros.forEach((parametro, indice) => seletor.add(new Option(parametro.rotulo, indice)));
    });
    porId("parametro-eixo-x").value = "0";
    porId("parametro-eixo-y").value = String(Math.min(1, estado.parametros.length - 1));
    estado.parametroInspecionado = estado.parametros[0];

    const seletorCamada = porId("seletor-camada-pesos");
    seletorCamada.replaceChildren();
    estado.rede.pesos.forEach((_, indice) => seletorCamada.add(new Option(`W${indice + 1} · camada ${indice + 1}`, indice)));
  }

  function parametroSelecionado(id) {
    return estado.parametros[Number(porId(id).value)];
  }

  function registrarPontoParametros() {
    const parametroX = parametroSelecionado("parametro-eixo-x");
    const parametroY = parametroSelecionado("parametro-eixo-y");
    if (!parametroX || !parametroY) return;
    estado.trajetoriaParametros.push({
      epoca: estado.epoca,
      x: motor.obterParametro(estado.rede, parametroX),
      y: motor.obterParametro(estado.rede, parametroY),
    });
    if (estado.trajetoriaParametros.length > 800) estado.trajetoriaParametros.shift();
  }

  function atualizarCalculosVisiveis() {
    estado.avaliacaoTreino = motor.avaliar(estado.preparacao.treino.entradas, estado.preparacao.treino.saidas, estado.rede);
    estado.avaliacaoTeste = motor.avaliar(estado.preparacao.teste.entradas, estado.preparacao.teste.saidas, estado.rede);
    const posicao = Number(porId("exemplo-acompanhado").value) || 0;
    estado.passagemAcompanhada = motor.passagemParaFrente(estado.preparacao.treino.entradas[posicao], estado.rede);
    estado.gradientesExemplo = motor.retropropagar(
      estado.preparacao.treino.saidas[posicao],
      estado.rede,
      estado.passagemAcompanhada
    );
  }

  function reiniciarExperimento() {
    pausarTreinamento();
    pausarDepuracao();
    const { arquitetura, ativacoes } = lerArquitetura();
    const semente = Number(porId("semente").value) || 42;
    estado.preparacao = motor.prepararDadosIris(DADOS_IRIS, 0.2, semente);
    estado.rede = motor.inicializarRede(arquitetura, ativacoes, semente);
    estado.epoca = 0;
    estado.etapa = "entrada";
    estado.atualizacaoInspecionada = null;
    estado.ultimosGradientes = null;
    estado.historico = [];
    estado.superficie = null;
    estado.trajetoriaParametros = [];
    preencherExemplos();
    preencherSeletoresParametros();
    registrarPontoParametros();
    if (estado.modo === "normal") {
      estado.ultimosGradientes = motor.calcularGradientesMedios(
        estado.preparacao.treino.entradas,
        estado.preparacao.treino.saidas,
        estado.rede
      );
      estado.historico = [{ epoca: 0, perda: estado.ultimosGradientes.perdaMedia }];
      atualizarCalculosVisiveis();
    } else {
      estado.avaliacaoTreino = null;
      estado.avaliacaoTeste = null;
      estado.passagemAcompanhada = null;
      estado.gradientesExemplo = null;
      criarDepurador();
    }
    atualizarEtapaVisual("entrada");
    renderizarTudo();
    definirStatus(`Rede ${arquitetura.join("–")} inicializada com semente ${semente}.`);
    if (estado.modo === "normal") window.setTimeout(recalcularSuperficie, 20);
  }

  function executarUmaEpoca(renderizar = true) {
    const taxa = Number(porId("taxa-aprendizagem").value);
    const parametro = estado.parametroInspecionado || estado.parametros[0];
    const valorAnterior = motor.obterParametro(estado.rede, parametro);
    const gradientes = motor.calcularGradientesMedios(
      estado.preparacao.treino.entradas,
      estado.preparacao.treino.saidas,
      estado.rede
    );
    const gradienteParametro = motor.obterGradiente(gradientes, parametro);
    motor.atualizarParametros(estado.rede, gradientes, taxa);
    estado.epoca += 1;
    estado.ultimosGradientes = gradientes;
    estado.atualizacaoInspecionada = {
      parametro,
      anterior: valorAnterior,
      gradiente: gradienteParametro,
      taxa,
      novo: motor.obterParametro(estado.rede, parametro),
    };
    const alvo = Math.max(1, Number(porId("quantidade-epocas").value) || 1);
    const intervalo = Math.max(1, Math.ceil(alvo / 600));
    if (estado.epoca % intervalo === 0 || estado.epoca === alvo) {
      estado.historico.push({ epoca: estado.epoca, perda: gradientes.perdaMedia });
      registrarPontoParametros();
    }
    if (renderizar) {
      atualizarEtapaVisual("atualizacao");
      atualizarCalculosVisiveis();
      renderizarTudo();
    }
  }

  function alternarTreinamento() {
    if (estado.executando) {
      pausarTreinamento();
      definirStatus(`Treinamento pausado na época ${estado.epoca}.`);
      return;
    }
    const alvo = Math.max(1, Number(porId("quantidade-epocas").value) || 1);
    if (estado.epoca >= alvo) reiniciarExperimento();
    estado.executando = true;
    porId("botao-executar").textContent = "Ⅱ Pausar";
    porId("estado-treinamento").textContent = "treinando";
    atualizarEtapaVisual("frente");
    definirStatus("Calculando gradientes médios e atualizando os parâmetros…");
    estado.quadroAnimacao = requestAnimationFrame(executarQuadroTreinamento);
  }

  function executarQuadroTreinamento() {
    if (!estado.executando) return;
    const alvo = Math.max(1, Number(porId("quantidade-epocas").value) || 1);
    const porQuadro = Number(porId("epocas-por-quadro").value) || 1;
    const quantidade = Math.min(porQuadro, alvo - estado.epoca);
    for (let repeticao = 0; repeticao < quantidade; repeticao += 1) executarUmaEpoca(false);
    atualizarCalculosVisiveis();
    renderizarTudo();
    if (estado.epoca >= alvo) {
      pausarTreinamento();
      atualizarEtapaVisual("atualizacao");
      definirStatus(`Treinamento concluído: ${estado.epoca} épocas, ${(estado.avaliacaoTeste.acuracia * 100).toFixed(1)}% no teste.`);
      recalcularSuperficie();
      return;
    }
    estado.etapa = estado.etapa === "frente" ? "tras" : "frente";
    estado.quadroAnimacao = requestAnimationFrame(executarQuadroTreinamento);
  }

  function pausarTreinamento() {
    estado.executando = false;
    if (estado.quadroAnimacao) cancelAnimationFrame(estado.quadroAnimacao);
    estado.quadroAnimacao = null;
    porId("botao-executar").textContent = "▶ Treinar";
    porId("estado-treinamento").textContent = estado.epoca ? "pausado" : "rede inicializada";
  }

  function atualizarEtapaVisual(etapa) {
    estado.etapa = etapa;
    document.querySelectorAll("#etapas-fluxo button").forEach((botao) => {
      botao.classList.toggle("ativa", botao.dataset.etapa === etapa);
    });
    if (estado.rede) renderizarRede();
  }

  function mostrarDetalhe(elemento) {
    const detalhe = porId("detalhe-neuronio");
    if (elemento.tipo === "peso") {
      if (estado.modo === "debug" && !estado.estadoDepuracao?.contexto?.pesosVisiveis) {
        detalhe.textContent = "Os pesos ainda não foram inicializados no fluxo observável.";
        return;
      }
      estado.parametroInspecionado = { ...elemento, rotulo: `W${elemento.camada + 1}[${elemento.neuronio + 1},${elemento.anterior + 1}]` };
      const valor = motor.obterParametro(estado.rede, elemento);
      const gradiente = estado.ultimosGradientes ? motor.obterGradiente(estado.ultimosGradientes, elemento) : 0;
      detalhe.innerHTML = `<strong>${estado.parametroInspecionado.rotulo}</strong> = ${formatarNumero(valor, 6)} · gradiente médio = ${formatarNumero(gradiente, 6)}`;
      renderizarMapaPesos();
      return;
    }
    const { camada, neuronio } = elemento;
    const ativacao = estado.passagemAcompanhada?.ativacoes?.[camada]?.[neuronio];
    if (!Number.isFinite(ativacao)) {
      detalhe.textContent = "Este valor ainda não foi calculado no passo atual.";
      return;
    }
    if (camada === 0) {
      detalhe.innerHTML = `<strong>Entrada a₀[${neuronio + 1}]</strong> = ${formatarNumero(ativacao, 4)} (valor padronizado)`;
      return;
    }
    const z = estado.passagemAcompanhada.combinacoesLineares?.[camada - 1]?.[neuronio];
    const vies = estado.rede.vieses[camada - 1][neuronio][0];
    const delta = estado.gradientesExemplo?.deltas?.[camada - 1]?.[neuronio];
    detalhe.innerHTML = `<strong>Camada ${camada}, neurônio ${neuronio + 1}</strong> · z = ${formatarNumero(z, 4)} · a = ${formatarNumero(ativacao, 4)} · b = ${formatarNumero(vies, 4)}${Number.isFinite(delta) ? ` · δ do exemplo = ${formatarNumero(delta, 6)}` : ""}`;
  }

  function renderizarRede() {
    const depuracao = estado.estadoDepuracao;
    const destaque = estado.modo === "debug"
      ? { ...depuracao?.operacao?.destaque, parametrosOcultos: !depuracao?.contexto?.pesosVisiveis }
      : {};
    graficos.desenharRede(
      porId("grafico-rede"),
      estado.rede,
      estado.passagemAcompanhada,
      estado.gradientesExemplo,
      estado.etapa,
      mostrarDetalhe,
      destaque
    );
  }

  function renderizarMapaPesos() {
    const camada = Number(porId("seletor-camada-pesos").value) || 0;
    const pesosVisiveis = estado.modo !== "debug" || estado.estadoDepuracao?.contexto?.pesosVisiveis;
    graficos.desenharMapaPesos(porId("mapa-pesos"), pesosVisiveis ? estado.rede.pesos[camada] : null);
    const atualizacao = estado.atualizacaoInspecionada;
    const contextoDebug = estado.estadoDepuracao?.contexto;
    const gradienteDebug = contextoDebug?.gradientesMedios?.gradientesPesos?.[0]?.[0]?.[0];
    const anteriorDebug = contextoDebug?.parametrosAntes?.pesos?.[0]?.[0]?.[0];
    const novoDebug = contextoDebug?.parametrosDepois?.pesos?.[0]?.[0]?.[0];
    porId("equacao-atualizacao").innerHTML = atualizacao
      ? `<b>${atualizacao.parametro.rotulo}</b>: ${formatarNumero(atualizacao.anterior, 5)} − ${formatarNumero(atualizacao.taxa, 2)} × (${formatarNumero(atualizacao.gradiente, 6)}) = <b>${formatarNumero(atualizacao.novo, 5)}</b>`
      : Number.isFinite(anteriorDebug)
        ? `<b>W1[1,1]</b>: ${formatarNumero(anteriorDebug, 5)} − ${formatarNumero(Number(porId("taxa-aprendizagem").value), 2)} × (${formatarNumero(gradienteDebug, 6)}) = <b>${formatarNumero(novoDebug, 5)}</b>`
        : "A atualização aparecerá somente depois de sua operação no depurador.";
  }

  function renderizarMetricas() {
    porId("metrica-epoca").textContent = estado.epoca.toLocaleString("pt-BR");
    const perdaDebug = estado.estadoDepuracao?.contexto?.perdaMedia;
    const perdaAtual = estado.avaliacaoTreino?.perdaMedia ?? perdaDebug;
    porId("metrica-perda").textContent = formatarNumero(perdaAtual, 6);
    porId("metrica-acuracia-treino").textContent = estado.avaliacaoTreino
      ? `${(estado.avaliacaoTreino.acuracia * 100).toFixed(1)}%` : "—";
    porId("metrica-acuracia-teste").textContent = estado.avaliacaoTeste
      ? `${(estado.avaliacaoTeste.acuracia * 100).toFixed(1)}%` : "—";
    const inicial = estado.historico[0]?.perda;
    const atual = perdaAtual;
    const selo = porId("variacao-perda");
    selo.textContent = Number.isFinite(inicial) && Number.isFinite(atual) && estado.epoca
      ? `${((1 - atual / inicial) * 100).toFixed(1)}% menor` : (Number.isFinite(atual) ? "lote atual" : "aguardando");
    selo.classList.toggle("bom", Number.isFinite(inicial) && atual < inicial);
  }

  function renderizarSuperficie() {
    const parametroX = parametroSelecionado("parametro-eixo-x");
    const parametroY = parametroSelecionado("parametro-eixo-y");
    if (!parametroX || !parametroY) return;
    const ponto = {
      x: motor.obterParametro(estado.rede, parametroX),
      y: motor.obterParametro(estado.rede, parametroY),
    };
    const taxa = Number(porId("taxa-aprendizagem").value);
    const vetor = estado.ultimosGradientes ? {
      x: -taxa * motor.obterGradiente(estado.ultimosGradientes, parametroX),
      y: -taxa * motor.obterGradiente(estado.ultimosGradientes, parametroY),
    } : null;
    graficos.desenharSuperficie(porId("grafico-gradiente"), estado.superficie, estado.trajetoriaParametros, ponto, vetor);
  }

  function recalcularSuperficie() {
    if (!estado.rede) return;
    if (estado.modo === "debug") {
      definirStatus("O corte da perda fica suspenso no modo debug para não executar cálculos fora do passo atual.");
      return;
    }
    const parametroX = parametroSelecionado("parametro-eixo-x");
    const parametroY = parametroSelecionado("parametro-eixo-y");
    if (!parametroX || !parametroY || parametroX === parametroY) {
      definirStatus("Escolha dois parâmetros diferentes para o corte da perda.");
      return;
    }
    estado.superficie = null;
    renderizarSuperficie();
    definirStatus("Recalculando o corte local da função de perda…");
    requestAnimationFrame(() => {
      estado.superficie = graficos.calcularSuperficie(
        estado.rede,
        estado.preparacao.treino.entradas,
        estado.preparacao.treino.saidas,
        parametroX,
        parametroY
      );
      renderizarSuperficie();
      definirStatus("Corte local da perda atualizado.");
    });
  }

  function renderizarTreinamento() {
    renderizarMetricas();
    renderizarRede();
    graficos.desenharCurvaPerda(
      porId("grafico-perda"),
      estado.modo === "normal" && estado.avaliacaoTreino
        ? [...estado.historico, { epoca: estado.epoca, perda: estado.avaliacaoTreino.perdaMedia }]
        : estado.historico,
      Math.max(estado.epoca, Number(porId("quantidade-epocas").value) || 1)
    );
    renderizarMapaPesos();
    if (estado.modo === "normal") renderizarSuperficie();
    else graficos.desenharSuperficie(porId("grafico-gradiente"), null, [], null, null);
  }

  function selecionarFlorTeste(posicao) {
    const indiceOriginal = estado.preparacao.teste.indices[posicao];
    const item = DADOS_IRIS[indiceOriginal];
    estado.indiceFlorSelecionada = indiceOriginal;
    [...porId("campos-flor").querySelectorAll("input")].forEach((input, atributo) => {
      input.value = item.atributos[atributo];
    });
    classificarEntradaDosCampos();
  }

  function classificarEntradaDosCampos() {
    if (!estado.rede) return;
    const entrada = [...porId("campos-flor").querySelectorAll("input")].map((input) => Number(input.value));
    if (entrada.some((valor) => !Number.isFinite(valor))) return;
    estado.entradaClassificacao = entrada;
    estado.passagemClassificacao = motor.passagemParaFrente(estado.preparacao.padronizar(entrada), estado.rede);
    renderizarResultadoClassificacao();
    if (porId("visao-classificacao").classList.contains("ativo")) renderizarGraficosClassificacao();
  }

  function renderizarResultadoClassificacao() {
    if (!estado.passagemClassificacao) return;
    const saida = estado.passagemClassificacao.saida;
    const classe = motor.indiceMaiorValor(saida);
    porId("classe-predita").textContent = NOMES_CLASSES_IRIS[classe];
    const item = estado.indiceFlorSelecionada == null ? null : DADOS_IRIS[estado.indiceFlorSelecionada];
    porId("classe-esperada").textContent = item
      ? `Esperada: ${item.nomeClasse} · ${classe === item.classe ? "classificação correta" : "classificação divergente"}`
      : "Entrada manual: não há classe esperada.";
    const recipiente = porId("barras-saida");
    recipiente.replaceChildren();
    saida.forEach((valor, indice) => {
      const linha = document.createElement("div");
      linha.className = "barra-saida";
      linha.innerHTML = `<span>${NOMES_CLASSES_IRIS[indice]}</span><div class="trilho-barra"><div class="preenchimento-barra" style="width:${valor * 100}%;background:${graficos.CORES_CLASSES[indice]}"></div></div><strong>${valor.toFixed(3)}</strong>`;
      recipiente.appendChild(linha);
    });
  }

  function renderizarMatrizConfusao() {
    const matriz = Array.from({ length: 3 }, () => Array(3).fill(0));
    estado.avaliacaoTeste.predicoes.forEach((predicao) => {
      matriz[predicao.classeEsperada][predicao.classePredita] += 1;
    });
    const recipiente = porId("matriz-confusao");
    recipiente.replaceChildren();
    recipiente.appendChild(criarCelulaMatriz("E \ P"));
    NOMES_CLASSES_IRIS.forEach((nome) => recipiente.appendChild(criarCelulaMatriz(nome.slice(0, 5))));
    matriz.forEach((linha, esperado) => {
      recipiente.appendChild(criarCelulaMatriz(NOMES_CLASSES_IRIS[esperado].slice(0, 5)));
      linha.forEach((valor, predito) => {
        const celula = criarCelulaMatriz(String(valor), `valor ${esperado === predito ? "diagonal" : ""}`);
        celula.style.setProperty("--intensidade", String(.04 + valor / 12 * .28));
        recipiente.appendChild(celula);
      });
    });
    const erros = estado.avaliacaoTeste.predicoes.filter((predicao) => predicao.classeEsperada !== predicao.classePredita);
    porId("resumo-teste").textContent = `${(estado.avaliacaoTeste.acuracia * 100).toFixed(1)}% de acurácia`;
    porId("resumo-teste").classList.toggle("bom", estado.avaliacaoTeste.acuracia >= .9);
    porId("lista-erros").innerHTML = erros.length
      ? `<strong>${erros.length} divergência(s)</strong> entre as 30 flores de teste.`
      : "Nenhuma divergência nas 30 flores de teste.";
  }

  function criarCelulaMatriz(texto, classes = "") {
    const celula = document.createElement("div");
    celula.className = `celula-matriz ${classes}`;
    celula.textContent = texto;
    return celula;
  }

  function renderizarGraficosClassificacao() {
    const filtro = porId("filtro-paralelas").value;
    const itens = filtro === "teste"
      ? estado.preparacao.teste.indices.map((indice) => DADOS_IRIS[indice])
      : DADOS_IRIS;
    const predicoes = filtro === "teste" ? estado.avaliacaoTeste.predicoes : null;
    const limites = graficos.limitesAtributos(DADOS_IRIS);
    graficos.desenharParalelas(
      porId("grafico-paralelas"),
      itens,
      limites.minimos,
      limites.maximos,
      estado.indiceFlorSelecionada,
      predicoes
    );
    const eixoX = Number(porId("atributo-x").value);
    let eixoY = Number(porId("atributo-y").value);
    let eixoZ = Number(porId("atributo-z").value);
    if (eixoY === eixoX) {
      eixoY = (eixoX + 1) % 4;
      porId("atributo-y").value = String(eixoY);
    }
    if (estado.projecao === "3d" && (eixoZ === eixoX || eixoZ === eixoY)) {
      eixoZ = [0, 1, 2, 3].find((atributo) => atributo !== eixoX && atributo !== eixoY);
      porId("atributo-z").value = String(eixoZ);
    }
    if (estado.projecao === "2d") {
      graficos.desenharProjecao2d(
        porId("grafico-projecao"), DADOS_IRIS, estado.rede, estado.preparacao,
        eixoX, eixoY, estado.entradaClassificacao, estado.indiceFlorSelecionada
      );
    } else {
      graficos.desenharProjecao3d(
        porId("grafico-projecao"), DADOS_IRIS, estado.rede, estado.preparacao,
        [eixoX, eixoY, eixoZ], estado.entradaClassificacao, estado.indiceFlorSelecionada, estado.rotacao
      );
    }
    renderizarMatrizConfusao();
  }

  function renderizarTudo() {
    if (!estado.rede) return;
    if (porId("visao-treinamento").classList.contains("ativo")) renderizarTreinamento();
    if (porId("visao-classificacao").classList.contains("ativo")) {
      renderizarResultadoClassificacao();
      renderizarGraficosClassificacao();
    }
  }

  function criarDepurador() {
    const indiceExemplo = Number(porId("exemplo-acompanhado").value) || 0;
    estado.depurador = new window.DepuradorRNA.ControladorDepuracao({
      rede: estado.rede,
      entradas: estado.preparacao.treino.entradas,
      saidasEsperadas: estado.preparacao.treino.saidas,
      taxaAprendizagem: Number(porId("taxa-aprendizagem").value),
      semente: Number(porId("semente").value) || 42,
      indiceExemplo,
    });
    estado.estadoDepuracao = estado.depurador.obterEstado();
    atualizarInterfaceDepuracao();
  }

  function etapaVisualDaFase(fase) {
    return {
      inicializacao: "entrada",
      forward: "frente",
      perda: "perda",
      backward: "tras",
      atualizacao: "atualizacao",
    }[fase] || "entrada";
  }

  function sincronizarEstadoDepuracao(novoEstado) {
    estado.estadoDepuracao = novoEstado;
    estado.rede = novoEstado.rede;
    estado.epoca = novoEstado.epoca;
    const contexto = novoEstado.contexto;
    const indiceExemplo = estado.depurador.indiceExemplo;
    estado.passagemAcompanhada = contexto.passagens?.[indiceExemplo] || null;
    estado.gradientesExemplo = contexto.deltasPorExemplo
      ? { deltas: contexto.deltasPorExemplo[indiceExemplo] }
      : null;
    estado.ultimosGradientes = contexto.gradientesMedios || null;
    estado.historico = novoEstado.metricas;
    estado.etapa = etapaVisualDaFase(novoEstado.operacao?.fase);
    if (novoEstado.operacao?.id === "concluir-epoca") registrarPontoParametros();
    atualizarInterfaceDepuracao();
    renderizarTudo();
  }

  function iniciarDepuracao() {
    if (!estado.depurador) criarDepurador();
    sincronizarEstadoDepuracao(estado.depurador.iniciar());
    definirStatus("Depurador iniciado na primeira operação observável.");
  }

  function executarPassoDepuracao() {
    if (!estado.estadoDepuracao?.iniciado) return iniciarDepuracao();
    sincronizarEstadoDepuracao(estado.depurador.proximo());
    const alvo = Math.max(1, Number(porId("quantidade-epocas").value) || 1);
    if (estado.epoca >= alvo && estado.estadoDepuracao.operacao?.id === "concluir-epoca") {
      pausarDepuracao();
      definirStatus(`Execução debug concluída na época ${estado.epoca}.`);
    }
  }

  function executarPassoAnteriorDepuracao() {
    pausarDepuracao();
    sincronizarEstadoDepuracao(estado.depurador.anterior());
    definirStatus(`Estado restaurado no passo ${estado.estadoDepuracao.passo}.`);
  }

  function executarAteProximaEpoca() {
    if (!estado.estadoDepuracao?.iniciado) iniciarDepuracao();
    pausarDepuracao();
    sincronizarEstadoDepuracao(estado.depurador.avancarAteProximaEpoca());
    definirStatus(`Posicionado no início da época ${estado.estadoDepuracao.contexto.epocaEmExecucao}.`);
  }

  function alternarDepuracaoAutomatica() {
    if (estado.depuracaoAutomatica) {
      pausarDepuracao();
      definirStatus(`Depuração pausada no passo ${estado.estadoDepuracao?.passo || 0}.`);
      return;
    }
    if (!estado.estadoDepuracao?.iniciado) iniciarDepuracao();
    estado.depuracaoAutomatica = true;
    porId("debug-automatico").textContent = "Pausar";
    porId("estado-treinamento").textContent = "depurando";
    agendarPassoDepuracao();
  }

  function agendarPassoDepuracao() {
    if (!estado.depuracaoAutomatica) return;
    const intervalo = Number(porId("velocidade-debug").value) || 400;
    estado.temporizadorDepuracao = window.setTimeout(() => {
      executarPassoDepuracao();
      agendarPassoDepuracao();
    }, intervalo);
  }

  function pausarDepuracao() {
    estado.depuracaoAutomatica = false;
    if (estado.temporizadorDepuracao) window.clearTimeout(estado.temporizadorDepuracao);
    estado.temporizadorDepuracao = null;
    const botao = porId("debug-automatico");
    if (botao) botao.textContent = "Executar";
    if (estado.modo === "debug" && porId("estado-treinamento")) {
      porId("estado-treinamento").textContent = estado.estadoDepuracao?.iniciado ? "debug pausado" : "debug preparado";
    }
  }

  function alternarModo(modo) {
    if (modo === estado.modo) return;
    pausarTreinamento();
    pausarDepuracao();
    estado.modo = modo;
    document.querySelectorAll("[data-modo]").forEach((botao) => botao.classList.toggle("ativo", botao.dataset.modo === modo));
    porId("controles-normal").hidden = modo !== "normal";
    porId("controles-debug").hidden = modo !== "debug";
    porId("operacao-debug").hidden = modo !== "debug";
    document.querySelector('[data-visao="classificacao"]').disabled = modo === "debug";
    if (modo === "debug") {
      document.querySelectorAll(".botao-visao").forEach((item) => item.classList.toggle("ativo", item.dataset.visao === "treinamento"));
      document.querySelectorAll(".conteudo-visao").forEach((visao) => visao.classList.toggle("ativo", visao.id === "visao-treinamento"));
    }
    atualizarLayoutInspetor();
    reiniciarExperimento();
    definirStatus(modo === "debug" ? "Modo debug preparado. Pressione Iniciar." : "Modo normal restaurado.");
  }

  function atualizarLayoutInspetor() {
    const visivel = estado.modo === "debug" && estado.inspetorAberto;
    porId("inspetor-debug").hidden = !visivel;
    porId("abrir-inspetor").hidden = estado.modo !== "debug" || estado.inspetorAberto;
    porId("recolher-inspetor").textContent = "×";
    document.querySelector(".aplicacao").classList.toggle("modo-debug", estado.modo === "debug");
    document.querySelector(".aplicacao").classList.toggle("inspetor-aberto", visivel);
    requestAnimationFrame(renderizarTudo);
  }

  function matrizHtml(matriz, prefixo = "") {
    if (!matriz?.length) return "<p>Não calculado.</p>";
    const cabecalho = matriz[0].map((_, coluna) => `<th>${prefixo || "c"}${coluna + 1}</th>`).join("");
    const linhas = matriz.map((linha, indice) => `<tr><th>n${indice + 1}</th>${linha.map((valor) => `<td>${formatarNumero(valor, 5)}</td>`).join("")}</tr>`).join("");
    return `<div class="rolagem-matriz"><table class="tabela-matriz"><thead><tr><th></th>${cabecalho}</tr></thead><tbody>${linhas}</tbody></table></div>`;
  }

  function detalheHtml(titulo, conteudo, aberto = false) {
    return `<details ${aberto ? "open" : ""}><summary>${titulo}</summary><div class="grupo-debug">${conteudo}</div></details>`;
  }

  function camadasMatrizesHtml(matrizes, prefixo) {
    return matrizes.map((matriz, camada) =>
      detalheHtml(`${prefixo}${camada + 1} · camada ${camada + 1}`, matrizHtml(matriz, "a"))
    ).join("");
  }

  function renderizarOperacaoDepuracao() {
    const depuracao = estado.estadoDepuracao;
    const operacao = depuracao?.operacao;
    porId("operacao-debug").hidden = estado.modo !== "debug";
    if (!operacao) {
      porId("debug-identificacao").textContent = "PASSO 0";
      porId("debug-nome-operacao").textContent = "Aguardando início";
      porId("debug-descricao-operacao").textContent = "Inicie para posicionar a execução na identificação da arquitetura.";
      ["debug-formula-operacao", "debug-substituicao-operacao", "debug-resultado-operacao", "debug-consequencia-operacao"].forEach((id) => { porId(id).textContent = "—"; });
      return;
    }
    porId("debug-identificacao").textContent = `PASSO ${depuracao.passo} · ${operacao.fase}`;
    porId("debug-nome-operacao").textContent = operacao.nome;
    porId("debug-descricao-operacao").textContent = operacao.descricao;
    porId("debug-formula-operacao").textContent = operacao.formula;
    porId("debug-substituicao-operacao").textContent = operacao.substituicao;
    porId("debug-resultado-operacao").textContent = operacao.resultado;
    porId("debug-consequencia-operacao").textContent = operacao.consequencia;
  }

  function renderizarInspetorDepuracao() {
    if (estado.modo !== "debug") return;
    const depuracao = estado.estadoDepuracao;
    const contexto = depuracao?.contexto || {};
    const operacao = depuracao?.operacao;
    porId("resumo-debug").innerHTML = [
      ["Época", contexto.epocaEmExecucao || depuracao?.epoca || 0],
      ["Lote", contexto.epocaEmExecucao ? `1 / 1 · ${estado.preparacao.treino.entradas.length} amostras` : "—"],
      ["Passo", depuracao?.passo || 0],
      ["Fase", operacao?.fase || "não iniciada"],
      ["Perda", Number.isFinite(contexto.perdaMedia) ? formatarNumero(contexto.perdaMedia, 7) : "não calculada"],
      ["Função de perda", contexto.arquiteturaVisivel ? "½ soma dos quadrados" : "—"],
      ["Otimizador", contexto.arquiteturaVisivel ? "SGD · lote completo" : "—"],
    ].map(([rotulo, valor]) => `<div class="item-resumo-debug"><span>${rotulo}</span><strong>${valor}</strong></div>`).join("");

    if (!depuracao?.iniciado) {
      porId("arvore-debug").innerHTML = '<p class="estado-vazio">Nenhuma operação foi executada. Pesos e vieses permanecem ocultos até seus respectivos passos.</p>';
      renderizarHistoricoDepuracao();
      return;
    }

    const indiceExemplo = estado.depurador.indiceExemplo;
    const passagem = contexto.passagens?.[indiceExemplo];
    const partes = [];
    if (contexto.arquiteturaVisivel) {
      const conexoes = estado.rede.pesos.reduce((total, matriz) => total + matriz.length * matriz[0].length, 0);
      const ativacoes = estado.rede.pesos.map((_, camada) => motor.nomeAtivacaoDaCamada(estado.rede, camada));
      partes.push(detalheHtml("Arquitetura", `<p>Camadas: <code>${estado.rede.arquitetura.join(" → ")}</code></p><p>Ativações treináveis: <code>${ativacoes.join(" → ")}</code></p><p>Conexões: <code>${conexoes}</code></p>`, true));
    }
    if (contexto.dadosVisiveis) {
      partes.push(detalheHtml("Dados e lote", `<p>Amostras: <code>${estado.preparacao.treino.entradas.length}</code></p><p>Exemplo acompanhado: <code>${indiceExemplo + 1}</code></p>${passagem ? `<p>Entrada: <code>[${passagem.ativacoes[0].map((valor) => formatarNumero(valor, 5)).join(", ")}]</code></p>` : ""}`));
    }
    if (contexto.pesosVisiveis) partes.push(detalheHtml("Pesos", camadasMatrizesHtml(estado.rede.pesos, "W"), operacao?.id === "pesos"));
    if (contexto.viesesVisiveis) partes.push(detalheHtml("Biases", camadasMatrizesHtml(estado.rede.vieses, "b"), operacao?.id === "vieses"));
    if (passagem) {
      const camadasForward = passagem.ativacoes.map((ativacao, camada) => {
        const produtos = camada > 0 ? contexto.produtosPorCamada?.[camada - 1]?.[indiceExemplo] : null;
        const combinacao = camada > 0 ? passagem.combinacoesLineares?.[camada - 1] : null;
        return detalheHtml(`Camada ${camada}`, `${produtos ? `<p>Produtos W·a:</p>${matrizHtml(produtos, "a")}` : ""}${combinacao ? `<p>Pré-ativação z: <code>[${combinacao.map((valor) => formatarNumero(valor, 5)).join(", ")}]</code></p>` : ""}<p>Ativação a: <code>[${ativacao.map((valor) => formatarNumero(valor, 5)).join(", ")}]</code></p>`);
      }).join("");
      partes.push(detalheHtml("Forward propagation", camadasForward, operacao?.fase === "forward"));
      const ativacoesHtml = passagem.combinacoesLineares.map((valores, camada) => {
        const nome = motor.nomeAtivacaoDaCamada(estado.rede, camada);
        return `<p>Camada ${camada + 1}: <code>${nome}</code><br>entrada z = [${valores.map((valor) => formatarNumero(valor, 4)).join(", ")}]<br>saída a = [${passagem.ativacoes[camada + 1]?.map((valor) => formatarNumero(valor, 4)).join(", ") || "não calculada"}]</p>`;
      }).join("");
      if (ativacoesHtml) partes.push(detalheHtml("Funções de ativação", ativacoesHtml));
    }
    if (contexto.alvosVisiveis) {
      const esperado = estado.preparacao.treino.saidas[indiceExemplo];
      const predito = passagem?.saida;
      partes.push(detalheHtml("Loss", `<p>Esperado: <code>[${esperado.join(", ")}]</code></p>${predito ? `<p>Predito: <code>[${predito.map((valor) => formatarNumero(valor, 5)).join(", ")}]</code></p>` : ""}${contexto.diferencaExemplo ? `<p>Diferença: <code>[${contexto.diferencaExemplo.map((valor) => formatarNumero(valor, 5)).join(", ")}]</code></p>` : ""}${Number.isFinite(contexto.perdas?.[indiceExemplo]) ? `<p>L = <code>${formatarNumero(contexto.perdas[indiceExemplo], 7)}</code>; média = <code>${formatarNumero(contexto.perdaMedia, 7)}</code></p>` : ""}`, operacao?.fase === "perda"));
    }
    if (contexto.deltasPorExemplo) {
      const deltas = contexto.deltasPorExemplo[indiceExemplo];
      const gradientes = deltas.map((delta, camada) => delta ? `<p>Camada ${camada + 1}: δ = <code>[${delta.map((valor) => formatarNumero(valor, 7)).join(", ")}]</code></p>${contexto.gradientesPesosPorExemplo?.[indiceExemplo]?.[camada] ? matrizHtml(contexto.gradientesPesosPorExemplo[indiceExemplo][camada], "a") : ""}` : "").join("");
      partes.push(detalheHtml("Backpropagation", gradientes || "<p>Gradiente da saída calculado; deltas ainda pendentes.</p>", operacao?.fase === "backward"));
    }
    if (contexto.gradientesMedios) {
      partes.push(detalheHtml("Gradientes médios", `${camadasMatrizesHtml(contexto.gradientesMedios.gradientesPesos, "∂L/∂W")}${camadasMatrizesHtml(contexto.gradientesMedios.gradientesVieses, "∂L/∂b")}`));
    }
    if (contexto.parametrosAntes) {
      const comparacoes = contexto.parametrosAntes.pesos.map((matriz, camada) =>
        detalheHtml(`W${camada + 1} antes`, matrizHtml(matriz, "a")) +
        detalheHtml(`W${camada + 1} depois`, matrizHtml(contexto.parametrosDepois.pesos[camada], "a")) +
        detalheHtml(`b${camada + 1} antes`, matrizHtml(contexto.parametrosAntes.vieses[camada], "")) +
        detalheHtml(`b${camada + 1} depois`, matrizHtml(contexto.parametrosDepois.vieses[camada], ""))
      ).join("");
      partes.push(detalheHtml("Atualização de parâmetros", `<p>Taxa: <code>${formatarNumero(Number(porId("taxa-aprendizagem").value), 4)}</code></p>${comparacoes}`, true));
    }
    porId("arvore-debug").innerHTML = partes.join("");
    renderizarHistoricoDepuracao();
  }

  function renderizarHistoricoDepuracao() {
    const recipiente = porId("lista-historico-debug");
    recipiente.replaceChildren();
    const historico = estado.estadoDepuracao?.historico || [];
    historico.forEach((item) => {
      const botao = document.createElement("button");
      botao.className = `passo-historico ${item.atual ? "atual" : ""}`;
      botao.innerHTML = `<span>#${item.passo}</span><span>E${item.epoca} · ${item.nome}</span>`;
      botao.addEventListener("click", () => {
        pausarDepuracao();
        sincronizarEstadoDepuracao(estado.depurador.irParaPasso(item.indice));
      });
      recipiente.appendChild(botao);
    });
    recipiente.querySelector(".atual")?.scrollIntoView({ block: "nearest" });
  }

  function atualizarInterfaceDepuracao() {
    if (estado.modo !== "debug") return;
    const iniciado = estado.estadoDepuracao?.iniciado;
    porId("debug-iniciar").disabled = iniciado;
    porId("debug-anterior").disabled = !estado.estadoDepuracao?.podeVoltar;
    porId("debug-proximo").disabled = !iniciado;
    porId("debug-automatico").disabled = !iniciado;
    porId("debug-proxima-epoca").disabled = !iniciado;
    porId("estado-treinamento").textContent = estado.depuracaoAutomatica ? "depurando" : (iniciado ? "debug pausado" : "debug preparado");
    document.querySelectorAll("#etapas-fluxo button").forEach((botao) => {
      botao.classList.toggle("ativa", botao.dataset.etapa === estado.etapa);
    });
    renderizarOperacaoDepuracao();
    renderizarInspetorDepuracao();
  }

  function configurarEventos() {
    document.querySelectorAll("[data-modo]").forEach((botao) => botao.addEventListener("click", () => alternarModo(botao.dataset.modo)));
    document.querySelectorAll(".botao-visao").forEach((botao) => botao.addEventListener("click", () => {
      document.querySelectorAll(".botao-visao").forEach((item) => item.classList.toggle("ativo", item === botao));
      document.querySelectorAll(".conteudo-visao").forEach((visao) => visao.classList.remove("ativo"));
      porId(`visao-${botao.dataset.visao}`).classList.add("ativo");
      requestAnimationFrame(renderizarTudo);
    }));
    porId("taxa-aprendizagem").addEventListener("input", (evento) => {
      porId("valor-taxa").textContent = Number(evento.target.value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (estado.modo === "normal") renderizarSuperficie();
    });
    porId("taxa-aprendizagem").addEventListener("change", () => {
      if (estado.modo === "debug") reiniciarExperimento();
    });
    porId("epocas-por-quadro").addEventListener("input", (evento) => { porId("valor-lote-visual").textContent = evento.target.value; });
    porId("semente").addEventListener("change", reiniciarExperimento);
    porId("adicionar-camada").addEventListener("click", () => {
      if (porId("editor-camadas").children.length >= 3) {
        definirStatus("O laboratório visual limita a arquitetura a três camadas ocultas.");
        return;
      }
      porId("editor-camadas").appendChild(criarLinhaCamada(5, "sigmoide"));
      reiniciarExperimento();
    });
    porId("botao-reiniciar").addEventListener("click", reiniciarExperimento);
    porId("botao-passo").addEventListener("click", () => executarUmaEpoca(true));
    porId("botao-executar").addEventListener("click", alternarTreinamento);
    porId("exemplo-acompanhado").addEventListener("change", () => {
      if (estado.modo === "debug") reiniciarExperimento();
      else { atualizarCalculosVisiveis(); renderizarRede(); }
    });
    porId("seletor-camada-pesos").addEventListener("change", renderizarMapaPesos);
    porId("recalcular-superficie").addEventListener("click", recalcularSuperficie);
    ["parametro-eixo-x", "parametro-eixo-y"].forEach((id) => porId(id).addEventListener("change", () => {
      estado.trajetoriaParametros = [];
      registrarPontoParametros();
      recalcularSuperficie();
    }));
    document.querySelectorAll("#etapas-fluxo button").forEach((botao) => botao.addEventListener("click", () => {
      if (estado.modo === "normal") atualizarEtapaVisual(botao.dataset.etapa);
    }));
    porId("debug-iniciar").addEventListener("click", iniciarDepuracao);
    porId("debug-anterior").addEventListener("click", executarPassoAnteriorDepuracao);
    porId("debug-proximo").addEventListener("click", executarPassoDepuracao);
    porId("debug-automatico").addEventListener("click", alternarDepuracaoAutomatica);
    porId("debug-proxima-epoca").addEventListener("click", executarAteProximaEpoca);
    porId("debug-reiniciar").addEventListener("click", reiniciarExperimento);
    porId("velocidade-debug").addEventListener("input", (evento) => {
      porId("valor-velocidade-debug").textContent = `${evento.target.value} ms`;
    });
    porId("recolher-inspetor").addEventListener("click", () => {
      estado.inspetorAberto = false;
      atualizarLayoutInspetor();
    });
    porId("abrir-inspetor").addEventListener("click", () => {
      estado.inspetorAberto = true;
      atualizarLayoutInspetor();
    });
    porId("seletor-flor-teste").addEventListener("change", (evento) => selecionarFlorTeste(Number(evento.target.value)));
    porId("botao-classificar").addEventListener("click", classificarEntradaDosCampos);
    porId("filtro-paralelas").addEventListener("change", renderizarGraficosClassificacao);
    ["atributo-x", "atributo-y", "atributo-z"].forEach((id) => porId(id).addEventListener("change", renderizarGraficosClassificacao));
    document.querySelectorAll("[data-projecao]").forEach((botao) => botao.addEventListener("click", () => {
      estado.projecao = botao.dataset.projecao;
      document.querySelectorAll("[data-projecao]").forEach((item) => item.classList.toggle("ativo", item === botao));
      porId("controle-atributo-z").hidden = estado.projecao !== "3d";
      renderizarGraficosClassificacao();
    }));
    configurarRotacao3d();
    let temporizadorRedimensionamento;
    window.addEventListener("resize", () => {
      clearTimeout(temporizadorRedimensionamento);
      temporizadorRedimensionamento = setTimeout(renderizarTudo, 100);
    });
    porId("abrir-validacoes").addEventListener("click", () => {
      porId("dialogo-validacoes").showModal();
      executarValidacoesDaInterface();
    });
    porId("fechar-validacoes").addEventListener("click", () => porId("dialogo-validacoes").close());
    porId("executar-validacoes").addEventListener("click", executarValidacoesDaInterface);
  }

  function configurarRotacao3d() {
    const canvas = porId("grafico-projecao");
    let arrastando = false;
    let anterior = null;
    canvas.addEventListener("pointerdown", (evento) => {
      if (estado.projecao !== "3d") return;
      arrastando = true;
      anterior = { x: evento.clientX, y: evento.clientY };
      canvas.setPointerCapture(evento.pointerId);
    });
    canvas.addEventListener("pointermove", (evento) => {
      if (!arrastando || estado.projecao !== "3d") return;
      estado.rotacao.y += (evento.clientX - anterior.x) * .01;
      estado.rotacao.x += (evento.clientY - anterior.y) * .01;
      anterior = { x: evento.clientX, y: evento.clientY };
      renderizarGraficosClassificacao();
    });
    canvas.addEventListener("pointerup", () => { arrastando = false; });
  }

  function executarValidacoesDaInterface() {
    const recipiente = porId("resultados-validacoes");
    recipiente.innerHTML = "<p>Executando verificações…</p>";
    requestAnimationFrame(() => {
      const resultados = window.ValidacoesRNA.executar();
      recipiente.replaceChildren();
      resultados.forEach((resultado) => {
        const linha = document.createElement("div");
        linha.className = `resultado-validacao ${resultado.ok ? "ok" : "falha"}`;
        linha.innerHTML = `<span>${resultado.nome}</span><span>${resultado.ok ? "APROVADO" : "FALHOU"}${resultado.detalhe ? ` · ${resultado.detalhe}` : ""}</span>`;
        recipiente.appendChild(linha);
      });
    });
  }

  function iniciar() {
    porId("editor-camadas").appendChild(criarLinhaCamada(8, "sigmoide"));
    preencherSeletoresAtributos();
    preencherCamposFlor();
    configurarEventos();
    atualizarLayoutInspetor();
    reiniciarExperimento();
  }

  iniciar();
})();
