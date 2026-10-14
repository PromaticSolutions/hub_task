# Hub Task Timely

Sistema interno de gerenciamento de tarefas inspirado no Trello: quadro Kanban, lista e calendário, projetos e clientes com cores próprias, equipe, @menções, anexos, histórico de alterações e dashboard.

## Como rodar

Requisitos: Node.js 20 ou superior. Sem configuração extra, os dados ficam no arquivo local `data/db.json`.

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

## Deploy na Vercel com Supabase

Na Vercel não existe disco permanente, então em produção os dados ficam no **Postgres do Supabase** e os anexos no **Storage do Supabase**. O código já está pronto para isso. Você só precisa criar o projeto e configurar três variáveis.

1. **Supabase:** crie um projeto em https://supabase.com. Se a equipe está no Brasil, escolha a região *South America (São Paulo)*. Anote a senha do banco.
2. **Vercel:** em *Add New → Project*, importe o repositório. O `vercel.json` já define o build, a API e as rotas; não precisa mudar nada.
3. **Variáveis de ambiente** (Vercel → *Settings → Environment Variables*):

   | Variável | Onde encontrar no Supabase |
   | --- | --- |
   | `DATABASE_URL` | Botão **Connect** → *Transaction pooler* (porta 6543). Troque `[YOUR-PASSWORD]` pela senha do banco. |
   | `SUPABASE_URL` | *Project Settings → API* → Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | *Project Settings → API* → chave `service_role` (ou *secret key*). Fica só no servidor; nunca coloque no frontend. |

   Se você conectar o Supabase pela integração da Vercel, ela cria `POSTGRES_URL`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sozinha, e o sistema aceita esses nomes.
4. **Região das funções** (Vercel → *Settings → Functions*): escolha a mesma região do Supabase (São Paulo = `gru1`). Com regiões diferentes, cada gravação fica bem mais lenta.
5. Faça o deploy (ou *Redeploy*, se as variáveis foram criadas depois do primeiro deploy). No primeiro acesso, o sistema cria sozinho as tabelas (`members`, `clients`, `projects`, `tasks`, `app_settings`, `app_meta`, com RLS ativado) e o bucket privado `attachments`. Em bancos criados por versões anteriores, as tabelas e colunas novas são adicionadas automaticamente na inicialização, sem alterar os dados existentes.

Para conferir: `https://SEU-SITE.vercel.app/api/health` deve responder `{"ok":true,"storage":"postgres"}`.

### Levar os dados locais para o Supabase

Se você já usou o sistema localmente e quer manter esses dados:

```bash
cp .env.example .env   # preencha DATABASE_URL, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
npm run db:import      # copia data/db.json e data/uploads/ para o Supabase
```

A importação só roda se o banco do Supabase estiver vazio, então nunca sobrescreve dados.

### Desenvolvimento local usando o Supabase

Com um arquivo `.env` preenchido (veja `.env.example`), `npm run dev` passa a usar o Supabase em vez do arquivo local.

### Servidor próprio (um único processo)

```bash
npm run build   # verifica os tipos e gera dist/
npm start       # serve a API e a interface em http://localhost:3001
```

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PORT` | `3001` | Porta da API (e da interface com `npm start`) |
| `DATA_DIR` | `./data` | Pasta do arquivo de dados e dos anexos, quando o Supabase não está configurado |

## Dados

- **Com Supabase** (`DATABASE_URL` definida): tabelas no Postgres e anexos no Storage. Cada gravação roda numa transação com trava, então alterações simultâneas de pessoas diferentes nunca se perdem.
- **Sem Supabase** (desenvolvimento): tudo fica em `data/db.json` e os anexos em `data/uploads/`. As gravações são atômicas (arquivo temporário + renomeação). Se o `db.json` estiver corrompido, o servidor **não inicia**, em vez de sobrescrevê-lo.
- Os anexos vão do navegador direto para o armazenamento, por um link de envio assinado. Por isso o limite é de 25 MB por arquivo, e não o limite de 4,5 MB por requisição da Vercel.
- Backup: **Configurações → Dados → Exportar backup** (JSON). Os arquivos anexados não entram no JSON.
- Na primeira execução o sistema começa vazio. A tela inicial oferece **Carregar dados de exemplo** (só funciona com o sistema vazio).

## Primeiros passos

1. Cadastre os membros da equipe (**Novo membro**).
2. Em **Configurações → Quem é você?**, escolha seu usuário. Como esta versão não tem login, essa escolha fica salva no navegador e é usada em Minhas Tarefas, Pessoais, comentários, menções e no histórico.
3. Cadastre os clientes (**Novo cliente**) e, se quiser separar o trabalho, os projetos (**+** em Projetos, no menu). Depois crie as tarefas.

## Funcionalidades

- **Menu lateral** com grupos recolhíveis: Tarefas (Todas, Minhas, Pessoais, Arquivadas), Visão geral (Dashboard, Onboarding), Projetos, Clientes (ambos com cor, tarefas em aberto e atrasadas, filtro quando há muitos) e Equipe.
- **Projetos**: cada projeto tem nome, cor, cliente opcional, situação (Ativo, Pausado ou Concluído), descrição e um quadro próprio com Kanban, lista e calendário. Tarefas criadas no quadro já entram no projeto (e no cliente dele). Projetos concluídos saem do menu, mas continuam em **Gerenciar projetos → Concluídos**. Para levar tarefas existentes para um projeto, selecione-as (Ctrl+clique) e use **Projeto** na barra de ações em lote.
- **Kanban** com cinco colunas (A Fazer, Em Andamento, Bloqueado, Homologação, Finalizado). Arrastar e soltar com mouse, toque (pressione e segure) e teclado (Espaço para pegar e soltar, setas para mover). Ao trocar de coluna, um aviso oferece **Desfazer**.
- **Lista** com ordenação pelos cabeçalhos, troca de status na própria linha e seleção múltipla.
- **Calendário** mensal: arraste uma tarefa para outro dia para mudar o prazo, ou da bandeja "Sem prazo" para um dia. No celular vira uma agenda.
- **Tarefa completa** em janela: título, descrição com @menções, projeto, cliente, cor, responsável, participantes, prioridade, prazo, visibilidade (equipe/pessoal), etapa de onboarding, anexos, comentários e histórico. As edições só são enviadas ao salvar (Ctrl+S), e apenas os campos alterados, para não sobrescrever mudanças feitas por colegas em outros campos.
- **Histórico** automático de status, responsável, participantes, projeto, prazo, arquivamento e duplicação.
- **Filtros** por cliente, projeto, responsável, status, prioridade, período de entrega e atrasadas; busca por título ou descrição (ignora acentos); ordenação por prazo, prioridade e data de criação. Os filtros ficam na URL, então dá para compartilhar o link de uma visão filtrada.
- **Ações em lote**: Ctrl+clique nos cards (ou as caixas de seleção da lista) para mover, atribuir, colocar em um projeto, arquivar ou excluir várias tarefas.
- **Dashboard** com indicadores, tarefas por status, concluídas por semana, distribuição por cliente, por projeto e por responsável, atrasadas e próximas entregas. Cada barra e indicador abre a lista de tarefas já filtrada; cada gráfico tem uma visualização em tabela.
- **Onboarding de clientes**: gera as tarefas a partir de um modelo de etapas editável em Configurações, com prazos contados a partir da data de início, e mostra o progresso por cliente.
- **Menções**: o sino no topo lista os comentários em que você foi mencionado.
- **Temas claro e escuro** (ou seguindo o sistema). As cores de status foram validadas para daltonismo e contraste nos dois temas.
- **Sincronização**: a cada 15 segundos (e ao voltar para a aba), o app verifica se alguém alterou os dados e atualiza a tela.

Atalhos: `N` nova tarefa · `/` buscar · `V` alternar visualização · `Ctrl+S` salvar tarefa · `Ctrl+Enter` enviar comentário · `Esc` fechar.

### Regras de consistência

- Excluir uma tarefa, um anexo, um comentário, um projeto, um cliente ou um membro sempre pede confirmação.
- Ao remover um **projeto**, suas tarefas continuam existindo, sem projeto.
- Ao remover um **cliente**, suas tarefas continuam existindo, sem cliente e mantendo a cor; os projetos dele ficam sem cliente.
- Ao remover um **membro**, as tarefas dele ficam sem responsável e ele sai dos participantes; as tarefas pessoais dele passam para o quadro da equipe.
- O responsável nunca aparece também como participante.

## Estrutura

```
api/      Função da Vercel (encaminha /api/* para o Express)
server/   API Express
  app.ts          rotas montadas (usado pelo servidor local e pela Vercel)
  domain.ts       regras das tarefas (histórico, participantes, ordem)
  tasks.ts, people.ts   rotas
  store*.ts       armazenamento: Postgres/Supabase ou arquivo local
  files.ts        anexos: Supabase Storage ou disco local
shared/   Tipos e regras usados pelo servidor e pela interface
src/      Interface React
  store/       estado (dados do servidor com atualização otimista; preferências do navegador)
  components/  layout, quadro, lista, calendário, janela da tarefa, formulários, componentes de UI
  pages/       telas
  styles/      tokens de tema e estilos
```

## Limitações desta versão

- **Sem autenticação.** Qualquer pessoa com o link pode ver e alterar tudo, e a identidade escolhida em "Quem é você?" não é verificada. Na Vercel, o site fica público na internet: não compartilhe o endereço fora da equipe. Para restringir o acesso sem mexer no código, dá para usar a *Deployment Protection* da Vercel.
- Tarefas pessoais ficam fora dos quadros da equipe, mas não são privadas no servidor.
- Cada gravação lê os dados atuais e grava em sequência (uma por vez). Isso é simples e seguro para uma equipe pequena; com milhares de tarefas ou muitas pessoas gravando ao mesmo tempo, vale migrar para consultas por tarefa.
