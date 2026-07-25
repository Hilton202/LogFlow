import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

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
const auth = getAuth(app);

let itensParaProcessar = [];

// LIMPAR CÓDIGO
function limparCodigo(codigo) {
    return codigo
        .replace(/\//g, "-")
        .replace(/\\/g, "-")
        .replace(/[:|*?"<>]/g, "-")
        .trim();
}

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

            itensParaProcessar.push({
                codigo: limparCodigo(codigo),
                nome, 
                qtd: Number(qtd), 
                valorUnit: Number(vUn), 
                valorTotal: Number(vTot),
                lote
            });

            html += `<tr><td><strong>${codigo}</strong></td><td>${nome}</td><td>${qtd}</td></tr>`;
        }

        document.getElementById('tabelaItens').innerHTML = html;
        document.getElementById('resultado').style.display = 'block';
    };
    reader.readAsText(file);
};

document.getElementById('btnConfirmarEntrada').onclick = async function() {
    const btn = document.getElementById('btnConfirmarEntrada');
    
    const user = auth.currentUser;
    if (!user) {
        alert("Você não está logado!");
        return;
    }
    
    if (itensParaProcessar.length === 0) return;
    if (!confirm(`Confirmar entrada?`)) return;

    btn.disabled = true;
    btn.innerText = "SALVANDO...";

    try {
        for (const item of itensParaProcessar) {
            const produtoRef = doc(db, "usuarios", user.uid, "produtos", item.codigo);
            
            await setDoc(produtoRef, {
                codigo: item.codigo,
                nome: item.nome,
                estoque_atual: increment(item.qtd),
                preco_custo_ultimo: item.valorUnit,
                ultima_atualizacao: serverTimestamp()
            }, { merge: true });

            await addDoc(collection(db, "usuarios", user.uid, "movimentacoes"), {
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
        alert("Erro ao salvar: " + error.message);
        btn.disabled = false;
    }
};