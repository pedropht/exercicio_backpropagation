(function () {
  "use strict";

  function criarGeradorAleatorio(semente) {
    let estado = Number(semente) >>> 0;
    return function gerar() {
      estado += 0x6D2B79F5;
      let valor = estado;
      valor = Math.imul(valor ^ (valor >>> 15), valor | 1);
      valor ^= valor + Math.imul(valor ^ (valor >>> 7), valor | 61);
      return ((valor ^ (valor >>> 14)) >>> 0) / 4294967296;
    };
  }

  function embaralhar(valores, gerarAleatorio) {
    const resultado = [...valores];
    for (let indice = resultado.length - 1; indice > 0; indice -= 1) {
      const troca = Math.floor(gerarAleatorio() * (indice + 1));
      [resultado[indice], resultado[troca]] = [resultado[troca], resultado[indice]];
    }
    return resultado;
  }

  function criarMatriz(linhas, colunas, criarValor = () => 0) {
    return Array.from({ length: linhas }, (_, linha) =>
      Array.from({ length: colunas }, (_, coluna) => criarValor(linha, coluna))
    );
  }

  function copiarMatrizes(matrizes) {
    return matrizes.map((matriz) => matriz.map((linha) => [...linha]));
  }

  function sigmoide(valor) {
    const limitado = Math.max(-500, Math.min(500, valor));
    return 1 / (1 + Math.exp(-limitado));
  }

  const FUNCOES_ATIVACAO = {
    sigmoide: {
      aplicar: sigmoide,
      derivar: (valor) => {
        const ativacao = sigmoide(valor);
        return ativacao * (1 - ativacao);
      },
    },
    tanh: {
      aplicar: Math.tanh,
      derivar: (valor) => 1 - Math.tanh(valor) ** 2,
    },
    relu: {
      aplicar: (valor) => Math.max(0, valor),
      derivar: (valor) => (valor > 0 ? 1 : 0),
    },
  };

  function inicializarRede(arquitetura, ativacoesOcultas, semente = 42) {
    if (arquitetura.length < 2 || arquitetura.some((quantidade) => quantidade < 1)) {
      throw new Error("A arquitetura precisa ter ao menos entrada e saída válidas.");
    }
    const gerarAleatorio = criarGeradorAleatorio(semente);
    const pesos = [];
    const vieses = [];

    for (let camada = 1; camada < arquitetura.length; camada += 1) {
      const quantidadeAnterior = arquitetura[camada - 1];
      const quantidadeAtual = arquitetura[camada];
      const limite = Math.sqrt(6 / (quantidadeAnterior + quantidadeAtual));
      pesos.push(criarMatriz(quantidadeAtual, quantidadeAnterior, () =>
        (gerarAleatorio() * 2 - 1) * limite
      ));
      vieses.push(criarMatriz(quantidadeAtual, 1));
    }

    return {
      arquitetura: [...arquitetura],
      ativacoesOcultas: [...ativacoesOcultas],
      pesos,
      vieses,
    };
  }

  function copiarRede(rede) {
    return {
      arquitetura: [...rede.arquitetura],
      ativacoesOcultas: [...rede.ativacoesOcultas],
      pesos: copiarMatrizes(rede.pesos),
      vieses: copiarMatrizes(rede.vieses),
    };
  }

  function nomeAtivacaoDaCamada(rede, indiceCamada) {
    const ultimaCamada = indiceCamada === rede.pesos.length - 1;
    return ultimaCamada ? "sigmoide" : rede.ativacoesOcultas[indiceCamada];
  }

  function calcularProdutosCamada(ativacaoAnterior, pesos) {
    return pesos.map((pesosNeuronio) =>
      pesosNeuronio.map((peso, anterior) => peso * ativacaoAnterior[anterior])
    );
  }

  function calcularCombinacaoLinear(produtos, vieses) {
    return produtos.map((produtosNeuronio, neuronio) =>
      produtosNeuronio.reduce((soma, produto) => soma + produto, vieses[neuronio][0])
    );
  }

  function aplicarAtivacaoCamada(combinacaoLinear, nomeAtivacao) {
    return combinacaoLinear.map(FUNCOES_ATIVACAO[nomeAtivacao].aplicar);
  }

  function passagemParaFrente(entrada, rede) {
    let ativacaoAtual = [...entrada];
    const ativacoes = [[...ativacaoAtual]];
    const combinacoesLineares = [];

    for (let camada = 0; camada < rede.pesos.length; camada += 1) {
      const produtos = calcularProdutosCamada(ativacaoAtual, rede.pesos[camada]);
      const combinacao = calcularCombinacaoLinear(produtos, rede.vieses[camada]);
      ativacaoAtual = aplicarAtivacaoCamada(combinacao, nomeAtivacaoDaCamada(rede, camada));
      combinacoesLineares.push(combinacao);
      ativacoes.push([...ativacaoAtual]);
    }

    return { ativacoes, combinacoesLineares, saida: [...ativacaoAtual] };
  }

  function calcularPerda(saidaPredita, saidaEsperada) {
    return 0.5 * saidaPredita.reduce((soma, valor, indice) =>
      soma + (valor - saidaEsperada[indice]) ** 2, 0
    );
  }

  function calcularGradienteSaida(saidaPredita, saidaEsperada) {
    return saidaPredita.map((valor, indice) => valor - saidaEsperada[indice]);
  }

  function calcularDeltaCamada(gradienteAtivacao, combinacaoLinear, nomeAtivacao) {
    const funcao = FUNCOES_ATIVACAO[nomeAtivacao];
    return gradienteAtivacao.map((gradiente, neuronio) =>
      gradiente * funcao.derivar(combinacaoLinear[neuronio])
    );
  }

  function calcularGradientesParametrosCamada(delta, ativacaoAnterior) {
    return {
      gradientesPesos: delta.map((valorDelta) =>
        ativacaoAnterior.map((ativacao) => valorDelta * ativacao)
      ),
      gradientesVieses: delta.map((valorDelta) => [valorDelta]),
    };
  }

  function propagarGradienteCamada(pesos, delta) {
    return pesos[0].map((_, anterior) =>
      delta.reduce((soma, valorDelta, neuronio) =>
        soma + pesos[neuronio][anterior] * valorDelta, 0
      )
    );
  }

  function retropropagar(saidaEsperada, rede, passagem) {
    const quantidadeCamadas = rede.pesos.length;
    const gradientesPesos = rede.pesos.map((matriz) =>
      criarMatriz(matriz.length, matriz[0].length)
    );
    const gradientesVieses = rede.vieses.map((matriz) => criarMatriz(matriz.length, 1));
    let gradienteAtivacao = calcularGradienteSaida(passagem.saida, saidaEsperada);
    const deltas = Array(quantidadeCamadas);

    for (let camada = quantidadeCamadas - 1; camada >= 0; camada -= 1) {
      const delta = calcularDeltaCamada(
        gradienteAtivacao,
        passagem.combinacoesLineares[camada],
        nomeAtivacaoDaCamada(rede, camada)
      );
      deltas[camada] = delta;

      const gradientesCamada = calcularGradientesParametrosCamada(
        delta,
        passagem.ativacoes[camada]
      );
      gradientesPesos[camada] = gradientesCamada.gradientesPesos;
      gradientesVieses[camada] = gradientesCamada.gradientesVieses;

      if (camada > 0) {
        gradienteAtivacao = propagarGradienteCamada(rede.pesos[camada], delta);
      }
    }

    return { gradientesPesos, gradientesVieses, deltas };
  }

  function criarGradientesZerados(rede) {
    return {
      gradientesPesos: rede.pesos.map((matriz) => criarMatriz(matriz.length, matriz[0].length)),
      gradientesVieses: rede.vieses.map((matriz) => criarMatriz(matriz.length, 1)),
    };
  }

  function combinarGradientesMedios(listaGradientes, rede) {
    const acumulados = criarGradientesZerados(rede);
    for (const gradientes of listaGradientes) {
      for (let camada = 0; camada < rede.pesos.length; camada += 1) {
        for (let neuronio = 0; neuronio < rede.pesos[camada].length; neuronio += 1) {
          acumulados.gradientesVieses[camada][neuronio][0] +=
            gradientes.gradientesVieses[camada][neuronio][0];
          for (let anterior = 0; anterior < rede.pesos[camada][neuronio].length; anterior += 1) {
            acumulados.gradientesPesos[camada][neuronio][anterior] +=
              gradientes.gradientesPesos[camada][neuronio][anterior];
          }
        }
      }
    }

    const quantidade = listaGradientes.length;
    for (let camada = 0; camada < rede.pesos.length; camada += 1) {
      for (let neuronio = 0; neuronio < rede.pesos[camada].length; neuronio += 1) {
        acumulados.gradientesVieses[camada][neuronio][0] /= quantidade;
        for (let anterior = 0; anterior < rede.pesos[camada][neuronio].length; anterior += 1) {
          acumulados.gradientesPesos[camada][neuronio][anterior] /= quantidade;
        }
      }
    }
    return acumulados;
  }

  function calcularGradientesMedios(entradas, saidasEsperadas, rede) {
    let perdaAcumulada = 0;
    const listaGradientes = [];

    for (let exemplo = 0; exemplo < entradas.length; exemplo += 1) {
      const passagem = passagemParaFrente(entradas[exemplo], rede);
      perdaAcumulada += calcularPerda(passagem.saida, saidasEsperadas[exemplo]);
      listaGradientes.push(retropropagar(saidasEsperadas[exemplo], rede, passagem));
    }

    const quantidade = entradas.length;
    return {
      perdaMedia: perdaAcumulada / quantidade,
      ...combinarGradientesMedios(listaGradientes, rede),
    };
  }

  function atualizarParametros(rede, gradientes, taxaAprendizagem) {
    for (let camada = 0; camada < rede.pesos.length; camada += 1) {
      for (let neuronio = 0; neuronio < rede.pesos[camada].length; neuronio += 1) {
        rede.vieses[camada][neuronio][0] -=
          taxaAprendizagem * gradientes.gradientesVieses[camada][neuronio][0];
        for (let anterior = 0; anterior < rede.pesos[camada][neuronio].length; anterior += 1) {
          rede.pesos[camada][neuronio][anterior] -=
            taxaAprendizagem * gradientes.gradientesPesos[camada][neuronio][anterior];
        }
      }
    }
  }

  function executarEpoca(entradas, saidasEsperadas, rede, taxaAprendizagem) {
    const gradientes = calcularGradientesMedios(entradas, saidasEsperadas, rede);
    atualizarParametros(rede, gradientes, taxaAprendizagem);
    return gradientes;
  }

  function indiceMaiorValor(valores) {
    let maiorIndice = 0;
    for (let indice = 1; indice < valores.length; indice += 1) {
      if (valores[indice] > valores[maiorIndice]) maiorIndice = indice;
    }
    return maiorIndice;
  }

  function avaliar(entradas, saidasEsperadas, rede) {
    let perda = 0;
    let acertos = 0;
    const predicoes = [];
    for (let indice = 0; indice < entradas.length; indice += 1) {
      const saida = passagemParaFrente(entradas[indice], rede).saida;
      const classePredita = indiceMaiorValor(saida);
      const classeEsperada = indiceMaiorValor(saidasEsperadas[indice]);
      perda += calcularPerda(saida, saidasEsperadas[indice]);
      acertos += Number(classePredita === classeEsperada);
      predicoes.push({ saida, classePredita, classeEsperada });
    }
    return { perdaMedia: perda / entradas.length, acuracia: acertos / entradas.length, predicoes };
  }

  function prepararDadosIris(dados, percentualTeste = 0.2, semente = 42) {
    const gerarAleatorio = criarGeradorAleatorio(semente);
    const indicesTreino = [];
    const indicesTeste = [];
    const quantidadeClasses = 3;

    for (let classe = 0; classe < quantidadeClasses; classe += 1) {
      const indicesClasse = dados.filter((item) => item.classe === classe).map((item) => item.indice);
      const misturados = embaralhar(indicesClasse, gerarAleatorio);
      const quantidadeTeste = Math.round(percentualTeste * misturados.length);
      indicesTreino.push(...misturados.slice(0, -quantidadeTeste));
      indicesTeste.push(...misturados.slice(-quantidadeTeste));
    }

    const treinoMisturado = embaralhar(indicesTreino, gerarAleatorio);
    const testeMisturado = embaralhar(indicesTeste, gerarAleatorio);
    const medias = Array(4).fill(0);
    const desvios = Array(4).fill(0);

    for (const indice of treinoMisturado) {
      dados[indice].atributos.forEach((valor, atributo) => { medias[atributo] += valor; });
    }
    medias.forEach((_, atributo) => { medias[atributo] /= treinoMisturado.length; });
    for (const indice of treinoMisturado) {
      dados[indice].atributos.forEach((valor, atributo) => {
        desvios[atributo] += (valor - medias[atributo]) ** 2;
      });
    }
    desvios.forEach((_, atributo) => {
      desvios[atributo] = Math.sqrt(desvios[atributo] / treinoMisturado.length);
    });

    const padronizar = (atributos) => atributos.map((valor, atributo) =>
      (valor - medias[atributo]) / desvios[atributo]
    );
    const criarSaida = (classe) => Array.from({ length: quantidadeClasses }, (_, i) => Number(i === classe));
    const criarConjunto = (indices) => ({
      indices,
      entradas: indices.map((indice) => padronizar(dados[indice].atributos)),
      saidas: indices.map((indice) => criarSaida(dados[indice].classe)),
      classes: indices.map((indice) => dados[indice].classe),
    });

    return {
      treino: criarConjunto(treinoMisturado),
      teste: criarConjunto(testeMisturado),
      medias,
      desvios,
      padronizar,
      despadronizar: (entrada) => entrada.map((valor, atributo) =>
        valor * desvios[atributo] + medias[atributo]
      ),
    };
  }

  function listarParametros(rede) {
    const parametros = [];
    rede.pesos.forEach((matriz, camada) => {
      matriz.forEach((linha, neuronio) => {
        linha.forEach((_, anterior) => parametros.push({
          tipo: "peso", camada, neuronio, anterior,
          rotulo: `W${camada + 1}[${neuronio + 1},${anterior + 1}]`,
        }));
      });
    });
    rede.vieses.forEach((matriz, camada) => {
      matriz.forEach((_, neuronio) => parametros.push({
        tipo: "vies", camada, neuronio, anterior: 0,
        rotulo: `b${camada + 1}[${neuronio + 1}]`,
      }));
    });
    return parametros;
  }

  function obterParametro(rede, parametro) {
    return parametro.tipo === "peso"
      ? rede.pesos[parametro.camada][parametro.neuronio][parametro.anterior]
      : rede.vieses[parametro.camada][parametro.neuronio][0];
  }

  function definirParametro(rede, parametro, valor) {
    if (parametro.tipo === "peso") {
      rede.pesos[parametro.camada][parametro.neuronio][parametro.anterior] = valor;
    } else {
      rede.vieses[parametro.camada][parametro.neuronio][0] = valor;
    }
  }

  function obterGradiente(gradientes, parametro) {
    return parametro.tipo === "peso"
      ? gradientes.gradientesPesos[parametro.camada][parametro.neuronio][parametro.anterior]
      : gradientes.gradientesVieses[parametro.camada][parametro.neuronio][0];
  }

  window.RedeNeuralDidatica = {
    FUNCOES_ATIVACAO,
    criarGeradorAleatorio,
    criarMatriz,
    copiarRede,
    inicializarRede,
    nomeAtivacaoDaCamada,
    calcularProdutosCamada,
    calcularCombinacaoLinear,
    aplicarAtivacaoCamada,
    passagemParaFrente,
    calcularPerda,
    calcularGradienteSaida,
    calcularDeltaCamada,
    calcularGradientesParametrosCamada,
    propagarGradienteCamada,
    retropropagar,
    combinarGradientesMedios,
    calcularGradientesMedios,
    atualizarParametros,
    executarEpoca,
    avaliar,
    indiceMaiorValor,
    prepararDadosIris,
    listarParametros,
    obterParametro,
    definirParametro,
    obterGradiente,
  };
})();
