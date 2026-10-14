# Hub Task Timely

Sistema interno de gerenciamento de tarefas inspirado no Trello: quadro Kanban, lista e calendário, clientes com cores próprias, equipe, @menções, anexos, histórico de alterações e dashboard.

## Como rodar

Requisitos: Node.js 20 ou superior.

```bash
npm install
npm run dev
```

- Interface: http://localhost:5173
- API: http://localhost:3001 (o Vite repassa `/api` para ela)

O `npm run dev` abre o navegador sozinho. Deixe o terminal aberto enquanto usa o sistema; `Ctrl+C` encerra.

### Não apareceu nada?

- **Não abra o `index.html` direto** (duplo clique, pré-visualização do editor ou Live Server). Ele precisa ser servido pelo Vite: rode `npm run dev` e use http://localhost:5173.
- **http://localhost:3001 é só a API** durante o desenvolvimento. A interface fica na porta do Vite.
- Se a porta 5173 estiver ocupada, o Vite usa a próxima (5174, 5175…). Use o endereço que aparece na linha `Local:` do terminal.
- Se aparecer `EADDRINUSE` para a porta 3001, já existe outro servidor rodando. Feche-o ou rode com outra porta: `PORT=3002 npm run dev`.

### Produção (um único processo)

```bash
npm run build   # verifica os tipos e gera dist/
npm start       # serve a API e a interface em http://localhost:3001
```

Variáveis de ambiente opcionais:

| Variável   | Padrão   | Uso                                 |
| ---------- | -------- | ----------------------------------- |
| `PORT`     | `3001`   | Porta da API (e da interface em produção) |
| `DATA_DIR` | `./data` | Pasta do banco de dados e dos anexos |

## Dados

- Tudo fica em `data/db.json` (tarefas, clientes, membros, configurações) e os anexos em `data/uploads/`. Os dados são compartilhados por todos que acessam o mesmo servidor.
- As gravações são atômicas (arquivo temporário + renomeação). Se o `db.json` estiver corrompido, o servidor **não inicia** em vez de sobrescrevê-lo.
- Backup: **Configurações → Dados → Exportar backup** (JSON). Os arquivos anexados não entram no JSON; copie também `data/uploads/`.
- Na primeira execução o sistema começa vazio. A tela inicial oferece **Carregar dados de exemplo** (só funciona com o sistema vazio).

## Primeiros passos

1. Cadastre os membros da equipe (**Novo membro**).
2. Em **Configurações → Quem é você?**, escolha seu usuário. Como esta versão não tem login, essa escolha fica salva no navegador e é usada em Minhas Tarefas, Pessoais, comentários, menções e no histórico.
3. Cadastre os clientes (**Novo cliente**) e crie as tarefas.

## Funcionalidades

- **Menu lateral** com grupos recolhíveis: Tarefas (Todas, Minhas, Pessoais, Arquivadas), Visão geral (Dashboard, Onboarding), Clientes (lista com cor, tarefas em aberto e atrasadas, filtro quando há muitos) e Equipe.
- **Kanban** com cinco colunas (A Fazer, Em Andamento, Bloqueado, Homologação, Finalizado). Arrastar e soltar com mouse, toque (pressione e segure) e teclado (Espaço para pegar e soltar, setas para mover). Ao trocar de coluna, um aviso oferece **Desfazer**.
- **Lista** com ordenação pelos cabeçalhos, troca de status na própria linha e seleção múltipla.
- **Calendário** mensal: arraste uma tarefa para outro dia para mudar o prazo, ou da bandeja "Sem prazo" para um dia. No celular vira uma agenda.
- **Tarefa completa** em janela: título, descrição com @menções, cliente, cor, responsável, participantes, prioridade, prazo, visibilidade (equipe/pessoal), etapa de onboarding, anexos, comentários e histórico. As edições só são enviadas ao salvar (Ctrl+S), e apenas os campos alterados, para não sobrescrever mudanças feitas por colegas em outros campos.
- **Histórico** automático de status, responsável, participantes, prazo, arquivamento e duplicação.
- **Filtros** por cliente, responsável, status, prioridade, período de entrega e atrasadas; busca por título ou descrição (ignora acentos); ordenação por prazo, prioridade e data de criação. Os filtros ficam na URL, então dá para compartilhar o link de uma visão filtrada.
- **Ações em lote**: Ctrl+clique nos cards (ou as caixas de seleção da lista) para mover, atribuir, arquivar ou excluir várias tarefas.
- **Dashboard** com indicadores, tarefas por status, concluídas por semana, distribuição por cliente e por responsável, atrasadas e próximas entregas. Cada barra e indicador abre a lista de tarefas já filtrada; cada gráfico tem uma visualização em tabela.
- **Onboarding de clientes**: gera as tarefas a partir de um modelo de etapas editável em Configurações, com prazos contados a partir da data de início, e mostra o progresso por cliente.
- **Menções**: o sino no topo lista os comentários em que você foi mencionado.
- **Temas claro e escuro** (ou seguindo o sistema). As cores de status foram validadas para daltonismo e contraste nos dois temas.
- **Sincronização**: a cada 15 segundos (e ao voltar para a aba), o app verifica se alguém alterou os dados e atualiza a tela.

Atalhos: `N` nova tarefa · `/` buscar · `V` alternar visualização · `Ctrl+S` salvar tarefa · `Ctrl+Enter` enviar comentário · `Esc` fechar.

### Regras de consistência

- Excluir uma tarefa, um anexo, um comentário, um cliente ou um membro sempre pede confirmação.
- Ao remover um **cliente**, suas tarefas continuam existindo, sem cliente e mantendo a cor.
- Ao remover um **membro**, as tarefas dele ficam sem responsável e ele sai dos participantes; as tarefas pessoais dele passam para o quadro da equipe.
- O responsável nunca aparece também como participante.

## Estrutura

```
server/   API Express (db.ts: armazenamento JSON; tasks.ts e people.ts: rotas e regras; sample.ts: dados de exemplo)
shared/   Tipos e regras usados pelo servidor e pela interface
src/      Interface React
  store/       estado (dados do servidor com atualização otimista; preferências do navegador)
  components/  layout, quadro, lista, calendário, janela da tarefa, formulários, componentes de UI
  pages/       telas
  styles/      tokens de tema e estilos
```

## Limitações desta versão

- **Sem autenticação.** Qualquer pessoa com acesso ao servidor pode ver e alterar tudo, e a identidade escolhida em "Quem é você?" não é verificada. Use apenas em rede interna confiável.
- Tarefas pessoais ficam fora dos quadros da equipe, mas não são privadas no servidor.
- O armazenamento em arquivo JSON atende bem uma equipe pequena; para muitos usuários simultâneos ou grandes volumes, migre para um banco de dados.
