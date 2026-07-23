import { db } from './db.js';
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { 
    writeBatch, 
    doc, 
    collection, 
    addDoc, 
    setDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

const auth = getAuth();
const input = document.getElementById('arquivoExcel');
const btnProcessar = document.getElementById('btnProcessar');
const tabelaPrevia = document.getElementById('tabelaPrevia');
let dadosParaImportar = [];

// Dicionário inteligente (Sinônimos para as colunas)
const termosCodigo = ['MATERIAS', 'MATERIA', 'CODIGO', 'PRODUTO', 'REF', 'ITEM', 'CÓDIGO'];
const termosEstoque = ['ESTOQUE ATUAL', 'ESTOQUE', 'QTD', 'QUANTIDADE', 'SALDO', 'TOTAL', 'ATUAL'];

// Função para limpar nomes de colunas
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
                
                // Encontra as colunas dinamicamente
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

                exibirPrevia(dadosParaImportar);
                
                // ATIVA O BOTÃO
                btnProcessar.disabled = false;
                btnProcessar.style.backgroundColor = "#16a34a";
                btnProcessar.style.cursor = "pointer";
            }
        } catch (err) {
            console.error("Erro na leitura:", err);
            alert("Erro ao processar o arquivo Excel.");
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
    if (dadosParaImportar.length === 0) return;

    const user = auth.currentUser;
    console.log("❌ Usuário:", user);
    console.log("❌ UID:", user?.uid);
    
    if (!user) {
        alert("Você não está logado! Faça login primeiro.");
        return;
    }

    btnProcessar.disabled = true;
    btnProcessar.innerText = "⏳ ENVIANDO EM LOTE...";

    let batch = writeBatch(db);
    let contador = 0;

    try {
        for (const item of dadosParaImportar) {
            console.log("Salvando:", item.id, "Qtd:", item.qtd);
            
            // ✅ USA SUB-COLEÇÃO DO USUÁRIO
            const ref = doc(db, "usuarios", user.uid, "produtos", item.id);
            
            batch.set(ref, {
                codigo: item.id,
                estoque_atual: item.qtd,
                ultima_atualizacao: serverTimestamp()
            }, { merge: true });

            // ✅ MOVIMENTAÇÃO TAMBÉM NA SUB-COLEÇÃO (FORMA CORRETA)
            const movRef = collection(db, "usuarios", user.uid, "movimentacoes");
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
                console.log("Commitando 200 itens...");
                await batch.commit();
                batch = writeBatch(db); 
                contador = 0;
            }
        }

        if (contador > 0) {
            console.log("Commitando últimos " + contador + " itens...");
            await batch.commit();
        }

        console.log("✅ Importação concluída!");
        alert(`🚀 Sucesso! ${dadosParaImportar.length} itens importados.`);
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 2000);

    } catch (error) {
        console.error("❌ ERRO NA IMPORTAÇÃO:", error);
        console.error("Código do erro:", error.code);
        console.error("Mensagem:", error.message);
        alert("Erro ao salvar no Firebase: " + error.message);
        btnProcessar.disabled = false;
        btnProcessar.innerText = "✅ TENTAR NOVAMENTE";
    }
};
