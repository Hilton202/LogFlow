import { db } from './db.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { 
    writeBatch, 
    doc, 
    collection, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

const auth = getAuth();
const input = document.getElementById('arquivoExcel');
const btnProcessar = document.getElementById('btnProcessar');
const tabelaPrevia = document.getElementById('tabelaPrevia');
let dadosParaImportar = [];
let usuarioLogado = null;

// MONITORA AUTENTICAÇÃO
onAuthStateChanged(auth, (user) => {
    usuarioLogado = user;
    console.log("🔐 AUTH ESTADO:", user ? `LOGADO (${user.uid})` : "DESLOGADO");
});

const termosCodigo = ['MATERIAS', 'MATERIA', 'CODIGO', 'PRODUTO', 'REF', 'ITEM', 'CÓDIGO'];
const termosEstoque = ['ESTOQUE ATUAL', 'ESTOQUE', 'QTD', 'QUANTIDADE', 'SALDO', 'TOTAL', 'ATUAL'];

const normalizar = (txt) => txt.toString().toUpperCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '');

input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const data = evt.target.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonRaw = XLSX.utils.sheet_to_json(sheet);

            if (jsonRaw.length > 0) {
                const colunas = Object.keys(jsonRaw[0]);
                const colCodigo = colunas.find(c => termosCodigo.some(t => normalizar(t) === normalizar(c)));
                const colEstoque = colunas.find(c => termosEstoque.some(t => normalizar(t) === normalizar(c)));

                if (!colCodigo || !colEstoque) {
                    alert(`❌ Colunas não encontradas!\nSua planilha tem: ${colunas.join(", ")}\nPreciso de algo como 'Materias' e 'Estoque'.`);
                    return;
                }

                dadosParaImportar = jsonRaw.map(item => ({
                    id: String(item[colCodigo]).trim().toUpperCase(),
                    qtd: Number(item[colEstoque]) || 0
                })).filter(item => item.id !== "");

                console.log("📊 Excel parseado:", dadosParaImportar.length, "itens");
                exibirPrevia(dadosParaImportar);
                
                btnProcessar.disabled = false;
                btnProcessar.style.backgroundColor = "#16a34a";
                btnProcessar.style.cursor = "pointer";
            }
        } catch (err) {
            console.error("❌ ERRO na leitura Excel:", err);
            alert("Erro ao processar o arquivo Excel: " + err.message);
        }
    };
    reader.readAsBinaryString(file);
});

function exibirPrevia(dados) {
    let html = `<tr><th>PRODUTO DETECTADO</th><th>QTD</th></tr>`;
    dados.slice(0, 5).forEach(item => {
        html += `<tr><td>${item.id}</td><td>${item.qtd}</td></tr>`;
    });
    tabelaPrevia.innerHTML = html;
}

btnProcessar.onclick = async () => {
    console.log("▶️ INICIANDO IMPORT...");
    console.log("📍 Usuário logado?", usuarioLogado ? "SIM" : "NÃO");
    
    if (!usuarioLogado) {
        console.error("❌ ERRO CRÍTICO: Usuário não logado!");
        alert("❌ VOCÊ NÃO ESTÁ LOGADO! Faça login primeiro!");
        return;
    }

    const uid = usuarioLogado.uid;
    console.log("✅ UID DO USUÁRIO:", uid);
    console.log("📦 TOTAL DE ITENS:", dadosParaImportar.length);

    if (dadosParaImportar.length === 0) {
        alert("Nenhum dado para importar!");
        return;
    }

    btnProcessar.disabled = true;
    btnProcessar.innerText = "⏳ ENVIANDO EM LOTE...";

    let batch = writeBatch(db);
    let contador = 0;
    let itemsProcessados = 0;

    try {
        for (const item of dadosParaImportar) {
            console.log(`📝 Processando: ${item.id} (Qtd: ${item.qtd})`);
            
            // CAMINHO CORRETO
            const caminhoCompleto = `usuarios/${uid}/produtos/${item.id}`;
            console.log(`📍 Caminho Firestore: ${caminhoCompleto}`);
            
            const produtoRef = doc(db, "usuarios", uid, "produtos", item.id);
            
            batch.set(produtoRef, {
                codigo: item.id,
                estoque_atual: item.qtd,
                ultima_atualizacao: serverTimestamp()
            }, { merge: true });

            // MOVIMENTAÇÃO
            const movRef = collection(db, "usuarios", uid, "movimentacoes");
            const novoDoc = doc(movRef);
            batch.set(novoDoc, {
                codigo: item.id,
                quantidade: item.qtd,
                tipo: "ENTRADA",
                referencia: "MIGRAÇÃO_LOTE",
                data: serverTimestamp()
            });

            contador++;
            itemsProcessados++;

            if (contador >= 200) {
                console.log(`💾 Commitando ${contador} itens...`);
                await batch.commit();
                batch = writeBatch(db); 
                contador = 0;
            }
        }

        if (contador > 0) {
            console.log(`💾 Commitando últimos ${contador} itens...`);
            await batch.commit();
        }

        console.log("✅ IMPORT CONCLUÍDO!");
        console.log("📊 Total processado:", itemsProcessados);
        
        alert(`🚀 Sucesso! ${itemsProcessados} itens importados para:\n\nusuarios/${uid}/produtos`);
        
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);

    } catch (error) {
        console.error("❌ ERRO GERAL:", error);
        console.error("Mensagem:", error.message);
        console.error("Stack:", error.stack);
        
        alert("❌ ERRO: " + error.message);
        btnProcessar.disabled = false;
        btnProcessar.innerText = "✅ TENTAR NOVAMENTE";
    }
};
