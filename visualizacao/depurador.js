(function () {
  "use strict";

  const motor = window.RedeNeuralDidatica;

  function numero(valor, casas = 5) {
    if (!Number.isFinite(valor)) return "—";
    if (valor !== 0 && Math.abs(valor) < 0.0001) return valor.toExponential(2);
    return valor.toFixed(casas);
  }

  function vetor(valores, limite = valores.length) {
    const exibidos = valores.slice(0, limite).map((valor) => numero(valor, 4));
    return `[${exibidos.join(", ")}${valores.length > limite ? ", …" : ""}]`;
  }

  function criarOperacao(id, fase, nome, descricao, formula, executar, destaque = {}) {
    return { id, fase, nome, descricao, formula, executar, destaque };
  }

  class ControladorDepuracao {
    constructor({ rede, entradas, saidasEsperadas, taxaAprendizagem, semente, indiceExemplo = 0 }) {
      this.rede = motor.copiarRede(rede);
      this.entradas = entradas.map((entrada) => [...entrada]);
      this.saidasEsperadas = saidasEsperadas.map((saida) => [...saida]);
      this.taxaAprendizagem = taxaAprendizagem;
      this.semente = semente;
      this.indiceExemplo = Math.max(0, Math.min(indiceExemplo, entradas.length - 1));
      this.epoca = 0;
      this.contexto = {};
      this.historico = [];
      this.cursor = -1;
      this.fila = this.criarOperacoesInicializacao();
      this.indiceFila = 0;
      this.iniciado = false;
    }

    criarOperacoesInicializacao() {
      return [
        criarOperacao(
          "arquitetura", "inicializacao", "Identificar arquitetura e hiperparâmetros",
          "Registra as dimensões, ativações, perda, otimizador e taxa de aprendizagem usados nesta execução.",
          "camadas = [n₀, n₁, …, nₖ]",
          () => {
            this.contexto = { ...this.contexto, arquiteturaVisivel: true };
            return {
              substituicao: `camadas = [${this.rede.arquitetura.join(", ")}]; η = ${numero(this.taxaAprendizagem, 3)}`,
              resultado: `${this.rede.pesos.length} camadas treináveis; SGD em lote completo`,
              consequencia: "Os dados de treinamento podem ser preparados.",
            };
          }
        ),
        criarOperacao(
          "dados", "inicializacao", "Preparar dados de treinamento",
          "Disponibiliza o lote estratificado e padronizado que será usado em todas as operações da época.",
          "x' = (x − μtreino) / σtreino",
          () => {
            this.contexto = { ...this.contexto, dadosVisiveis: true };
            return {
              substituicao: `X possui ${this.entradas.length} exemplos × ${this.entradas[0].length} atributos`,
              resultado: `lote com ${this.entradas.length} exemplos preparado`,
              consequencia: "Os pesos podem ser revelados no estado inicial.",
            };
          }
        ),
        criarOperacao(
          "pesos", "inicializacao", "Inicializar pesos",
          "Revela as matrizes geradas deterministicamente pela semente configurada.",
          "W[l] ~ U(−√(6/(nₗ₋₁+nₗ)), +√(6/(nₗ₋₁+nₗ)))",
          () => {
            this.contexto = { ...this.contexto, pesosVisiveis: true };
            return {
              substituicao: `semente = ${this.semente}`,
              resultado: this.rede.pesos.map((matriz, camada) => `W${camada + 1}: ${matriz.length}×${matriz[0].length}`).join("; "),
              consequencia: "Os vieses serão inicializados.",
            };
          },
          { todasConexoes: true }
        ),
        criarOperacao(
          "vieses", "inicializacao", "Inicializar vieses",
          "Inicializa um termo de viés igual a zero para cada neurônio treinável.",
          "b[l] = 0",
          () => {
            this.contexto = { ...this.contexto, viesesVisiveis: true };
            return {
              substituicao: this.rede.vieses.map((matriz, camada) => `b${camada + 1}: ${matriz.length}×1`).join("; "),
              resultado: "todos os vieses valem 0",
              consequencia: "O estado inicial completo será registrado.",
            };
          }
        ),
        criarOperacao(
          "estado-inicial", "inicializacao", "Armazenar estado inicial",
          "Cria o primeiro ponto reproduzível do treinamento sem executar inferência ou calcular gradientes.",
          "S₀ = {W, b, η, semente}",
          () => {
            this.contexto = { ...this.contexto, estadoInicialArmazenado: true };
            return {
              substituicao: `S₀ usa a versão 0 dos parâmetros e semente ${this.semente}`,
              resultado: "estado inicial armazenado",
              consequencia: "A época 1 pode selecionar o lote de treinamento.",
            };
          }
        ),
      ];
    }

    prepararContextoEpoca() {
      this.contexto = {
        ...this.contexto,
        epocaEmExecucao: this.epoca + 1,
        passagens: null,
        produtosPorCamada: [],
        alvosVisiveis: false,
        diferencaExemplo: null,
        perdas: null,
        perdaMedia: null,
        gradientesAtivacao: null,
        deltasPorExemplo: null,
        gradientesPesosPorExemplo: null,
        gradientesViesesPorExemplo: null,
        gradientesMedios: null,
        parametrosAntes: null,
        parametrosDepois: null,
        epocaConcluida: false,
      };
    }

    criarOperacoesEpoca() {
      this.prepararContextoEpoca();
      const operacoes = [];
      const epoca = this.epoca + 1;
      const exemplo = this.indiceExemplo;
      operacoes.push(criarOperacao(
        "selecionar-lote", "forward", `Selecionar lote da época ${epoca}`,
        "Seleciona o lote completo. O painel detalha o exemplo acompanhado, mas a atualização usa todos os exemplos.",
        "B = {(x⁽ⁱ⁾, y⁽ⁱ⁾)}ᵢ₌₁ᵐ",
        () => ({
          substituicao: `m = ${this.entradas.length}; exemplo acompanhado = ${exemplo + 1}`,
          resultado: `lote ${epoca} selecionado`,
          consequencia: "As entradas serão disponibilizadas à primeira camada.",
        }),
        { camada: 0 }
      ));
      operacoes.push(criarOperacao(
        "entrada", "forward", "Apresentar entradas",
        "Registra a ativação da camada de entrada para cada exemplo do lote.",
        "a[0] = x",
        () => {
          const passagens = this.entradas.map((entrada) => ({
            ativacoes: [[...entrada]],
            combinacoesLineares: [],
            saida: null,
          }));
          this.contexto = { ...this.contexto, passagens };
          return {
            substituicao: `a[0]⁽${exemplo + 1}⁾ = ${vetor(this.entradas[exemplo])}`,
            resultado: "entradas disponíveis",
            consequencia: "A primeira camada treinável pode usar seus pesos e vieses.",
          };
        },
        { camada: 0 }
      ));

      for (let camada = 0; camada < this.rede.pesos.length; camada += 1) {
        const camadaVisual = camada + 1;
        const nomeAtivacao = motor.nomeAtivacaoDaCamada(this.rede, camada);
        operacoes.push(criarOperacao(
          `parametros-${camada}`, "forward", `Identificar parâmetros da camada ${camadaVisual}`,
          "Seleciona os pesos e vieses que participam da próxima transformação linear.",
          `W[${camadaVisual}], b[${camadaVisual}]`,
          () => ({
            substituicao: `W${camadaVisual}: ${this.rede.pesos[camada].length}×${this.rede.pesos[camada][0].length}; b${camadaVisual}: ${this.rede.vieses[camada].length}×1`,
            resultado: `parâmetros da camada ${camadaVisual} selecionados`,
            consequencia: "Os produtos entre ativações e pesos serão calculados.",
          }),
          { camada: camadaVisual, conexoesCamada: camada }
        ));
        operacoes.push(criarOperacao(
          `produtos-${camada}`, "forward", `Calcular produtos da camada ${camadaVisual}`,
          "Multiplica cada ativação de entrada pelo peso da conexão correspondente.",
          `pⱼᵢ[${camadaVisual}] = Wⱼᵢ[${camadaVisual}] · aᵢ[${camada}]`,
          () => {
            const produtosLote = this.contexto.passagens.map((passagem) =>
              motor.calcularProdutosCamada(passagem.ativacoes[camada], this.rede.pesos[camada])
            );
            const produtosPorCamada = [...this.contexto.produtosPorCamada];
            produtosPorCamada[camada] = produtosLote;
            this.contexto = { ...this.contexto, produtosPorCamada };
            const entradaNeuronio = this.contexto.passagens[exemplo].ativacoes[camada];
            const pesosNeuronio = this.rede.pesos[camada][0];
            return {
              substituicao: pesosNeuronio.map((peso, indice) => `${numero(peso, 3)}×${numero(entradaNeuronio[indice], 3)}`).join("; "),
              resultado: `produtos do neurônio 1 = ${vetor(produtosLote[exemplo][0])}`,
              consequencia: "Os produtos serão somados ao viés.",
            };
          },
          { camada: camadaVisual, conexoesCamada: camada, neuronio: 0 }
        ));
        operacoes.push(criarOperacao(
          `combinacao-${camada}`, "forward", `Calcular combinação linear da camada ${camadaVisual}`,
          "Soma os produtos de cada neurônio e adiciona seu viés, ainda sem aplicar a ativação.",
          `z[${camadaVisual}] = W[${camadaVisual}] · a[${camada}] + b[${camadaVisual}]`,
          () => {
            const passagens = this.contexto.passagens.map((passagem, indice) => {
              const combinacao = motor.calcularCombinacaoLinear(
                this.contexto.produtosPorCamada[camada][indice],
                this.rede.vieses[camada]
              );
              const combinacoesLineares = [...passagem.combinacoesLineares];
              combinacoesLineares[camada] = combinacao;
              return { ...passagem, combinacoesLineares };
            });
            this.contexto = { ...this.contexto, passagens };
            const produtos = this.contexto.produtosPorCamada[camada][exemplo][0];
            const vies = this.rede.vieses[camada][0][0];
            return {
              substituicao: `z₁ = ${produtos.map((produto) => numero(produto, 4)).join(" + ")} + ${numero(vies, 4)}`,
              resultado: `z[${camadaVisual}] = ${vetor(passagens[exemplo].combinacoesLineares[camada])}`,
              consequencia: `A função ${nomeAtivacao} será aplicada.`,
            };
          },
          { camada: camadaVisual, conexoesCamada: camada, neuronio: 0 }
        ));
        operacoes.push(criarOperacao(
          `ativacao-${camada}`, "forward", `Aplicar ${nomeAtivacao} na camada ${camadaVisual}`,
          "Transforma os valores pré-ativação e disponibiliza as saídas desta camada.",
          nomeAtivacao === "sigmoide" ? "a = σ(z) = 1 / (1 + e⁻ᶻ)" : (nomeAtivacao === "tanh" ? "a = tanh(z)" : "a = max(0, z)"),
          () => {
            const ultima = camada === this.rede.pesos.length - 1;
            const passagens = this.contexto.passagens.map((passagem) => {
              const ativacao = motor.aplicarAtivacaoCamada(passagem.combinacoesLineares[camada], nomeAtivacao);
              const ativacoes = [...passagem.ativacoes];
              ativacoes[camadaVisual] = ativacao;
              return { ...passagem, ativacoes, saida: ultima ? ativacao : null };
            });
            this.contexto = { ...this.contexto, passagens };
            const z = passagens[exemplo].combinacoesLineares[camada];
            return {
              substituicao: `f(${vetor(z)})`,
              resultado: `${ultima ? "ŷ" : `a[${camadaVisual}]`} = ${vetor(passagens[exemplo].ativacoes[camadaVisual])}`,
              consequencia: ultima ? "A previsão pode ser comparada ao resultado esperado." : "Estas saídas alimentarão a próxima camada.",
            };
          },
          { camada: camadaVisual, neuronio: 0 }
        ));
      }

      operacoes.push(criarOperacao(
        "esperado", "perda", "Recuperar resultado esperado",
        "Obtém o vetor one-hot usado como alvo para cada exemplo.",
        "y⁽ⁱ⁾ ∈ {0, 1}ᶜ",
          () => ({
            substituicao: `y⁽${exemplo + 1}⁾ = ${vetor(this.saidasEsperadas[exemplo])}`,
            resultado: "alvos disponíveis",
            consequencia: "Previsões e alvos serão comparados.",
          }),
        { camada: this.rede.arquitetura.length - 1 }
      ));
      operacoes.push(criarOperacao(
        "comparar", "perda", "Comparar previsão e alvo",
        "Calcula a diferença em cada saída antes de reduzi-la a um valor de perda.",
        "d = ŷ − y",
        () => {
          const diferenca = motor.calcularGradienteSaida(this.contexto.passagens[exemplo].saida, this.saidasEsperadas[exemplo]);
          this.contexto = { ...this.contexto, diferencaExemplo: diferenca };
          return {
            substituicao: `${vetor(this.contexto.passagens[exemplo].saida)} − ${vetor(this.saidasEsperadas[exemplo])}`,
            resultado: `d = ${vetor(diferenca)}`,
            consequencia: "As diferenças serão elevadas ao quadrado e somadas.",
          };
        },
        { camada: this.rede.arquitetura.length - 1 }
      ));
      operacoes.push(criarOperacao(
        "calcular-perda", "perda", "Calcular perda quadrática",
        "Calcula a perda de cada exemplo e a média do lote, preservando os valores individuais.",
        "L = ½ Σⱼ(ŷⱼ − yⱼ)²; L̄ = (1/m) ΣᵢL⁽ⁱ⁾",
        () => {
          const perdas = this.contexto.passagens.map((passagem, indice) =>
            motor.calcularPerda(passagem.saida, this.saidasEsperadas[indice])
          );
          const perdaMedia = perdas.reduce((soma, perda) => soma + perda, 0) / perdas.length;
          this.contexto = { ...this.contexto, perdas, perdaMedia };
          return {
            substituicao: `L⁽${exemplo + 1}⁾ = ½ × (${this.contexto.diferencaExemplo.map((valor) => `${numero(valor, 4)}²`).join(" + ")})`,
            resultado: `L⁽${exemplo + 1}⁾ = ${numero(perdas[exemplo], 6)}; L̄ = ${numero(perdaMedia, 6)}`,
            consequencia: "O gradiente da perda em relação à saída será calculado.",
          };
        },
        { camada: this.rede.arquitetura.length - 1 }
      ));
      operacoes.push(criarOperacao(
        "gradiente-saida", "backward", "Calcular gradiente em relação à saída",
        "Inicia a retropropagação derivando a perda quadrática em relação a cada saída predita.",
        "∂L/∂a[k] = ŷ − y",
        () => {
          const gradientesAtivacao = this.contexto.passagens.map((passagem, indice) =>
            motor.calcularGradienteSaida(passagem.saida, this.saidasEsperadas[indice])
          );
          const quantidade = this.entradas.length;
          this.contexto = {
            ...this.contexto,
            gradientesAtivacao,
            deltasPorExemplo: Array.from({ length: quantidade }, () => []),
            gradientesPesosPorExemplo: Array.from({ length: quantidade }, () => []),
            gradientesViesesPorExemplo: Array.from({ length: quantidade }, () => []),
          };
          return {
            substituicao: `${vetor(this.contexto.passagens[exemplo].saida)} − ${vetor(this.saidasEsperadas[exemplo])}`,
            resultado: `∂L/∂a[k] = ${vetor(gradientesAtivacao[exemplo])}`,
            consequencia: "A derivada da ativação da camada de saída será aplicada.",
          };
        },
        { camada: this.rede.arquitetura.length - 1 }
      ));

      for (let camada = this.rede.pesos.length - 1; camada >= 0; camada -= 1) {
        const camadaVisual = camada + 1;
        const nomeAtivacao = motor.nomeAtivacaoDaCamada(this.rede, camada);
        operacoes.push(criarOperacao(
          `delta-${camada}`, "backward", `Aplicar regra da cadeia na camada ${camadaVisual}`,
          "Combina o gradiente recebido com a derivada local da ativação para obter o delta.",
          `δ[${camadaVisual}] = (∂L/∂a[${camadaVisual}]) ⊙ f'(z[${camadaVisual}])`,
          () => {
            const deltasAtuais = this.contexto.gradientesAtivacao.map((gradiente, indice) =>
              motor.calcularDeltaCamada(
                gradiente,
                this.contexto.passagens[indice].combinacoesLineares[camada],
                nomeAtivacao
              )
            );
            const deltasPorExemplo = this.contexto.deltasPorExemplo.map((deltas, indice) => {
              const copia = [...deltas];
              copia[camada] = deltasAtuais[indice];
              return copia;
            });
            this.contexto = { ...this.contexto, deltasPorExemplo };
            return {
              substituicao: `gradiente recebido ${vetor(this.contexto.gradientesAtivacao[exemplo])}; z = ${vetor(this.contexto.passagens[exemplo].combinacoesLineares[camada])}`,
              resultado: `δ[${camadaVisual}] = ${vetor(deltasAtuais[exemplo])}`,
              consequencia: "O delta será convertido em gradientes dos parâmetros.",
            };
          },
          { camada: camadaVisual, conexoesCamada: camada }
        ));
        operacoes.push(criarOperacao(
          `gradientes-parametros-${camada}`, "backward", `Calcular gradientes da camada ${camadaVisual}`,
          "Calcula os gradientes dos pesos por produto externo e os gradientes dos vieses.",
          `∂L/∂W[${camadaVisual}] = δ[${camadaVisual}] · a[${camada}]ᵀ; ∂L/∂b[${camadaVisual}] = δ[${camadaVisual}]`,
          () => {
            const gradientesCamada = this.contexto.deltasPorExemplo.map((deltas, indice) =>
              motor.calcularGradientesParametrosCamada(
                deltas[camada],
                this.contexto.passagens[indice].ativacoes[camada]
              )
            );
            const gradientesPesosPorExemplo = this.contexto.gradientesPesosPorExemplo.map((gradientes, indice) => {
              const copia = [...gradientes];
              copia[camada] = gradientesCamada[indice].gradientesPesos;
              return copia;
            });
            const gradientesViesesPorExemplo = this.contexto.gradientesViesesPorExemplo.map((gradientes, indice) => {
              const copia = [...gradientes];
              copia[camada] = gradientesCamada[indice].gradientesVieses;
              return copia;
            });
            this.contexto = { ...this.contexto, gradientesPesosPorExemplo, gradientesViesesPorExemplo };
            return {
              substituicao: `δ₁ = ${numero(this.contexto.deltasPorExemplo[exemplo][camada][0], 5)}; a anterior = ${vetor(this.contexto.passagens[exemplo].ativacoes[camada])}`,
              resultado: `primeira linha de ∂L/∂W = ${vetor(gradientesCamada[exemplo].gradientesPesos[0])}`,
              consequencia: camada > 0 ? "O gradiente será propagado à camada anterior." : "Todos os gradientes individuais podem ser agregados.",
            };
          },
          { camada: camadaVisual, conexoesCamada: camada, todasConexoes: true }
        ));
        if (camada > 0) {
          operacoes.push(criarOperacao(
            `propagar-gradiente-${camada}`, "backward", `Propagar gradiente para a camada ${camada}`,
            "Transporta o erro pela transposta da matriz de pesos para continuar a regra da cadeia.",
            `∂L/∂a[${camada}] = W[${camadaVisual}]ᵀ · δ[${camadaVisual}]`,
            () => {
              const gradientesAtivacao = this.contexto.deltasPorExemplo.map((deltas) =>
                motor.propagarGradienteCamada(this.rede.pesos[camada], deltas[camada])
              );
              this.contexto = { ...this.contexto, gradientesAtivacao };
              return {
                substituicao: `W${camadaVisual}ᵀ · ${vetor(this.contexto.deltasPorExemplo[exemplo][camada])}`,
                resultado: `∂L/∂a[${camada}] = ${vetor(gradientesAtivacao[exemplo])}`,
                consequencia: "A derivada local da camada anterior será aplicada.",
              };
            },
            { camada, conexoesCamada: camada }
          ));
        }
      }

      operacoes.push(criarOperacao(
        "media-gradientes", "backward", "Calcular gradientes médios do lote",
        "Agrega os gradientes individuais na mesma ordem do treinamento normal e divide pelo tamanho do lote.",
        "∇L̄ = (1/m) Σᵢ ∇L⁽ⁱ⁾",
        () => {
          const lista = this.entradas.map((_, indice) => ({
            gradientesPesos: this.contexto.gradientesPesosPorExemplo[indice],
            gradientesVieses: this.contexto.gradientesViesesPorExemplo[indice],
            deltas: this.contexto.deltasPorExemplo[indice],
          }));
          const gradientesMedios = {
            perdaMedia: this.contexto.perdaMedia,
            ...motor.combinarGradientesMedios(lista, this.rede),
          };
          this.contexto = { ...this.contexto, gradientesMedios };
          return {
            substituicao: `m = ${this.entradas.length}; soma e divisão componente a componente`,
            resultado: `∇W1[1,1] médio = ${numero(gradientesMedios.gradientesPesos[0][0][0], 7)}`,
            consequencia: "O otimizador e a taxa de aprendizagem serão recuperados.",
          };
        },
        { todasConexoes: true }
      ));
      operacoes.push(criarOperacao(
        "otimizador", "atualizacao", "Recuperar configuração do otimizador",
        "Seleciona o SGD simples e a taxa de aprendizagem, sem modificar parâmetros ainda.",
        "otimizador = SGD; taxa = η",
        () => ({
          substituicao: `SGD; η = ${numero(this.taxaAprendizagem, 4)}`,
          resultado: "regra de atualização preparada",
          consequencia: "Os novos parâmetros serão calculados.",
        })
      ));
      operacoes.push(criarOperacao(
        "atualizar-parametros", "atualizacao", "Atualizar pesos e vieses",
        "Aplica simultaneamente a descida do gradiente a todos os parâmetros usando uma nova versão da rede.",
        "Wnovo = Watual − η·∂L̄/∂W; bnovo = batual − η·∂L̄/∂b",
        () => {
          const parametrosAntes = motor.copiarRede(this.rede);
          const redeAtualizada = motor.copiarRede(this.rede);
          motor.atualizarParametros(redeAtualizada, this.contexto.gradientesMedios, this.taxaAprendizagem);
          this.rede = redeAtualizada;
          this.contexto = {
            ...this.contexto,
            parametrosAntes,
            parametrosDepois: this.rede,
          };
          const anterior = parametrosAntes.pesos[0][0][0];
          const gradiente = this.contexto.gradientesMedios.gradientesPesos[0][0][0];
          return {
            substituicao: `${numero(anterior, 6)} − ${numero(this.taxaAprendizagem, 3)} × (${numero(gradiente, 7)})`,
            resultado: `W1[1,1]: ${numero(anterior, 6)} → ${numero(this.rede.pesos[0][0][0], 6)}`,
            consequencia: "A nova versão dos parâmetros será registrada.",
          };
        },
        { todasConexoes: true, modificadas: true }
      ));
      operacoes.push(criarOperacao(
        "concluir-epoca", "atualizacao", `Concluir época ${epoca}`,
        "Registra as métricas do lote e torna os parâmetros atualizados o ponto inicial da próxima época.",
        "época ← época + 1",
        () => {
          this.epoca += 1;
          this.contexto = { ...this.contexto, epocaConcluida: true };
          return {
            substituicao: `época concluída = ${this.epoca}`,
            resultado: `perda média = ${numero(this.contexto.perdaMedia, 7)}`,
            consequencia: `A época ${this.epoca + 1} poderá selecionar o lote.`,
          };
        },
        { todasConexoes: true, modificadas: true }
      ));
      return operacoes;
    }

    executarProximaOperacao() {
      if (this.indiceFila >= this.fila.length) {
        this.fila = this.criarOperacoesEpoca();
        this.indiceFila = 0;
      }
      const definicao = this.fila[this.indiceFila];
      this.indiceFila += 1;
      if (definicao.id === "esperado") {
        this.contexto = { ...this.contexto, alvosVisiveis: true };
      }
      const detalhes = definicao.executar();
      const operacao = {
        id: definicao.id,
        fase: definicao.fase,
        nome: definicao.nome,
        descricao: definicao.descricao,
        formula: definicao.formula,
        destaque: definicao.destaque,
        ...detalhes,
      };
      const snapshot = {
        passo: this.historico.length + 1,
        epoca: this.epoca,
        rede: this.rede,
        contexto: this.contexto,
        operacao,
        fila: this.fila,
        indiceFila: this.indiceFila,
      };
      this.historico.push(snapshot);
      this.cursor = this.historico.length - 1;
      return this.obterEstado();
    }

    iniciar() {
      if (this.iniciado) return this.obterEstado();
      this.iniciado = true;
      return this.executarProximaOperacao();
    }

    proximo() {
      if (!this.iniciado) return this.iniciar();
      if (this.cursor < this.historico.length - 1) {
        this.cursor += 1;
        this.restaurarSnapshot(this.historico[this.cursor]);
        return this.obterEstado();
      }
      return this.executarProximaOperacao();
    }

    anterior() {
      if (this.cursor <= 0) return this.obterEstado();
      this.cursor -= 1;
      this.restaurarSnapshot(this.historico[this.cursor]);
      return this.obterEstado();
    }

    irParaPasso(indice) {
      if (indice < 0 || indice >= this.historico.length) return this.obterEstado();
      this.cursor = indice;
      this.restaurarSnapshot(this.historico[this.cursor]);
      return this.obterEstado();
    }

    avancarAteProximaEpoca() {
      const epocaOrigem = this.contexto.epocaEmExecucao || this.epoca;
      let seguranca = 0;
      do {
        this.proximo();
        seguranca += 1;
      } while (
        seguranca < 1000 &&
        !(this.obterEstado().operacao.id === "selecionar-lote" && this.contexto.epocaEmExecucao > epocaOrigem)
      );
      return this.obterEstado();
    }

    restaurarSnapshot(snapshot) {
      this.rede = snapshot.rede;
      this.contexto = snapshot.contexto;
      this.epoca = snapshot.epoca;
      this.fila = snapshot.fila;
      this.indiceFila = snapshot.indiceFila;
    }

    obterEstado() {
      const snapshot = this.historico[this.cursor] || null;
      return {
        iniciado: this.iniciado,
        passo: snapshot?.passo || 0,
        epoca: this.epoca,
        rede: this.rede,
        contexto: this.contexto,
        operacao: snapshot?.operacao || null,
        podeVoltar: this.cursor > 0,
        cursor: this.cursor,
        totalHistorico: this.historico.length,
        historico: this.historico.map((item, indice) => ({
          indice,
          passo: item.passo,
          epoca: item.contexto.epocaEmExecucao || item.epoca,
          fase: item.operacao.fase,
          nome: item.operacao.nome,
          atual: indice === this.cursor,
        })),
        metricas: this.historico
          .slice(0, this.cursor + 1)
          .filter((item) => item.operacao.id === "concluir-epoca")
          .map((item) => ({ epoca: item.epoca, perda: item.contexto.perdaMedia })),
      };
    }
  }

  window.DepuradorRNA = { ControladorDepuracao };
})();
