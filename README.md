# LogFlow - Gestão de Estoque

O **LogFlow** é um sistema web de gestão de estoque desenvolvido para registrar movimentações, controlar produtos, analisar consumo e acompanhar a cobertura diária por meio de uma interface responsiva integrada ao Firebase.

## Principais funcionalidades

- Controle de produtos com cadastro, edição, exclusão e pesquisa por nome ou código.
- Registro em tempo real de entradas e saídas de estoque.
- Scanner integrado pela câmera do dispositivo.
- Importação de produtos por XML de nota fiscal.
- Importação de dados por planilhas Excel.
- Dashboard com indicadores, gráficos e relatório anual.
- Paginação controlada com dez produtos por página.
- Registro de auditoria das operações realizadas.
- Autenticação Firebase com dados isolados por usuário.
- Suporte opcional à autenticação em dois fatores.
- Tema claro e escuro com preferência salva no navegador.
- Interface responsiva para celular, tablet e computador.

## Atualizações recentes

### Scanner

- Corrigida a alternância entre abrir e parar o leitor.
- Estados ativo e inativo passam a ser controlados explicitamente.
- A área da câmera é limpa e ocultada ao parar ou concluir uma leitura.
- Melhorado o tratamento de erros e indisponibilidade da câmera.

### Dashboard

- Restaurada a paginação real do dashboard.
- Exibição limitada a dez produtos por página no DOM.
- Corrigidos os cálculos de giro diário e cobertura.
- Dados atualizados automaticamente por listeners canceláveis do Firestore.
- Pesquisa rápida por nome ou código do produto.

### Interface mobile

- Cabeçalho da tabela convertido em cards legíveis no celular.
- Produto e código separados em uma área própria.
- Saldo, giro mensal e cobertura organizados em regiões distintas.
- Status e ações posicionados na linha final dos cards.
- Informações receberam mais espaçamento, padding e divisórias.
- Botões Editar e Excluir empilhados no canto direito.
- Fundo azul aplicado ao botão Editar e vermelho claro ao botão Excluir.
- Rótulo Ações alinhado com os botões na coluna direita.
- Botões ampliados para facilitar o uso em telas pequenas.
- Layout desktop mantido em formato de tabela tradicional.

### Segurança e dados

- Estrutura preparada com regras de segurança por usuário no Firestore.
- Movimentações validam o estoque e registram auditoria na transação.
- Dados isolados em coleções específicas por UID.
- Fluxo de autenticação em dois fatores integrado ao sistema.

## Tecnologias utilizadas

- JavaScript moderno
- HTML5 e CSS3
- Firebase Authentication
- Firebase Firestore
- Firebase Hosting
- Firebase Functions
- Html5Qrcode
- Chart.js
- Papa Parse
- jsPDF

## Estrutura principal

- `dashboard.html` e `dashboard.js`: painel, indicadores, gráficos e cards responsivos.
- `index.html` e `index.js`: scanner e registro de movimentações.
- `importar_xml.js`: leitura e importação de notas fiscais XML.
- `importar_excel.js`: importação de dados por planilhas.
- `auth.js` e `login.js`: autenticação e controle de sessão.
- `2fa.js`: ativação e validação da autenticação em dois fatores.
- `audit-logs.html`: consulta de registros de auditoria.
- `functions/index.js`: operações e serviços do backend Firebase.

## 👨‍💻 Desenvolvedor
**Hilton** Auxiliar de Logística & Estudante de Análise e Desenvolvimento de Sistemas (ADS).