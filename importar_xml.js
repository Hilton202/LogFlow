import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// 1. Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBVu2nD3RJg5q-CH-oyxJvn-6agQw09rsA",
    authDomain: "sistema-de-estoque-8ff60.firebaseapp.com",
    projectId: "sistema-de-estoque-8ff60",
    storageBucket: "sistema-de-estoque-8ff60.firebasestorage.app",
    messagingSenderId: "350798221431",
    appId: "1:350798221431:web:ee97b59412b5aa0da2b672"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

let itensParaProcessar = [];

// --- FUNÇÃO: LEITOR DE CÓDIGO DE BARRAS ATUALIZADA ---
function iniciarLeitor() {
    const areaCamera = document.querySelector('#camera');
    
    // Força a área da câmera a aparecer
    areaCamera.style.display = 'block';

    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: areaCamera,
            constraints: { 
                // environment foca na câmera traseira do celular
                facingMode: "environment" 
            }
        },
        decoder: {
            // ean_reader é o padrão de mercado (caixas de remédio, alimentos, etc)
            readers: ["ean_reader", "code_128_reader", "ean_8_reader"] 
        }
    }, function(err) {
        if (err) {
            console.error("Erro ao iniciar câmera:", err);
            alert("Erro ao abrir a câmera. Verifique se você deu permissão no navegador e se está usando HTTPS ou Localhost.");
            return;
        }
        console.log("Câmera iniciada com sucesso!");
        Quagga.start();
    });

    Quagga.onDetected(async (data) => {
        const codigoBarras = data.codeResult.code;
        
        // Para a câmera imediatamente após ler para não travar
        Quagga.stop();
        areaCamera.style.display = 'none'; // Esconde a câmera após a leitura

        alert("Código detectado: " + codigoBarras);

        // Busca o produto no Firebase
        const produtoRef = doc(db, "produtos", codigoBarras);
        try {
            const snap = await getDoc(produtoRef);

            if (snap.exists()) {
                const prod = snap.data();
                alert(`Produto Encontrado: ${prod.nome}\nEstoque: ${prod.estoque_atual}`);
            } else {
                alert("Produto não cadastrado! Use a função de Importar XML para cadastrá-lo pela primeira vez.");
            }
        } catch (error) {
            console.error("Erro ao buscar no Firebase:", error);
        }
    });
}

// Evento para o botão da câmera
const btnCamera = document.getElementById('btnAbrirCamera');
if(btnCamera) {
    btnCamera.onclick = iniciarLeitor;
}

// --- 2. Função para XML (Mantida com melhorias de seletor) ---
document.getElementById('btnProcessar').onclick = function() {
    const file = document.getElementById('xmlFile').files[0];
    if (!file) return alert("Selecione um arquivo XML!");

    const reader = new FileReader();
    reader.onload = function(e) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(e.target.result, "text/xml");

        let produtosXML = xmlDoc.getElementsByTagNameNS("*", "det");
        if (produtosXML.length === 0) produtosXML = xmlDoc.getElementsByTagNameNS("*", "prod");

        if (produtosXML.length === 0) return alert("XML inválido ou sem itens!");

        let html = '';
        itensParaProcessar = [];

        for (let i = 0; i < produtosXML.length; i++) {
            const item = produtosXML[i];
            const codigo = item.getElementsByTagNameNS("*", "cProd")[0]?.textContent || "S/C";
            const nome = item.getElementsByTagNameNS("*", "xProd")[0]?.textContent || "Sem Descrição";
            const qtd = item.getElementsByTagNameNS("*", "qCom")[0]?.textContent || "0";
            const vUn = item.getElementsByTagNameNS("*", "vUnCom")[0]?.textContent || "0";
            const vTot = item.getElementsByTagNameNS("*", "vProd")[0]?.textContent || "0";
            const lote = item.getElementsByTagNameNS("*", "nLote")[0]?.textContent || "GERAL";
            const validade = item.getElementsByTagNameNS("*", "dVal")[0]?.textContent || "";

            itensParaProcessar.push({
                codigo, nome, qtd: Number(qtd), 
                valorUnit: Number(vUn), valorTotal: Number(vTot),
                lote, validade
            });

            html += `<tr><td><strong>${codigo}</strong></td><td>${nome}</td><td>${qtd}</td></tr>`;
        }

        document.getElementById('tabelaItens').innerHTML = html;
        document.getElementById('resultado').style.display = 'block';
    };
    reader.readAsText(file);
};

// --- 3. Função para Gravar no Firebase (Mantida) ---
document.getElementById('btnConfirmarEntrada').onclick = async function() {
    const btn = document.getElementById('btnConfirmarEntrada');
    if (itensParaProcessar.length === 0) return;
    if (!confirm(`Confirmar entrada?`)) return;

    btn.disabled = true;
    btn.innerText = "SALVANDO...";

    try {
        for (const item of itensParaProcessar) {
            const produtoRef = doc(db, "produtos", item.codigo);
            await setDoc(produtoRef, {
                nome: item.nome,
                estoque_atual: increment(item.qtd),
                preco_custo_ultimo: item.valorUnit,
                ultima_atualizacao: serverTimestamp()
            }, { merge: true });

            await addDoc(collection(db, "movimentacoes"), {
                codigo: item.codigo,
                nome: item.nome,
                quantidade: item.qtd,
                valor_unitario: item.valorUnit,
                valor_total: item.valorTotal,
                lote: item.lote,
                tipo: "ENTRADA",
                data: serverTimestamp()
            });
        }
        alert("✅ Concluído!");
        window.location.href = 'dashboard.html';
    } catch (error) {
        console.error(error);
        alert("Erro ao salvar.");
        btn.disabled = false;
    }
};