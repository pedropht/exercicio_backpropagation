(function () {
  "use strict";

  const CORES_CLASSES = ["#72d6c9", "#f0b35d", "#c78cff"];
  const COR_TEXTO = "#8f9b99";
  const COR_LINHA = "#2a3235";
  const COR_VERDE = "#b6f36b";
  const SVG_NS = "http://www.w3.org/2000/svg";

  function prepararCanvas(canvas) {
    const proporcao = window.devicePixelRatio || 1;
    const largura = Math.max(240, canvas.clientWidth);
    const altura = Math.max(180, canvas.clientHeight);
    if (canvas.width !== Math.round(largura * proporcao) || canvas.height !== Math.round(altura * proporcao)) {
      canvas.width = Math.round(largura * proporcao);
      canvas.height = Math.round(altura * proporcao);
    }
    const contexto = canvas.getContext("2d");
    contexto.setTransform(proporcao, 0, 0, proporcao, 0, 0);
    contexto.clearRect(0, 0, largura, altura);
    return { contexto, largura, altura };
  }

  function limitar(valor, minimo, maximo) {
    return Math.max(minimo, Math.min(maximo, valor));
  }

  function desenharMensagem(contexto, largura, altura, mensagem) {
    contexto.fillStyle = COR_TEXTO;
    contexto.font = "12px Cascadia Mono, monospace";
    contexto.textAlign = "center";
    contexto.fillText(mensagem, largura / 2, altura / 2);
  }

  function criarElementoSvg(nome, atributos = {}) {
    const elemento = document.createElementNS(SVG_NS, nome);
    Object.entries(atributos).forEach(([chave, valor]) => elemento.setAttribute(chave, valor));
    return elemento;
  }

  function desenharRede(svg, rede, passagem, gradientes, etapa, aoSelecionar, destaque = {}) {
    const largura = Math.max(620, svg.clientWidth || 620);
    const altura = 320;
    svg.setAttribute("viewBox", `0 0 ${largura} ${altura}`);
    svg.replaceChildren();
    svg.className.baseVal = `rede-svg etapa-${etapa}`;

    const quantidades = rede.arquitetura;
    const margemX = 55;
    const posicoes = quantidades.map((quantidade, camada) => {
      const x = margemX + camada * ((largura - 2 * margemX) / (quantidades.length - 1));
      const espacamento = Math.min(48, 250 / Math.max(1, quantidade - 1));
      const inicioY = altura / 2 - ((quantidade - 1) * espacamento) / 2;
      return Array.from({ length: quantidade }, (_, neuronio) => ({ x, y: inicioY + neuronio * espacamento }));
    });

    for (let camada = 1; camada < quantidades.length; camada += 1) {
      for (let neuronio = 0; neuronio < quantidades[camada]; neuronio += 1) {
        for (let anterior = 0; anterior < quantidades[camada - 1]; anterior += 1) {
          const peso = rede.pesos[camada - 1][neuronio][anterior];
          const pesoVisual = destaque.parametrosOcultos ? 0 : peso;
          const origem = posicoes[camada - 1][anterior];
          const destino = posicoes[camada][neuronio];
          const conexaoAtiva = destaque.todasConexoes || destaque.conexoesCamada === camada - 1;
          const conexaoPendente = passagem && !passagem.ativacoes?.[camada];
          const classesConexao = [
            "conexao",
            conexaoAtiva ? "ativa" : "",
            conexaoPendente ? "pendente" : "",
            destaque.modificadas && conexaoAtiva ? "modificada" : "",
          ].filter(Boolean).join(" ");
          const linha = criarElementoSvg("line", {
            x1: origem.x + 14,
            y1: origem.y,
            x2: destino.x - 14,
            y2: destino.y,
            stroke: destaque.parametrosOcultos ? "#465155" : (peso >= 0 ? "#64c7ff" : "#ff6f61"),
            "stroke-width": limitar(Math.abs(pesoVisual) * 2.2, 0.4, 4),
            "stroke-opacity": destaque.parametrosOcultos ? 0.2 : limitar(0.22 + Math.abs(peso) * 0.42, 0.22, 0.86),
            class: classesConexao,
          });
          linha.style.cursor = "pointer";
          linha.addEventListener("click", () => aoSelecionar({ tipo: "peso", camada: camada - 1, neuronio, anterior }));
          svg.appendChild(linha);
        }
      }
    }

    const nomesCamadas = quantidades.map((_, indice) => {
      if (indice === 0) return "ENTRADA";
      if (indice === quantidades.length - 1) return "SAÍDA";
      return `OCULTA ${indice}`;
    });
    nomesCamadas.forEach((nome, camada) => {
      const texto = criarElementoSvg("text", {
        x: posicoes[camada][0].x,
        y: 17,
        fill: COR_TEXTO,
        "font-size": 9,
        "font-family": "Cascadia Mono, monospace",
        "text-anchor": "middle",
      });
      texto.textContent = nome;
      svg.appendChild(texto);
    });

    posicoes.forEach((camadaPosicoes, camada) => {
      camadaPosicoes.forEach((posicao, neuronio) => {
        const valorAtivacao = passagem?.ativacoes?.[camada]?.[neuronio];
        const intensidade = Number.isFinite(valorAtivacao) ? limitar(Math.abs(valorAtivacao), 0, 1) : 0;
        const neuronioAtivo = destaque.camada === camada &&
          (destaque.neuronio == null || destaque.neuronio === neuronio);
        const neuronioPendente = passagem && !passagem.ativacoes?.[camada];
        const grupo = criarElementoSvg("g", {
          class: ["neuronio", neuronioAtivo ? "ativo" : "", neuronioPendente ? "pendente" : ""].filter(Boolean).join(" "),
        });
        grupo.style.cursor = "pointer";
        grupo.addEventListener("click", () => aoSelecionar({ tipo: "neuronio", camada, neuronio }));
        const circulo = criarElementoSvg("circle", {
          cx: posicao.x,
          cy: posicao.y,
          r: 13,
          fill: `rgba(182,243,107,${0.05 + intensidade * 0.55})`,
          stroke: camada === 0 ? "#8f9b99" : COR_VERDE,
          "stroke-width": neuronioAtivo || (etapa === "tras" && camada > 0) ? 2.5 : 1,
        });
        const texto = criarElementoSvg("text", {
          x: posicao.x,
          y: posicao.y + 3,
          fill: "#edf1ec",
          "font-size": 7.5,
          "font-family": "Cascadia Mono, monospace",
          "text-anchor": "middle",
        });
        texto.textContent = Number.isFinite(valorAtivacao) ? valorAtivacao.toFixed(2) : "—";
        grupo.append(circulo, texto);

        if (etapa === "tras" && camada > 0 && gradientes?.deltas?.[camada - 1]) {
          const delta = gradientes.deltas[camada - 1][neuronio];
          const rotuloDelta = criarElementoSvg("text", {
            x: posicao.x + 18,
            y: posicao.y - 11,
            fill: "#f2c14e",
            "font-size": 6.5,
            "font-family": "Cascadia Mono, monospace",
          });
          rotuloDelta.textContent = `δ ${delta.toExponential(1)}`;
          grupo.appendChild(rotuloDelta);
        }
        svg.appendChild(grupo);
      });
    });
  }

  function desenharCurvaPerda(canvas, historico, epocaMaxima) {
    const { contexto, largura, altura } = prepararCanvas(canvas);
    if (!historico.length) return desenharMensagem(contexto, largura, altura, "Sem histórico");
    const margem = { esquerda: 48, direita: 15, topo: 15, base: 32 };
    const areaLargura = largura - margem.esquerda - margem.direita;
    const areaAltura = altura - margem.topo - margem.base;
    const perdas = historico.map((ponto) => ponto.perda);
    const perdaMaxima = Math.max(...perdas, 1e-8);
    const perdaMinima = Math.min(...perdas);
    const escalaY = (perda) => margem.topo + areaAltura * (perdaMaxima - perda) / Math.max(1e-9, perdaMaxima - perdaMinima);
    const escalaX = (epoca) => margem.esquerda + areaLargura * epoca / Math.max(1, epocaMaxima);

    contexto.strokeStyle = COR_LINHA;
    contexto.lineWidth = 1;
    contexto.fillStyle = COR_TEXTO;
    contexto.font = "9px Cascadia Mono, monospace";
    contexto.textAlign = "right";
    for (let linha = 0; linha <= 4; linha += 1) {
      const y = margem.topo + areaAltura * linha / 4;
      const valor = perdaMaxima - (perdaMaxima - perdaMinima) * linha / 4;
      contexto.beginPath();
      contexto.moveTo(margem.esquerda, y);
      contexto.lineTo(largura - margem.direita, y);
      contexto.stroke();
      contexto.fillText(valor.toFixed(4), margem.esquerda - 7, y + 3);
    }

    const gradiente = contexto.createLinearGradient(0, margem.topo, 0, altura - margem.base);
    gradiente.addColorStop(0, "rgba(182,243,107,.28)");
    gradiente.addColorStop(1, "rgba(182,243,107,0)");
    contexto.beginPath();
    historico.forEach((ponto, indice) => {
      const x = escalaX(ponto.epoca);
      const y = escalaY(ponto.perda);
      if (indice === 0) contexto.moveTo(x, y); else contexto.lineTo(x, y);
    });
    contexto.lineTo(escalaX(historico.at(-1).epoca), altura - margem.base);
    contexto.lineTo(escalaX(historico[0].epoca), altura - margem.base);
    contexto.closePath();
    contexto.fillStyle = gradiente;
    contexto.fill();

    contexto.beginPath();
    historico.forEach((ponto, indice) => {
      const x = escalaX(ponto.epoca);
      const y = escalaY(ponto.perda);
      if (indice === 0) contexto.moveTo(x, y); else contexto.lineTo(x, y);
    });
    contexto.strokeStyle = COR_VERDE;
    contexto.lineWidth = 2;
    contexto.stroke();
    contexto.fillStyle = COR_TEXTO;
    contexto.textAlign = "center";
    contexto.fillText("época", margem.esquerda + areaLargura / 2, altura - 7);
  }

  function desenharMapaPesos(canvas, matriz) {
    const { contexto, largura, altura } = prepararCanvas(canvas);
    if (!matriz?.length) return desenharMensagem(contexto, largura, altura, "Sem pesos");
    const linhas = matriz.length;
    const colunas = matriz[0].length;
    const margem = { esquerda: 35, direita: 10, topo: 15, base: 25 };
    const larguraCelula = (largura - margem.esquerda - margem.direita) / colunas;
    const alturaCelula = (altura - margem.topo - margem.base) / linhas;
    const maximo = Math.max(...matriz.flat().map(Math.abs), 1e-9);

    matriz.forEach((linha, y) => linha.forEach((valor, x) => {
      const intensidade = Math.abs(valor) / maximo;
      contexto.fillStyle = valor >= 0
        ? `rgba(100,199,255,${0.12 + intensidade * 0.78})`
        : `rgba(255,111,97,${0.12 + intensidade * 0.78})`;
      contexto.fillRect(margem.esquerda + x * larguraCelula + 1, margem.topo + y * alturaCelula + 1, larguraCelula - 2, alturaCelula - 2);
      if (larguraCelula > 42 && alturaCelula > 25) {
        contexto.fillStyle = "#edf1ec";
        contexto.font = "9px Cascadia Mono, monospace";
        contexto.textAlign = "center";
        contexto.fillText(valor.toFixed(3), margem.esquerda + (x + .5) * larguraCelula, margem.topo + (y + .5) * alturaCelula + 3);
      }
    }));
    contexto.fillStyle = COR_TEXTO;
    contexto.font = "9px Cascadia Mono, monospace";
    contexto.textAlign = "right";
    for (let y = 0; y < linhas; y += 1) contexto.fillText(`n${y + 1}`, margem.esquerda - 6, margem.topo + (y + .5) * alturaCelula + 3);
    contexto.textAlign = "center";
    for (let x = 0; x < colunas; x += 1) contexto.fillText(`a${x + 1}`, margem.esquerda + (x + .5) * larguraCelula, altura - 7);
  }

  function calcularSuperficie(rede, entradas, saidas, parametroX, parametroY, tamanho = 19) {
    const motor = window.RedeNeuralDidatica;
    const centroX = motor.obterParametro(rede, parametroX);
    const centroY = motor.obterParametro(rede, parametroY);
    const raioX = Math.max(0.8, Math.abs(centroX) * 0.8);
    const raioY = Math.max(0.8, Math.abs(centroY) * 0.8);
    const minimoX = centroX - raioX;
    const maximoX = centroX + raioX;
    const minimoY = centroY - raioY;
    const maximoY = centroY + raioY;
    const redeTemporaria = motor.copiarRede(rede);
    const valores = [];

    for (let y = 0; y < tamanho; y += 1) {
      const valorY = maximoY - y * (maximoY - minimoY) / (tamanho - 1);
      const linha = [];
      for (let x = 0; x < tamanho; x += 1) {
        const valorX = minimoX + x * (maximoX - minimoX) / (tamanho - 1);
        motor.definirParametro(redeTemporaria, parametroX, valorX);
        motor.definirParametro(redeTemporaria, parametroY, valorY);
        linha.push(motor.avaliar(entradas, saidas, redeTemporaria).perdaMedia);
      }
      valores.push(linha);
    }
    return { valores, minimoX, maximoX, minimoY, maximoY, centroX, centroY, parametroX, parametroY };
  }

  function corSuperficie(proporcao) {
    const p = limitar(proporcao, 0, 1);
    const vermelho = Math.round(25 + p * 130);
    const verde = Math.round(65 + (1 - p) * 105);
    const azul = Math.round(72 + p * 40);
    return `rgb(${vermelho},${verde},${azul})`;
  }

  function desenharSuperficie(canvas, superficie, trajetoria, pontoAtual, vetorGradiente) {
    const { contexto, largura, altura } = prepararCanvas(canvas);
    if (!superficie) return desenharMensagem(contexto, largura, altura, "Recalculando corte da perda…");
    const margem = { esquerda: 42, direita: 12, topo: 10, base: 30 };
    const areaLargura = largura - margem.esquerda - margem.direita;
    const areaAltura = altura - margem.topo - margem.base;
    const valoresPlanos = superficie.valores.flat();
    const minimo = Math.min(...valoresPlanos);
    const maximo = Math.max(...valoresPlanos);
    const linhas = superficie.valores.length;
    const colunas = superficie.valores[0].length;
    const escalaX = (valor) => margem.esquerda + areaLargura * (valor - superficie.minimoX) / (superficie.maximoX - superficie.minimoX);
    const escalaY = (valor) => margem.topo + areaAltura * (superficie.maximoY - valor) / (superficie.maximoY - superficie.minimoY);

    superficie.valores.forEach((linha, y) => linha.forEach((valor, x) => {
      const normalizado = (valor - minimo) / Math.max(1e-12, maximo - minimo);
      contexto.fillStyle = corSuperficie(Math.sqrt(normalizado));
      contexto.fillRect(margem.esquerda + x * areaLargura / colunas, margem.topo + y * areaAltura / linhas, areaLargura / colunas + 1, areaAltura / linhas + 1);
    }));

    contexto.strokeStyle = "rgba(255,255,255,.15)";
    contexto.strokeRect(margem.esquerda, margem.topo, areaLargura, areaAltura);
    const pontosVisiveis = trajetoria.filter((ponto) =>
      ponto.x >= superficie.minimoX && ponto.x <= superficie.maximoX &&
      ponto.y >= superficie.minimoY && ponto.y <= superficie.maximoY
    );
    if (pontosVisiveis.length) {
      contexto.beginPath();
      pontosVisiveis.forEach((ponto, indice) => {
        const x = escalaX(ponto.x);
        const y = escalaY(ponto.y);
        if (indice === 0) contexto.moveTo(x, y); else contexto.lineTo(x, y);
      });
      contexto.strokeStyle = "#edf1ec";
      contexto.lineWidth = 1.5;
      contexto.stroke();
    }

    if (pontoAtual) {
      const x = escalaX(pontoAtual.x);
      const y = escalaY(pontoAtual.y);
      contexto.beginPath();
      contexto.arc(x, y, 4.5, 0, Math.PI * 2);
      contexto.fillStyle = COR_VERDE;
      contexto.fill();
      if (vetorGradiente) {
        const destinoX = escalaX(pontoAtual.x + vetorGradiente.x);
        const destinoY = escalaY(pontoAtual.y + vetorGradiente.y);
        contexto.beginPath();
        contexto.moveTo(x, y);
        contexto.lineTo(destinoX, destinoY);
        contexto.strokeStyle = "#f2c14e";
        contexto.lineWidth = 2;
        contexto.stroke();
      }
    }

    contexto.fillStyle = COR_TEXTO;
    contexto.font = "9px Cascadia Mono, monospace";
    contexto.textAlign = "center";
    contexto.fillText(superficie.parametroX.rotulo, margem.esquerda + areaLargura / 2, altura - 7);
    contexto.save();
    contexto.translate(10, margem.topo + areaAltura / 2);
    contexto.rotate(-Math.PI / 2);
    contexto.fillText(superficie.parametroY.rotulo, 0, 0);
    contexto.restore();
  }

  function desenharParalelas(canvas, itens, atributosMinimos, atributosMaximos, indiceSelecionado, predicoes = null) {
    const { contexto, largura, altura } = prepararCanvas(canvas);
    const margem = { esquerda: 34, direita: 34, topo: 34, base: 42 };
    const areaLargura = largura - margem.esquerda - margem.direita;
    const areaAltura = altura - margem.topo - margem.base;
    const eixoX = (atributo) => margem.esquerda + atributo * areaLargura / 3;
    const eixoY = (valor, atributo) => margem.topo + areaAltura * (1 - (valor - atributosMinimos[atributo]) / (atributosMaximos[atributo] - atributosMinimos[atributo]));

    contexto.font = "9px Cascadia Mono, monospace";
    for (let atributo = 0; atributo < 4; atributo += 1) {
      const x = eixoX(atributo);
      contexto.strokeStyle = COR_LINHA;
      contexto.beginPath();
      contexto.moveTo(x, margem.topo);
      contexto.lineTo(x, altura - margem.base);
      contexto.stroke();
      contexto.fillStyle = COR_TEXTO;
      contexto.textAlign = "center";
      const nomesCurtos = ["sépala C", "sépala L", "pétala C", "pétala L"];
      contexto.fillText(nomesCurtos[atributo], x, altura - 17);
      contexto.fillText(atributosMaximos[atributo].toFixed(1), x, margem.topo - 8);
      contexto.fillText(atributosMinimos[atributo].toFixed(1), x, altura - margem.base + 13);
    }

    itens.forEach((item, indice) => {
      const selecionado = item.indice === indiceSelecionado;
      const classeCor = predicoes?.[indice]?.classePredita ?? item.classe;
      contexto.beginPath();
      item.atributos.forEach((valor, atributo) => {
        const x = eixoX(atributo);
        const y = eixoY(valor, atributo);
        if (atributo === 0) contexto.moveTo(x, y); else contexto.lineTo(x, y);
      });
      contexto.strokeStyle = CORES_CLASSES[classeCor];
      contexto.globalAlpha = selecionado ? 1 : (itens.length > 40 ? .14 : .32);
      contexto.lineWidth = selecionado ? 3 : 1;
      contexto.stroke();
    });
    contexto.globalAlpha = 1;
  }

  function limitesAtributos(dados) {
    return {
      minimos: Array.from({ length: 4 }, (_, atributo) => Math.min(...dados.map((item) => item.atributos[atributo]))),
      maximos: Array.from({ length: 4 }, (_, atributo) => Math.max(...dados.map((item) => item.atributos[atributo]))),
    };
  }

  function desenharProjecao2d(canvas, dados, rede, preparacao, eixoX, eixoY, valoresFixos, indiceSelecionado) {
    const { contexto, largura, altura } = prepararCanvas(canvas);
    const limites = limitesAtributos(dados);
    const margem = { esquerda: 42, direita: 18, topo: 16, base: 35 };
    const areaLargura = largura - margem.esquerda - margem.direita;
    const areaAltura = altura - margem.topo - margem.base;
    const colunas = Math.max(26, Math.floor(areaLargura / 10));
    const linhas = Math.max(18, Math.floor(areaAltura / 10));
    const motor = window.RedeNeuralDidatica;

    for (let linha = 0; linha < linhas; linha += 1) {
      for (let coluna = 0; coluna < colunas; coluna += 1) {
        const entrada = [...valoresFixos];
        entrada[eixoX] = limites.minimos[eixoX] + (coluna + .5) / colunas * (limites.maximos[eixoX] - limites.minimos[eixoX]);
        entrada[eixoY] = limites.maximos[eixoY] - (linha + .5) / linhas * (limites.maximos[eixoY] - limites.minimos[eixoY]);
        const classe = motor.indiceMaiorValor(motor.passagemParaFrente(preparacao.padronizar(entrada), rede).saida);
        contexto.fillStyle = CORES_CLASSES[classe];
        contexto.globalAlpha = .14;
        contexto.fillRect(margem.esquerda + coluna * areaLargura / colunas, margem.topo + linha * areaAltura / linhas, areaLargura / colunas + 1, areaAltura / linhas + 1);
      }
    }
    contexto.globalAlpha = 1;
    const mapearX = (valor) => margem.esquerda + (valor - limites.minimos[eixoX]) / (limites.maximos[eixoX] - limites.minimos[eixoX]) * areaLargura;
    const mapearY = (valor) => margem.topo + (limites.maximos[eixoY] - valor) / (limites.maximos[eixoY] - limites.minimos[eixoY]) * areaAltura;
    dados.forEach((item) => {
      const selecionado = item.indice === indiceSelecionado;
      contexto.beginPath();
      contexto.arc(mapearX(item.atributos[eixoX]), mapearY(item.atributos[eixoY]), selecionado ? 6 : 3, 0, Math.PI * 2);
      contexto.fillStyle = CORES_CLASSES[item.classe];
      contexto.fill();
      if (selecionado) {
        contexto.strokeStyle = "#edf1ec";
        contexto.lineWidth = 2;
        contexto.stroke();
      }
    });
    desenharRotulosEixos(contexto, largura, altura, margem, eixoX, eixoY);
  }

  function desenharRotulosEixos(contexto, largura, altura, margem, eixoX, eixoY) {
    const nomes = ["comp. sépala", "larg. sépala", "comp. pétala", "larg. pétala"];
    contexto.fillStyle = COR_TEXTO;
    contexto.font = "9px Cascadia Mono, monospace";
    contexto.textAlign = "center";
    contexto.fillText(nomes[eixoX], margem.esquerda + (largura - margem.esquerda - margem.direita) / 2, altura - 9);
    contexto.save();
    contexto.translate(11, margem.topo + (altura - margem.topo - margem.base) / 2);
    contexto.rotate(-Math.PI / 2);
    contexto.fillText(nomes[eixoY], 0, 0);
    contexto.restore();
  }

  function projetar3d(ponto, anguloX, anguloY, escala, centroX, centroY) {
    const cosY = Math.cos(anguloY);
    const sinY = Math.sin(anguloY);
    const x1 = ponto.x * cosY - ponto.z * sinY;
    const z1 = ponto.x * sinY + ponto.z * cosY;
    const cosX = Math.cos(anguloX);
    const sinX = Math.sin(anguloX);
    const y1 = ponto.y * cosX - z1 * sinX;
    const z2 = ponto.y * sinX + z1 * cosX;
    const perspectiva = 1 / (1 + z2 * .13);
    return { x: centroX + x1 * escala * perspectiva, y: centroY - y1 * escala * perspectiva, profundidade: z2 };
  }

  function desenharProjecao3d(canvas, dados, rede, preparacao, eixos, valoresFixos, indiceSelecionado, rotacao) {
    const { contexto, largura, altura } = prepararCanvas(canvas);
    const limites = limitesAtributos(dados);
    const normalizar = (valor, atributo) => ((valor - limites.minimos[atributo]) / (limites.maximos[atributo] - limites.minimos[atributo]) - .5) * 2;
    const pontos = [];
    const motor = window.RedeNeuralDidatica;

    for (let ix = 0; ix < 7; ix += 1) {
      for (let iy = 0; iy < 7; iy += 1) {
        for (let iz = 0; iz < 7; iz += 1) {
          const entrada = [...valoresFixos];
          [ix, iy, iz].forEach((passo, posicao) => {
            const atributo = eixos[posicao];
            entrada[atributo] = limites.minimos[atributo] + passo / 6 * (limites.maximos[atributo] - limites.minimos[atributo]);
          });
          const classe = motor.indiceMaiorValor(motor.passagemParaFrente(preparacao.padronizar(entrada), rede).saida);
          pontos.push({
            x: normalizar(entrada[eixos[0]], eixos[0]),
            y: normalizar(entrada[eixos[1]], eixos[1]),
            z: normalizar(entrada[eixos[2]], eixos[2]),
            classe,
            grade: true,
          });
        }
      }
    }
    dados.forEach((item) => pontos.push({
      x: normalizar(item.atributos[eixos[0]], eixos[0]),
      y: normalizar(item.atributos[eixos[1]], eixos[1]),
      z: normalizar(item.atributos[eixos[2]], eixos[2]),
      classe: item.classe,
      selecionado: item.indice === indiceSelecionado,
      grade: false,
    }));
    const escala = Math.min(largura, altura) * .28;
    pontos.forEach((ponto) => Object.assign(ponto, projetar3d(ponto, rotacao.x, rotacao.y, escala, largura / 2, altura / 2)));
    pontos.sort((a, b) => a.profundidade - b.profundidade);
    pontos.forEach((ponto) => {
      contexto.beginPath();
      contexto.arc(ponto.x, ponto.y, ponto.grade ? 2 : (ponto.selecionado ? 7 : 3.5), 0, Math.PI * 2);
      contexto.fillStyle = CORES_CLASSES[ponto.classe];
      contexto.globalAlpha = ponto.grade ? .12 : .9;
      contexto.fill();
      if (ponto.selecionado) {
        contexto.globalAlpha = 1;
        contexto.strokeStyle = "#edf1ec";
        contexto.lineWidth = 2;
        contexto.stroke();
      }
    });
    contexto.globalAlpha = 1;
    contexto.fillStyle = COR_TEXTO;
    contexto.font = "9px Cascadia Mono, monospace";
    contexto.fillText("volume colorido = classe predita · pontos = classe esperada", 12, altura - 12);
  }

  window.VisualizacoesRNA = {
    CORES_CLASSES,
    desenharRede,
    desenharCurvaPerda,
    desenharMapaPesos,
    calcularSuperficie,
    desenharSuperficie,
    desenharParalelas,
    limitesAtributos,
    desenharProjecao2d,
    desenharProjecao3d,
  };
})();
