import { db } from './db.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { 
    writeBatch, 
    doc, 
    collection, 
    setDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

const auth = getAuth();
const input = document.getElementById('arquivoExcel');
const btnProcessar = document.getElementById('btnProcessar');
const tabelaPrevia = document.getElementById('tabelaPrevia');
let dadosParaImportar = [];
let usuarioAtual = null;

// ✅ MONITORA AUTENTICAÇÃO EM TEMPO REAL
onAuthStateChanged(auth, (user) => {
    usuarioAtual = user;
    console.log("🔐 Status de autenticação:", user ? "LOGADO ✅" : "DESLOGADO ❌");
    if (user) {
        console.log("UID:", user.uid);
    }
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

                console.log("📊 Dados parseados:", dadosParaImportar.length, "itens");
                exibirPrevia(dadosParaImportar);
                
                btnProcessar.disabled = false;
                btnProcessar.style.backgroundColor = "#16a34a";
                btnProcessar.style.cursor = "pointer";
            }
        } catch (err) {
            console.error("❌ Erro na leitura do Excel:", err);
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
    console.log("▶️ Iniciando importação...");
    
    if (dadosParaImportar.length === 0) {
        alert("Nenhum dado para importar!");
        return;
    }

    // ✅ VERIFICA SE ESTÁ LOGADO
    if (!usuarioAtual) {
        console.error("❌ ERRO: Usuário não está logado!");
        alert("❌ ERRO: Você não está logado! Faça login primeiro.");
        return;
    }

    const uid = usuarioAtual.uid;
    console.log("✅ Usuário autenticado com UID:", uid);
    console.log("📦 Importando", dadosParaImportar.length, "itens...");

    btnProcessar.disabled = true;
    btnProcessar.innerText = "⏳ ENVIANDO EM LOTE...";

    let batch = writeBatch(db);
    let contador = 0;
    let erros = 0;

    try {
        for (const item of dadosParaImportar) {
            try {
                console.log(`📝 Processando: ${item.id} (Qtd: ${item.qtd})`);
                
                // ✅ SALVA PRODUTO NA SUB-COLEÇÃO DO USUÁRIO
                const produtoRef = doc(db, "usuarios", uid, "produtos", item.id);
                batch.set(produtoRef, {
                    codigo: item.id,
                    estoque_atual: item.qtd,
                    ultima_atualizacao: serverTimestamp()
                }, { merge: true });

                // ✅ SALVA MOVIMENTAÇÃO NA SUB-COLEÇÃO DO USUÁRIO
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

                if (contador >= 200) {
                    console.log(`💾 Commitando ${contador} itens (batch)...`);
                    await batch.commit();
                    batch = writeBatch(db);
                    contador = 0;
                }
            } catch (itemError) {
                console.error(`❌ Erro ao processar ${item.id}:`, itemError);
                erros++;
            }
        }

        if (contador > 0) {
            console.log(`💾 Commitando últimos ${contador} itens...`);
            await batch.commit();
        }

        const mensagem = erros > 0 
            ? `⚠️ Importação concluída com ${erros} erros!\n✅ ${dadosParaImportar.length - erros} itens importados.`
            : `🚀 Sucesso! ${dadosParaImportar.length} itens importados!`;
        
        console.log("✅ Importação finalizada!");
        alert(mensagem);
        
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);

    } catch (error) {
        console.error("❌ ERRO GERAL NA IMPORTAÇÃO:", error);
        console.error("Tipo de erro:", error.name);
        console.error("Mensagem:", error.message);
        console.error("Stack:", error.stack);
        
        alert("❌ Erro ao salvar no Firebase:\n" + error.message);
        btnProcessar.disabled = false;
        btnProcessar.innerText = "✅ TENTAR NOVAMENTE";
    }
};
