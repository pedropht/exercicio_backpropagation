(function () {
  "use strict";

  function media(valores) {
    return valores.reduce((soma, valor) => soma + valor, 0) / valores.length;
  }

  function desvioPopulacional(valores) {
    const valorMedio = media(valores);
    return Math.sqrt(media(valores.map((valor) => (valor - valorMedio) ** 2)));
  }

  function maiorDiferencaRede(redeA, redeB) {
    const valoresA = [...redeA.pesos.flat(2), ...redeA.vieses.flat(2)];
    const valoresB = [...redeB.pesos.flat(2), ...redeB.vieses.flat(2)];
    return Math.max(...valoresA.map((valor, indice) => Math.abs(valor - valoresB[indice])));
  }

  function executar() {
    const motor = window.RedeNeuralDidatica;
    const resultados = [];
    const verificar = (nome, teste, detalhe = "") => resultados.push({ nome, ok: Boolean(teste), detalhe });

    try {
      const contagens = NOMES_CLASSES_IRIS.map((_, classe) => DADOS_IRIS.filter((item) => item.classe === classe).length);
      verificar("Integridade do conjunto Iris", DADOS_IRIS.length === 150 && contagens.every((valor) => valor === 50), `${DADOS_IRIS.length} registros; classes ${contagens.join("/")}`);

      const preparacao = motor.prepararDadosIris(DADOS_IRIS, 0.2, 42);
      const treinoUnico = new Set(preparacao.treino.indices);
      const testeUnico = new Set(preparacao.teste.indices);
      const disjuntos = [...testeUnico].every((indice) => !treinoUnico.has(indice));
      verificar("Separação estratificada", treinoUnico.size === 120 && testeUnico.size === 30 && disjuntos, "120 treino / 30 teste");

      const contagensTeste = NOMES_CLASSES_IRIS.map((_, classe) => preparacao.teste.classes.filter((valor) => valor === classe).length);
      verificar("Balanceamento do teste", contagensTeste.every((valor) => valor === 10), contagensTeste.join("/"));

      const medias = Array.from({ length: 4 }, (_, atributo) => media(preparacao.treino.entradas.map((entrada) => entrada[atributo])));
      const desvios = Array.from({ length: 4 }, (_, atributo) => desvioPopulacional(preparacao.treino.entradas.map((entrada) => entrada[atributo])));
      const padronizacaoCorreta = medias.every((valor) => Math.abs(valor) < 1e-12) && desvios.every((valor) => Math.abs(valor - 1) < 1e-12);
      verificar("Padronização baseada no treino", padronizacaoCorreta, "média 0; desvio 1");

      const rede = motor.inicializarRede([4, 3, 3], ["sigmoide"], 7);
      const dimensoesCorretas = rede.pesos[0].length === 3 && rede.pesos[0][0].length === 4 && rede.pesos[1].length === 3 && rede.pesos[1][0].length === 3;
      verificar("Dimensões de pesos e vieses", dimensoesCorretas, "W1 3×4; W2 3×3");

      const entrada = preparacao.treino.entradas[0];
      const saidaEsperada = preparacao.treino.saidas[0];
      const passagem = motor.passagemParaFrente(entrada, rede);
      const gradientes = motor.retropropagar(saidaEsperada, rede, passagem);
      const parametro = { tipo: "peso", camada: 0, neuronio: 0, anterior: 0 };
      const original = motor.obterParametro(rede, parametro);
      const passo = 1e-5;
      motor.definirParametro(rede, parametro, original + passo);
      const perdaFrente = motor.calcularPerda(motor.passagemParaFrente(entrada, rede).saida, saidaEsperada);
      motor.definirParametro(rede, parametro, original - passo);
      const perdaAtras = motor.calcularPerda(motor.passagemParaFrente(entrada, rede).saida, saidaEsperada);
      motor.definirParametro(rede, parametro, original);
      const numerico = (perdaFrente - perdaAtras) / (2 * passo);
      const analitico = gradientes.gradientesPesos[0][0][0];
      const erroGradiente = Math.abs(numerico - analitico);
      verificar("Gradiente analítico × numérico", erroGradiente < 1e-6, `erro ${erroGradiente.toExponential(2)}`);

      const redePasso = motor.inicializarRede([4, 5, 3], ["tanh"], 11);
      const perdaAntes = motor.avaliar(preparacao.treino.entradas, preparacao.treino.saidas, redePasso).perdaMedia;
      const gradientesMedios = motor.calcularGradientesMedios(preparacao.treino.entradas, preparacao.treino.saidas, redePasso);
      motor.atualizarParametros(redePasso, gradientesMedios, 0.1);
      const perdaDepois = motor.avaliar(preparacao.treino.entradas, preparacao.treino.saidas, redePasso).perdaMedia;
      verificar("Sentido da atualização", perdaDepois < perdaAntes, `${perdaAntes.toFixed(6)} → ${perdaDepois.toFixed(6)}`);

      const entradasDebug = preparacao.treino.entradas.slice(0, 4);
      const saidasDebug = preparacao.treino.saidas.slice(0, 4);
      const redeNormal = motor.inicializarRede([4, 3, 3], ["tanh"], 19);
      const redeDebugInicial = motor.copiarRede(redeNormal);
      motor.executarEpoca(entradasDebug, saidasDebug, redeNormal, 0.35);
      const depurador = new window.DepuradorRNA.ControladorDepuracao({
        rede: redeDebugInicial,
        entradas: entradasDebug,
        saidasEsperadas: saidasDebug,
        taxaAprendizagem: 0.35,
        semente: 19,
        indiceExemplo: 0,
      });
      let estadoDebug = depurador.iniciar();
      let limite = 100;
      while (estadoDebug.operacao.id !== "concluir-epoca" && limite > 0) {
        estadoDebug = depurador.proximo();
        limite -= 1;
      }
      const diferencaModos = maiorDiferencaRede(redeNormal, estadoDebug.rede);
      verificar("Equivalência normal × debug", limite > 0 && diferencaModos < 1e-15, `diferença máxima ${diferencaModos.toExponential(2)}`);

      const pesoAtualizado = estadoDebug.rede.pesos[0][0][0];
      depurador.anterior();
      const estadoAntesAtualizacao = depurador.anterior();
      const pesoAnterior = estadoAntesAtualizacao.rede.pesos[0][0][0];
      const estadoReproduzido = depurador.proximo();
      const pesoReproduzido = estadoReproduzido.rede.pesos[0][0][0];
      verificar(
        "Restauração e reprodução do histórico",
        pesoAnterior !== pesoAtualizado && pesoReproduzido === pesoAtualizado,
        `${pesoAnterior.toFixed(6)} → ${pesoReproduzido.toFixed(6)}`
      );

      const depuradorReiniciado = new window.DepuradorRNA.ControladorDepuracao({
        rede: motor.inicializarRede([4, 3, 3], ["tanh"], 19),
        entradas: entradasDebug,
        saidasEsperadas: saidasDebug,
        taxaAprendizagem: 0.35,
        semente: 19,
      });
      const primeiraOperacao = depuradorReiniciado.iniciar();
      verificar(
        "Estado futuro não antecipado",
        primeiraOperacao.operacao.id === "arquitetura" && !primeiraOperacao.contexto.pesosVisiveis && !primeiraOperacao.contexto.passagens,
        "pesos e forward ocultos no passo 1"
      );

      const redeTreino = motor.inicializarRede([4, 8, 3], ["sigmoide"], 42);
      const perdaInicial = motor.avaliar(preparacao.treino.entradas, preparacao.treino.saidas, redeTreino).perdaMedia;
      for (let epoca = 0; epoca < 1200; epoca += 1) {
        motor.executarEpoca(preparacao.treino.entradas, preparacao.treino.saidas, redeTreino, 1);
      }
      const resultadoTeste = motor.avaliar(preparacao.teste.entradas, preparacao.teste.saidas, redeTreino);
      const perdaFinal = motor.avaliar(preparacao.treino.entradas, preparacao.treino.saidas, redeTreino).perdaMedia;
      verificar("Aprendizado da configuração padrão", perdaFinal < perdaInicial && resultadoTeste.acuracia >= 0.9, `${(resultadoTeste.acuracia * 100).toFixed(1)}% no teste`);
    } catch (erro) {
      resultados.push({ nome: "Execução das verificações", ok: false, detalhe: erro.message });
    }
    return resultados;
  }

  window.ValidacoesRNA = { executar };
})();
